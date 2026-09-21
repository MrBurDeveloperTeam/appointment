-- =========================================================
-- SUPERBASE SCHEMA (Consolidated)
-- =========================================================

-- 1. EXTENSIONS & SCHEMAS
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;
create schema if not exists private;

-- 2. PRIVATE SECRETS (for OTP)
create table if not exists private.secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger for secrets updated_at
create or replace function private.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_private_secrets_updated_at on private.secrets;
create trigger trg_private_secrets_updated_at
before update on private.secrets
for each row
execute function private.tg_set_updated_at();

-- Lock down secrets
revoke all on table private.secrets from public;
revoke all on table private.secrets from anon;
revoke all on table private.secrets from authenticated;

-- Secret getter
create or replace function private.get_secret(p_key text)
returns text
language sql
security definer
set search_path = private, public, extensions
as $$
  select s.value
  from private.secrets s
  where s.key = p_key
  limit 1;
$$;

revoke all on function private.get_secret(text) from public;
revoke all on function private.get_secret(text) from anon;
revoke all on function private.get_secret(text) from authenticated;

-- 3. TABLES
-- Note: 'clinics', 'staff', 'patients', etc are renamed to 'apt_clinics', etc.
-- 'profiles', 'appointments', 'appointment_requests' retain original names.

CREATE TABLE public.apt_clinics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  name text NOT NULL,
  city text,
  plan text,
  status text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  slug text UNIQUE,
  CONSTRAINT clinics_pkey PRIMARY KEY (id)
);

CREATE TABLE public.profiles (
  user_id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  name text,
  account_type text CHECK (account_type = ANY (ARRAY['individual'::text, 'company'::text, 'admin'::text])),
  phone text,
  position text,
  company_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  avatar_url text,
  background_url text,
  clinic_id uuid, -- No FK constraint explicit in new_schema.sql, leaving as is
  status text DEFAULT 'active'::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.apt_staff (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  role text NOT NULL,
  name text NOT NULL,
  phone text,
  color text,
  specialty text,
  working_days ARRAY NOT NULL DEFAULT '{}'::integer[],
  start_time text,
  end_time text,
  assigned_to uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT staff_pkey PRIMARY KEY (id),
  CONSTRAINT staff_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id),
  CONSTRAINT staff_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.apt_staff(id)
);

CREATE TABLE public.apt_patients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  clinic_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  id_number text,
  address text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  dob date,
  gender text,
  tax_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  allergies text,
  medical_conditions text,
  medications text,
  source text,
  preferred_dentist_id uuid,
  insurance text,
  notes text,
  CONSTRAINT patients_pkey PRIMARY KEY (id),
  CONSTRAINT patients_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id),
  CONSTRAINT patients_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT patients_preferred_dentist_id_fkey FOREIGN KEY (preferred_dentist_id) REFERENCES public.apt_staff(id)
);

CREATE TABLE public.apt_rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id)
);

CREATE TABLE public.apt_treatments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  name text NOT NULL,
  duration integer,
  color text,
  supplies_needed ARRAY NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT treatments_pkey PRIMARY KEY (id),
  CONSTRAINT treatments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id)
);

CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  patient_id uuid,
  dentist_id uuid,
  room_id uuid,
  treatment_id uuid,
  date date NOT NULL,
  start_time text NOT NULL,
  end_time text,
  duration integer,
  status text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id),
  CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.apt_patients(id),
  CONSTRAINT appointments_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES public.apt_staff(id),
  CONSTRAINT appointments_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.apt_rooms(id),
  CONSTRAINT appointments_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.apt_treatments(id)
);

CREATE TABLE public.apt_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE,
  clinic_name text,
  working_hours_start text,
  working_hours_end text,
  slot_duration integer,
  rest_days ARRAY NOT NULL DEFAULT '{}'::integer[],
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (id),
  CONSTRAINT settings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id)
);

CREATE TABLE public.apt_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  type text,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT holidays_pkey PRIMARY KEY (id),
  CONSTRAINT holidays_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id)
);

CREATE TABLE public.apt_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid,
  type text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id)
);

CREATE TABLE public.apt_booking_otps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  email text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  resend_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamp with time zone,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT booking_otps_pkey PRIMARY KEY (id),
  CONSTRAINT booking_otps_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id)
);

CREATE TABLE public.apt_booking_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  email text NOT NULL,
  verified_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  token_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT booking_verifications_pkey PRIMARY KEY (id),
  CONSTRAINT booking_verifications_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id)
);

