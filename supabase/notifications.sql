-- supabase/notifications.sql
-- =========================================================
-- REQUEST LIFECYCLE EMAILS + PUBLIC BUSY-SLOTS RPC
-- Requires: pg_net, private.send_email_internal (reminders.sql),
--           private.get_secret (rcp_func.sql)
-- Applied manually to Supabase.
-- =========================================================

-- ---------- Item 2: "Booking received" ----------
create or replace function public.send_request_received()
returns trigger
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_email text := coalesce(new.email, new.lookup_email);
  v_date  text := coalesce(new.appointment_date::text, (new.preferred_dates)[1]::text, '');
  v_time  text := coalesce(new.appointment_start_time, (new.preferred_times)[1], '');
begin
  if v_email is not null and v_email like '%@%' then
    perform private.send_email_internal(
      v_email::text,
      'We received your booking request'::text,
      format(
        '<p>Hello %s,</p><p>We have received your appointment request for <b>%s at %s</b>.</p><p>Your request is pending review by the clinic. We will email you once it is confirmed.</p>',
        coalesce(new.patient_name, 'there'), v_date, v_time
      )::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_request_received on public.appointment_requests;
create trigger trg_request_received
after insert on public.appointment_requests
for each row
execute function public.send_request_received();

-- ---------- Item 2: "Declined" ----------
create or replace function public.send_request_declined()
returns trigger
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_email text := coalesce(new.email, new.lookup_email);
  v_date  text := coalesce(new.appointment_date::text, (new.preferred_dates)[1]::text, '');
  v_time  text := coalesce(new.appointment_start_time, (new.preferred_times)[1], '');
begin
  if new.status = 'declined'
     and old.status is distinct from 'declined'
     and v_email is not null
     and v_email like '%@%' then
    perform private.send_email_internal(
      v_email::text,
      'Update on your booking request'::text,
      format(
        '<p>Hello %s,</p><p>Unfortunately we were unable to accommodate your requested appointment for <b>%s at %s</b>.</p><p>Please contact the clinic to arrange an alternative time.</p>',
        coalesce(new.patient_name, 'there'), v_date, v_time
      )::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_request_declined on public.appointment_requests;
create trigger trg_request_declined
after update of status on public.appointment_requests
for each row
execute function public.send_request_declined();

notify pgrst, 'reload schema';
