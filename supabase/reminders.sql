-- =========================================================
-- EMAIL REMINDERS & CONFIRMATIONS (IMMEDIATE + 1 DAY BEFORE)
-- Requires: pg_net, pg_cron, and existing setup from rcp_func.sql
-- =========================================================

-- 1) Helper to send generic email via Resend
-- This is a private helper to avoid duplicating code.
-- It assumes private.get_secret is available (from rcp_func.sql).
create or replace function private.send_email_internal(
  p_to text,
  p_subject text,
  p_html_body text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_key text;
  v_resp jsonb;
begin
  v_key := private.get_secret('RESEND_API_KEY');
  if v_key is null or length(v_key) < 10 then
    return jsonb_build_object('ok', false, 'error', 'missing_resend_key');
  end if;

  v_resp := net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Appointments <appointments@snabbb.com>',
      'to', jsonb_build_array(p_to),
      'subject', p_subject,
      'html', p_html_body
    )
  );

  return v_resp;
end;
$$;

-- 2) Function to send CONFIRMATION email (Immediate)
create or replace function public.send_appointment_confirmation(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_email text;
  v_date  text;
  v_time  text;
  v_name  text;
  v_clinic text;
begin
  select
    p.email,
    a.date::text,
    a.start_time::text,
    p.name,
    c.name
  into v_email, v_date, v_time, v_name, v_clinic
  from public.appointments a
  join public.apt_patients p on a.patient_id = p.id
  left join public.apt_clinics c on a.clinic_id = c.id
  where a.id = p_appointment_id;

  if v_email is not null and v_email like '%@%' then
    perform private.send_email_internal(
      v_email::text,
      ('Appointment Confirmed' || coalesce(' - ' || v_clinic, ''))::text,
      format(
        '<p>Hello %s,</p><p>Your appointment at <b>%s</b> has been confirmed for <b>%s at %s</b>.</p><p>See you then!</p>',
        v_name, coalesce(v_clinic, 'the clinic'), v_date, v_time
      )::text
    );
  end if;
end;
$$;

-- 3) Trigger for IMMEDIATE usage
-- Fires after INSERT on appointments table
create or replace function public.trigger_send_confirmation()
returns trigger
language plpgsql
security definer
set search_path = private, public, extensions
as $$
begin
  if new.status = 'confirmed' then
    perform public.send_appointment_confirmation(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointment_confirmation on public.appointments;
create trigger trg_appointment_confirmation
after insert on public.appointments
for each row
execute function public.trigger_send_confirmation();


-- 4) Function to send REMINDER email (Scheduled)
create or replace function public.send_appointment_reminder(p_appointment_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_email text;
  v_date text;
  v_time text;
  v_name text;
begin
  select 
    p.email, 
    a.date, 
    a.start_time, 
    p.name
  into v_email, v_date, v_time, v_name
  from public.appointments a
  join public.apt_patients p on a.patient_id = p.id
  where a.id = p_appointment_id;

  if v_email is not null and v_email like '%@%' then
    perform private.send_email_internal(
      v_email,
      'Appointment Reminder: Tomorrow',
      format(
        '<p>Hello %s,</p><p>This is a reminder for your appointment tomorrow, <b>%s at %s</b>.</p>',
        v_name, v_date, v_time
      )
    );
  end if;
end;
$$;

-- 5) Batch process for "Tomorrow's" appointments
create or replace function public.process_daily_reminders()
returns void
language plpgsql
security definer
as $$
declare
  r record;
  v_tomorrow text;
begin
  -- Calculate tomorrow's date string YYYY-MM-DD
  -- Adjust timezone as needed, defaulting to UTC or server time
  v_tomorrow := to_char(now() + interval '1 day', 'YYYY-MM-DD');

  for r in (
    select id 
    from public.appointments 
    where date = v_tomorrow 
      and status = 'confirmed'
  ) loop
    perform public.send_appointment_reminder(r.id);
  end loop;
end;
$$;

-- 6) Schedule with pg_cron (Daily at 8:00 AM)
-- Only runs if pg_cron is enabled
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Schedule daily reminder check at 08:00
    perform cron.schedule(
      'daily-appointment-reminders',
      '0 8 * * *', 
      $$select public.process_daily_reminders()$$
    );
  end if;
exception when others then
  raise notice 'pg_cron not available or permission denied';
end;
$$;