CREATE TABLE public.appointment_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  patient_name text NOT NULL,
  phone text,
  email text,
  preferred_dates ARRAY NOT NULL DEFAULT '{}'::date[],
  preferred_times ARRAY NOT NULL DEFAULT '{}'::text[],
  notes text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  patient_id_number text,
  patient_dob date,
  patient_gender text,
  patient_tax_number text,
  patient_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  allergies text,
  medical_conditions text,
  medications text,
  source text,
  preferred_dentist_id uuid,
  insurance text,
  patient_notes text,
  appointment_date date,
  appointment_start_time text,
  appointment_duration integer,
  appointment_treatment_id uuid,
  appointment_notes text,
  is_new_patient boolean DEFAULT true,
  lookup_email text,
  is_existing_verified boolean NOT NULL DEFAULT false,
  verification_id uuid,
  verification_email text,
  CONSTRAINT appointment_requests_pkey PRIMARY KEY (id),
  CONSTRAINT appointment_requests_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id),
  CONSTRAINT appointment_requests_preferred_dentist_id_fkey FOREIGN KEY (preferred_dentist_id) REFERENCES public.apt_staff(id),
  CONSTRAINT appointment_requests_appointment_treatment_id_fkey FOREIGN KEY (appointment_treatment_id) REFERENCES public.apt_treatments(id),
  CONSTRAINT appointment_requests_verification_id_fkey FOREIGN KEY (verification_id) REFERENCES public.apt_booking_verifications(id)
);

CREATE TABLE public.apt_clinic_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'dentist'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clinic_members_pkey PRIMARY KEY (id),
  CONSTRAINT clinic_members_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.apt_clinics(id),
  CONSTRAINT clinic_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);


-- =========================================================
-- 4. SYNCHRONIZATION TRIGGERS
-- =========================================================

-- Trigger function to sync clinics -> settings
CREATE OR REPLACE FUNCTION public.sync_clinic_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent infinite loop by checking if we are already inside a trigger chain
  IF pg_trigger_depth() <= 1 AND NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.apt_settings 
    SET clinic_name = NEW.name
    WHERE clinic_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger for clinics -> settings
DROP TRIGGER IF EXISTS trg_sync_clinic_name ON public.apt_clinics;
CREATE TRIGGER trg_sync_clinic_name
AFTER UPDATE OF name ON public.apt_clinics
FOR EACH ROW
EXECUTE FUNCTION public.sync_clinic_name();


-- Trigger function to sync settings -> clinics
CREATE OR REPLACE FUNCTION public.sync_settings_clinic_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent infinite loop by checking if we are already inside a trigger chain
  IF pg_trigger_depth() <= 1 AND NEW.clinic_name IS DISTINCT FROM OLD.clinic_name THEN
    UPDATE public.apt_clinics
    SET name = NEW.clinic_name
    WHERE id = NEW.clinic_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger for settings -> clinics
DROP TRIGGER IF EXISTS trg_sync_settings_clinic_name ON public.apt_settings;
CREATE TRIGGER trg_sync_settings_clinic_name
AFTER UPDATE OF clinic_name ON public.apt_settings
FOR EACH ROW
EXECUTE FUNCTION public.sync_settings_clinic_name();


-- =========================================================
-- 5. HELPER FUNCTIONS
-- =========================================================

-- current_clinic_id() refs profiles
create or replace function public.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select clinic_id from public.profiles where user_id = auth.uid();
$$;

-- handle_new_user() refs profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  user_name text;
  new_clinic_name text;
  new_clinic_id uuid;
