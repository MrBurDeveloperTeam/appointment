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
  v_email  text := coalesce(new.email, new.lookup_email);
  v_date   text := coalesce(new.appointment_date::text, (new.preferred_dates)[1]::text, '');
  v_time   text := coalesce(new.appointment_start_time, (new.preferred_times)[1], '');
  v_clinic text;
begin
  select c.name into v_clinic from public.apt_clinics c where c.id = new.clinic_id;

  if v_email is not null and v_email like '%@%' then
    perform private.send_email_internal(
      v_email::text,
      ('We received your booking request' || coalesce(' - ' || v_clinic, ''))::text,
      format(
        '<p>Hello %s,</p><p>We have received your appointment request at <b>%s</b> for <b>%s at %s</b>.</p><p>Your request is pending review by the clinic. We will email you once it is confirmed.</p>',
        coalesce(new.patient_name, 'there'), coalesce(v_clinic, 'the clinic'), v_date, v_time
      )::text,
      (coalesce(v_clinic, 'Appointments') || ' <appointments@snabbb.com>')::text
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
  v_email  text := coalesce(new.email, new.lookup_email);
  v_date   text := coalesce(new.appointment_date::text, (new.preferred_dates)[1]::text, '');
  v_time   text := coalesce(new.appointment_start_time, (new.preferred_times)[1], '');
  v_clinic text;
begin
  if new.status = 'declined'
     and old.status is distinct from 'declined'
     and v_email is not null
     and v_email like '%@%' then
    select c.name into v_clinic from public.apt_clinics c where c.id = new.clinic_id;
    perform private.send_email_internal(
      v_email::text,
      ('Update on your booking request' || coalesce(' - ' || v_clinic, ''))::text,
      format(
        '<p>Hello %s,</p><p>Unfortunately <b>%s</b> was unable to accommodate your requested appointment for <b>%s at %s</b>.</p><p>Please contact the clinic to arrange an alternative time.</p>',
        coalesce(new.patient_name, 'there'), coalesce(v_clinic, 'the clinic'), v_date, v_time
      )::text,
      (coalesce(v_clinic, 'Appointments') || ' <appointments@snabbb.com>')::text
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

-- ---------- Booking request expired ----------
create or replace function public.send_request_expired()
returns trigger
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_email text := coalesce(new.email, new.lookup_email);
  v_date text := coalesce(
    new.appointment_date::text,
    (new.preferred_dates)[1]::text,
    ''
  );
  v_time text := coalesce(
    new.appointment_start_time,
    (new.preferred_times)[1],
    ''
  );
  v_clinic text;
  v_slug text;
  v_booking_url text;
begin
  if new.status = 'expired'
     and old.status is distinct from 'expired'
     and v_email is not null
     and v_email like '%@%' then

    select c.name, c.slug
    into v_clinic, v_slug
    from public.apt_clinics c
    where c.id = new.clinic_id;

    v_clinic := coalesce(v_clinic, 'the clinic');

    v_booking_url := case
      when nullif(trim(v_slug), '') is not null
        then 'https://appointment.snabbb.com/book/' || trim(v_slug)
      else 'https://appointment.snabbb.com'
    end;

    perform private.send_email_internal(
      v_email::text,
      (
        'Your booking request has expired' ||
        coalesce(' - ' || v_clinic, '')
      )::text,
      format(
        '<p>Hello %s,</p>
        <p>Your appointment request at <b>%s</b> for
        <b>%s at %s</b> has expired because the requested
        appointment time has passed.</p>

        <p>No appointment was confirmed.</p>

        <p>Please choose a new future date and time by
        clicking the button below.</p>

        <table
          role="presentation"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="margin:26px 0;"
        >
          <tr>
            <td
              bgcolor="#76BFBA"
              style="
                background-color:#76BFBA;
                border:1px solid #579E99;
                border-bottom:5px solid #39736F;
                border-radius:10px;
                box-shadow:0 8px 18px
                  rgba(57,115,111,0.28);
                text-align:center;
              "
            >
              <a
                href="%s"
                target="_blank"
                style="
                  display:inline-block;
                  padding:13px 24px;
                  color:#000000;
                  font-family:Arial,sans-serif;
                  font-size:15px;
                  font-weight:700;
                  line-height:20px;
                  letter-spacing:0.2px;
                  text-decoration:none;
                  text-shadow:0 1px 1px
                    rgba(255,255,255,0.28);
                  border-radius:10px;
                  white-space:nowrap;
                "
              >
                Book another appointment
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size:13px;color:#64748b;">
          If the button does not work, open this link:
          <br>
          <a href="%s">%s</a>
        </p>',
        coalesce(new.patient_name, 'there'),
        v_clinic,
        v_date,
        v_time,
        v_booking_url,
        v_booking_url,
        v_booking_url
      )::text,
      (
        v_clinic ||
        ' <appointments@snabbb.com>'
      )::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_request_expired
on public.appointment_requests;

create trigger trg_request_expired
after update of status
on public.appointment_requests
for each row
execute function public.send_request_expired();

-- ---------- Item 3a: public busy-slots (no patient data exposed) ----------
create or replace function public.booking_busy_slots(
  p_clinic_id uuid,
  p_date date
)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'capacity',
      greatest(1, (
        select count(*) from public.apt_staff s
        where s.clinic_id = p_clinic_id and s.role = 'dentist'
      ))::int,
    'busy',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'start_time', a.start_time,
          'end_time', coalesce(a.end_time,
            to_char(((a.start_time)::time + make_interval(mins => coalesce(a.duration, 30))), 'HH24:MI'))
        ))
        from public.appointments a
        where a.clinic_id = p_clinic_id
          and a.date = p_date
          and a.status = 'confirmed'
      ), '[]'::jsonb)
  );
$$;

-- Text wrapper for PostgREST uuid-cast safety (matches OTP RPC convention)
create or replace function public.booking_busy_slots_text(
  p_clinic_id text,
  p_date text
)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select public.booking_busy_slots(p_clinic_id::uuid, p_date::date);
$$;

grant execute on function public.booking_busy_slots(uuid, date) to anon, authenticated;
grant execute on function public.booking_busy_slots_text(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
