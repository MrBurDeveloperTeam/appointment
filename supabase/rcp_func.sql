-- =========================================================
-- SUPABASE OTP + RESEND via pg_net (NO EDGE FUNCTIONS)
-- One-shot setup: secrets + helpers + RPCs + wrappers
-- =========================================================

-- 0) Ensure schemas exist
create schema if not exists private;

-- 1) Ensure extensions exist (you said enabled, but safe to keep)
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;

-- 2) Secrets table (DB-only)
create table if not exists private.secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current
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

-- Lock down secrets table
revoke all on table private.secrets from public;
revoke all on table private.secrets from anon;
revoke all on table private.secrets from authenticated;

-- 3) Secret getter (SECURITY DEFINER)
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

-- 4) Insert/Upsert your Resend key here (EDIT THIS!)
insert into private.secrets (key, value)
values ('RESEND_API_KEY', 'PUT_YOUR_RESEND_API_KEY_HERE')
on conflict (key) do update set value = excluded.value;

-- 5) (Optional) remove ambiguous overloads if you created them earlier
-- IMPORTANT: we keep uuid versions + *_text wrappers only.
drop function if exists public.booking_request_otp(text, text);
drop function if exists public.booking_verify_otp(text, text, text);

-- 6) Main OTP request function (UUID)
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
  v_last public.booking_otps%rowtype;
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
  from public.booking_otps
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

  insert into public.booking_otps (
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
      'from', 'Snabbb <noreply@snabbb.com>',
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

-- 7) Verify OTP function (UUID)
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
  v_row public.booking_otps%rowtype;
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
  from public.booking_otps
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
    update public.booking_otps
    set attempts = attempts + 1
    where id = v_row.id;

    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.booking_otps
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

  insert into public.booking_verifications (
    clinic_id, email, verified_at, expires_at, token_hash
  ) values (
    p_clinic_id, v_email, v_now, v_token_expires, v_token_hash
  );

  return jsonb_build_object('ok', true, 'token', v_token, 'token_expires_at', v_token_expires);
end;
$$;

-- 8) TEXT wrappers (these are what your frontend should call)
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

-- 9) Grants: allow anon/authenticated to call only the public RPCs & wrappers
grant execute on function public.booking_request_otp(uuid, text) to anon, authenticated;
grant execute on function public.booking_verify_otp(uuid, text, text) to anon, authenticated;
grant execute on function public.booking_request_otp_text(text, text) to anon, authenticated;
grant execute on function public.booking_verify_otp_text(text, text, text) to anon, authenticated;

-- 10) Reload PostgREST schema cache so /rpc endpoints appear immediately
notify pgrst, 'reload schema';