begin
  user_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1),
    'New User'
  );
  new_clinic_name := user_name || '''s Clinic';
  
  -- Create a new clinic for this user
  insert into public.apt_clinics (name)
  values (new_clinic_name)
  returning id into new_clinic_id;

  -- Insert basic clinic settings
  insert into public.apt_settings (clinic_id, clinic_name)
  values (new_clinic_id, new_clinic_name);
  
  -- Record the user as a clinic member (owner/admin)
  insert into public.apt_clinic_members (clinic_id, user_id, role)
  values (new_clinic_id, new.id, 'admin');

  -- Create the user profile and assign to the new clinic
  insert into public.profiles (
    user_id,
    email,
    name,
    account_type,
    phone,
    position,
    company_name,
    clinic_id,
    status
  )
  values (
    new.id,
    new.email,
    user_name,
    coalesce(nullif(new.raw_user_meta_data->>'account_type', ''), 'individual'),
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    nullif(trim(new.raw_user_meta_data->>'position'), ''),
    case
      when coalesce(new.raw_user_meta_data->>'account_type', 'individual') = 'company'
        then nullif(trim(new.raw_user_meta_data->>'company_name'), '')
      else null
    end,
    new_clinic_id,
    'active'
  )
  on conflict (user_id) do update set
    email = excluded.email,
    name = excluded.name,
    account_type = excluded.account_type,
    phone = excluded.phone,
    position = excluded.position,
    company_name = excluded.company_name,
    updated_at = now();
  
  return new;
end;
$$;


-- 5. OTP FUNCTIONS

-- booking_request_otp refs apt_booking_otps
create or replace function public.booking_request_otp(
  p_clinic_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_key text;
  v_code text;
  v_hash text;
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '10 minutes';
  v_last public.apt_booking_otps%rowtype;
  v_resp jsonb;
begin
  if p_clinic_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_clinic');
  end if;

  if v_email is null or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select *
  into v_last
  from public.apt_booking_otps
  where clinic_id = p_clinic_id
    and email = v_email
  order by created_at desc
  limit 1;

  if v_last.id is not null
     and v_last.last_sent_at is not null
     and v_last.last_sent_at > (v_now - interval '60 seconds') then
    return jsonb_build_object('ok', false, 'error', 'cooldown', 'retry_after_seconds', 60);
  end if;

  v_code := lpad(((floor(random() * 900000) + 100000)::int)::text, 6, '0');

  v_hash := encode(
    extensions.digest(
      convert_to(p_clinic_id::text || ':' || v_email || ':' || v_code, 'utf8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.apt_booking_otps (
    clinic_id, email, otp_hash, expires_at, attempts, max_attempts, resend_count, last_sent_at
  ) values (
    p_clinic_id, v_email, v_hash, v_expires, 0, 5,
    coalesce(v_last.resend_count, 0) + 1,
    v_now
  );

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
      'from', 'Resend <onboarding@resend.dev>',
      'to', jsonb_build_array(v_email),
      'subject', 'Your booking verification code',
      'html', format(
        '<p>Your verification code is <b>%s</b>.</p><p>This code expires in 10 minutes.</p>',
        v_code
      )
    )
  );

  return jsonb_build_object('ok', true, 'expires_at', v_expires, 'provider', v_resp);
end;
$$;


-- booking_verify_otp refs apt_booking_otps and apt_booking_verifications
create or replace function public.booking_verify_otp(
  p_clinic_id uuid,
  p_email text,
  p_otp text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_code text := regexp_replace(coalesce(p_otp,''), '\D', '', 'g');
  v_now timestamptz := now();
  v_row public.apt_booking_otps%rowtype;
  v_hash text;

  v_token text;
  v_token_hash text;
  v_token_expires timestamptz := v_now + interval '30 minutes';
begin
  if p_clinic_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_clinic');
  end if;

  if v_email is null or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  end if;

  select *
  into v_row
  from public.apt_booking_otps
  where clinic_id = p_clinic_id
    and email = v_email
    and verified_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_pending_otp');
  end if;

  if v_row.expires_at <= v_now then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if v_row.attempts >= v_row.max_attempts then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(p_clinic_id::text || ':' || v_email || ':' || v_code, 'utf8'),
      'sha256'
    ),
    'hex'
  );

  if v_hash <> v_row.otp_hash then
    update public.apt_booking_otps
    set attempts = attempts + 1
    where id = v_row.id;

    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.apt_booking_otps
  set verified_at = v_now
  where id = v_row.id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  v_token_hash := encode(
    extensions.digest(
      convert_to(p_clinic_id::text || ':' || v_email || ':' || v_token, 'utf8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.apt_booking_verifications (
    clinic_id, email, verified_at, expires_at, token_hash
  ) values (
    p_clinic_id, v_email, v_now, v_token_expires, v_token_hash
  );

  return jsonb_build_object('ok', true, 'token', v_token, 'token_expires_at', v_token_expires);
end;
$$;

-- TEXT wrappers (for frontend)
create or replace function public.booking_request_otp_text(
  p_clinic_id text,
  p_email text
) returns jsonb
language sql
security definer
set search_path = private, public, extensions
as $$
  select public.booking_request_otp(p_clinic_id::uuid, p_email::text);
$$;

create or replace function public.booking_verify_otp_text(
  p_clinic_id text,
  p_email text,
  p_otp text
) returns jsonb
language sql
security definer
set search_path = private, public, extensions
as $$
  select public.booking_verify_otp(p_clinic_id::uuid, p_email::text, p_otp::text);
$$;

-- 6. GRANTS
grant execute on function public.booking_request_otp(uuid, text) to anon, authenticated;
grant execute on function public.booking_verify_otp(uuid, text, text) to anon, authenticated;
grant execute on function public.booking_request_otp_text(text, text) to anon, authenticated;
grant execute on function public.booking_verify_otp_text(text, text, text) to anon, authenticated;

-- Reload
notify pgrst, 'reload schema';
