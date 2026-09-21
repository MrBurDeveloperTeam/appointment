# Booking Validation, Notifications & Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public new-patient booking form's core fields compulsory and format-validated; email patients at each request lifecycle moment (received / confirmed / declined); and make the public calendar hide slots only when all dentists are busy while letting doctors deliberately overbook after a warning.

**Architecture:** Approach A (database-centric). Frontend changes are pure helpers + wiring in two existing React components (`PublicBookingView.jsx`, `RequestsView.jsx`), extracted into small testable utility modules. Backend changes are `SECURITY DEFINER` Postgres functions/triggers in one new `supabase/notifications.sql`, reusing `private.send_email_internal` and the OTP-RPC conventions already in the repo.

**Tech Stack:** React 18 (JSX), Vite, Vitest + jsdom + @testing-library, Supabase JS (`supabase.rpc`), Postgres (`pg_net` + Resend), `date-fns`.

## Global Constraints

- Build tool: Vite; tests run via `npm test` (Vitest, `globals: true`, `environment: 'jsdom'`). Single file: `npx vitest run <path>`.
- No TypeScript type-checking step exists; new frontend logic goes in `.js`/`.jsx` (not `.ts`).
- DB has **no migration tooling** — all SQL is applied manually to Supabase; end SQL files with `notify pgrst, 'reload schema';`.
- New SQL depends on `private.send_email_internal(p_to, p_subject, p_html_body)` from `supabase/reminders.sql` and `private.get_secret` from `supabase/rcp_func.sql`.
- Public booking page is **unauthenticated (anon)** — it must never read `appointments`/`apt_patients` rows directly; only call RPCs that return non-sensitive data. Grant new public RPCs to `anon, authenticated`.
- camelCase in JS, snake_case in DB (existing convention).
- Times are text `HH:MM`; dates are `YYYY-MM-DD`; `addMinutes(time, mins)` (from `src/utils/time.js`) returns `HH:MM`. No timezone math.
- Required new-patient fields: Name, IC/ID, DOB, Gender, Phone, Email, Address, Emergency Contact Name, Emergency Contact Phone, Source, Preferred Dentist. Optional: Tax Number, Allergies, Medical Conditions, Medications, Insurance, Notes.
- IC/ID = exactly 12 digits. Phone = digits/`+`/space, ≥ 7 digits. DOB ≤ today. Name = letters/space/hyphen/apostrophe only.
- Capacity = count of `apt_staff` with `role='dentist'`; floor to 1 if zero. A slot is hidden publicly when overlapping **confirmed** appts ≥ capacity. Overlap is full-interval. Unassigned confirmed appts each count as 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/bookingValidation.js` (**new**) | Pure validators + sanitizers for the new-patient form (Item 1). |
| `src/utils/bookingValidation.test.js` (**new**) | Unit tests for the above. |
| `src/utils/availability.js` (**new**) | Pure helpers: interval overlap + capacity-based slot filtering (Item 3). |
| `src/utils/availability.test.js` (**new**) | Unit tests for the above. |
| `src/components/PublicBookingView.jsx` (**modify**) | Wire validators (Item 1) + busy-slot fetch & filtered slots (Item 3a). |
| `src/components/RequestsView.jsx` (**modify**) | Conflict detection + inline overbook prompt (Item 3b). |
| `supabase/notifications.sql` (**new**) | `send_request_received` + `send_request_declined` triggers (Item 2) and `booking_busy_slots` RPC + text wrapper (Item 3a). |

Order: utilities first (Tasks 1, 4, 6 are pure + TDD-friendly), then component wiring (Tasks 2, 5, 7), then SQL (Tasks 3, 8). SQL tasks are last because they're integration-verified manually.

---

## Task 1: New-patient validation utility (Item 1 logic)

**Files:**
- Create: `src/utils/bookingValidation.js`
- Test: `src/utils/bookingValidation.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sanitizeIC(value: string): string` — digits only, max 12 chars.
  - `sanitizePhone(value: string): string` — keeps `[0-9+ ]` only.
  - `sanitizeName(value: string): string` — keeps letters, space, hyphen, apostrophe.
  - `REQUIRED_NEW_PATIENT_FIELDS: string[]` — the required field keys.
  - `validateNewPatient(patient: object): { ok: boolean, fieldErrors: Record<string,string> }`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/utils/bookingValidation.test.js
import { describe, it, expect } from 'vitest';
import {
  sanitizeIC,
  sanitizePhone,
  sanitizeName,
  validateNewPatient,
  REQUIRED_NEW_PATIENT_FIELDS,
} from './bookingValidation';

const validPatient = {
  name: 'Jane Doe',
  idNumber: '900101145678',
  dob: '1990-01-01',
  gender: 'female',
  phone: '+60 12 345 6789',
  email: 'jane@example.com',
  address: '12 Jalan Besar',
  emergencyContactName: 'John Doe',
  emergencyContactPhone: '0123456789',
  source: 'google',
  preferredDentist: 'dentist-uuid-1',
  taxNumber: '',
  allergies: '',
  medicalConditions: '',
  medications: '',
  insurance: '',
  notes: '',
};

describe('sanitizers', () => {
  it('sanitizeIC strips letters and caps at 12 digits', () => {
    expect(sanitizeIC('90a01-01b145678999')).toBe('900101145678');
  });
  it('sanitizePhone keeps digits plus and spaces only', () => {
    expect(sanitizePhone('+60 12-(345)')).toBe('+60 12345');
  });
  it('sanitizeName strips digits and symbols', () => {
    expect(sanitizeName("Anne-Marie O'Neil 3!")).toBe("Anne-Marie O'Neil ");
  });
});

describe('validateNewPatient', () => {
  it('passes a fully valid patient', () => {
    const { ok, fieldErrors } = validateNewPatient(validPatient);
    expect(ok).toBe(true);
    expect(fieldErrors).toEqual({});
  });

  it('flags every empty required field', () => {
    const { ok, fieldErrors } = validateNewPatient({});
    expect(ok).toBe(false);
    for (const f of REQUIRED_NEW_PATIENT_FIELDS) {
      expect(fieldErrors[f]).toBeTruthy();
    }
  });

  it('rejects IC that is not exactly 12 digits', () => {
    expect(validateNewPatient({ ...validPatient, idNumber: '12345' }).fieldErrors.idNumber).toBeTruthy();
    expect(validateNewPatient({ ...validPatient, idNumber: '9001011456789' }).fieldErrors.idNumber).toBeTruthy();
  });

  it('rejects phone shorter than 7 digits', () => {
    expect(validateNewPatient({ ...validPatient, phone: '12345' }).fieldErrors.phone).toBeTruthy();
  });

  it('rejects invalid email', () => {
    expect(validateNewPatient({ ...validPatient, email: 'not-an-email' }).fieldErrors.email).toBeTruthy();
  });

  it('rejects a future DOB', () => {
    expect(validateNewPatient({ ...validPatient, dob: '3000-01-01' }).fieldErrors.dob).toBeTruthy();
  });

  it('rejects a name containing digits', () => {
    expect(validateNewPatient({ ...validPatient, name: 'Jane3' }).fieldErrors.name).toBeTruthy();
  });

  it('allows optional fields to be empty', () => {
    const { ok } = validateNewPatient({ ...validPatient, taxNumber: '', insurance: '', notes: '' });
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/bookingValidation.test.js`
Expected: FAIL — `Failed to resolve import "./bookingValidation"`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/bookingValidation.js
import { todayISO } from './date';

export const sanitizeIC = (value) => (value || '').replace(/\D/g, '').slice(0, 12);

export const sanitizePhone = (value) => (value || '').replace(/[^0-9+ ]/g, '');

export const sanitizeName = (value) => (value || '').replace(/[^\p{L} '-]/gu, '');

export const REQUIRED_NEW_PATIENT_FIELDS = [
  'name',
  'idNumber',
  'dob',
  'gender',
  'phone',
  'email',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'source',
  'preferredDentist',
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_RE = /^[\p{L} '-]+$/u;
const digitsOnly = (value) => (value || '').replace(/\D/g, '');

export function validateNewPatient(patient) {
  const p = patient || {};
  const fieldErrors = {};
  const val = (k) => (p[k] == null ? '' : String(p[k]).trim());

  for (const field of REQUIRED_NEW_PATIENT_FIELDS) {
    if (!val(field)) fieldErrors[field] = 'This field is required.';
  }

  if (val('name') && !NAME_RE.test(val('name'))) {
    fieldErrors.name = 'Name may only contain letters, spaces, hyphens and apostrophes.';
  }
  if (val('idNumber') && digitsOnly(val('idNumber')).length !== 12) {
    fieldErrors.idNumber = 'IC/ID must be exactly 12 digits.';
  }
  for (const phoneField of ['phone', 'emergencyContactPhone']) {
    if (val(phoneField) && digitsOnly(val(phoneField)).length < 7) {
      fieldErrors[phoneField] = 'Enter a valid phone number.';
    }
  }
  if (val('email') && !EMAIL_RE.test(val('email'))) {
    fieldErrors.email = 'Enter a valid email address.';
  }
  if (val('dob') && val('dob') > todayISO()) {
    fieldErrors.dob = 'Date of birth cannot be in the future.';
  }

  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/bookingValidation.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/utils/bookingValidation.js src/utils/bookingValidation.test.js
git commit -m "feat(booking): add new-patient validation + input sanitizers"
```

---

## Task 2: Wire validation into PublicBookingView (Item 1 UI)

**Files:**
- Modify: `src/components/PublicBookingView.jsx`

**Interfaces:**
- Consumes: `sanitizeIC`, `sanitizePhone`, `sanitizeName`, `validateNewPatient` from `../utils/bookingValidation`.
- Produces: none (UI wiring).

> No new unit test — this is component wiring of an already-tested helper. Verified manually via the dev server. Keep changes minimal and follow the existing `updatePatient(field)` pattern.

- [ ] **Step 1: Import the helpers**

At the top of `src/components/PublicBookingView.jsx`, after the existing imports, add:

```javascript
import {
  sanitizeIC,
  sanitizePhone,
  sanitizeName,
  validateNewPatient,
} from '../utils/bookingValidation';
```

- [ ] **Step 2: Add field-error state**

Immediately after `const [patient, setPatient] = useState({ ...emptyPatient });` add:

```javascript
const [fieldErrors, setFieldErrors] = useState({});
```

- [ ] **Step 3: Add sanitizing change handlers**

After the existing `updatePatient` definition (the `(field) => (event) => {...}` one), add:

```javascript
const updatePatientSanitized = (field, sanitizer) => (event) => {
  const clean = sanitizer(event.target.value);
  setPatient((prev) => ({ ...prev, [field]: clean }));
};
```

- [ ] **Step 4: Replace `isValidPatientStep` new-branch validation**

In `isValidPatientStep`, replace the trailing new-patient block:

```javascript
    if (!patient.name.trim()) {
      setError('Please enter patient name.');
      return false;
    }
    if (!patient.phone.trim()) {
      setError('Please enter phone number.');
      return false;
    }
    return true;
```

with:

```javascript
    const { ok, fieldErrors: errs } = validateNewPatient(patient);
    setFieldErrors(errs);
    if (!ok) {
      setError('Please complete all required fields correctly.');
      return false;
    }
    return true;
```

- [ ] **Step 5: Apply sanitizers + required markers to the new-patient inputs**

In the `step === 1 && patientType === 'new'` block:
- Name input → `onChange={updatePatientSanitized('name', sanitizeName)}`, keep `required`.
- IC/ID input → `onChange={updatePatientSanitized('idNumber', sanitizeIC)}`, add `inputMode="numeric"`, `required`.
- DOB input → add `max={todayISO()}`, `required`.
- Gender select → add `required`.
- Phone input → `onChange={updatePatientSanitized('phone', sanitizePhone)}`, add `inputMode="tel"`, keep `required`.
- Email input → add `required` (already `type="email"`).
- Address input → add `required`.
- Emergency Contact Name input → `required`.
- Emergency Contact Phone input → `onChange={updatePatientSanitized('emergencyContactPhone', sanitizePhone)}`, `inputMode="tel"`, `required`.
- Source select → add `required`.
- Preferred Dentist select → add `required`.

Under each of these inputs, render its error, e.g. directly after the Name `<input>`:

```jsx
{fieldErrors.name && <div className="form-error">{fieldErrors.name}</div>}
```

Repeat the matching `{fieldErrors.<field> && ...}` line under each required field's input (idNumber, dob, gender, phone, email, address, emergencyContactName, emergencyContactPhone, source, preferredDentist).

- [ ] **Step 6: Verify the build compiles and form blocks**

Run: `npm run build`
Expected: build succeeds with no errors.

Then manual check (dev server): on a `/book/<slug>` page, choose **New patient**, leave fields blank, click **Next** → stays on step 1, inline errors appear; typing letters into IC/ID is ignored; a future DOB is rejected.

- [ ] **Step 7: Commit**

```bash
git add src/components/PublicBookingView.jsx
git commit -m "feat(booking): enforce required fields and input formats on public form"
```

---

## Task 3: Request lifecycle emails (Item 2 SQL)

**Files:**
- Create: `supabase/notifications.sql`

**Interfaces:**
- Consumes: `private.send_email_internal(text, text, text)` (from `reminders.sql`).
- Produces: triggers `trg_request_received` (INSERT) and `trg_request_declined` (UPDATE OF status) on `public.appointment_requests`.

> SQL is integration-verified manually (no unit harness for Postgres here). The "test" steps are the manual apply + observe checklist.

- [ ] **Step 1: Write the notifications SQL (received + declined)**

```sql
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
```

- [ ] **Step 2: Apply to Supabase**

Run the file's contents in the Supabase SQL editor (or `psql`). Expected: no errors; functions + triggers created.

- [ ] **Step 3: Manual verification**

1. Insert a test row into `appointment_requests` with a real `email` you control and `status='pending'` → a "We received your booking request" email arrives (requires `RESEND_API_KEY` secret + verified `snabbb.com` sender).
2. `update appointment_requests set status='declined' where id = '<that row>'` → a "Update on your booking request" email arrives.
3. Run the same update again → **no** second decline email (idempotency guard).

- [ ] **Step 4: Commit**

```bash
git add supabase/notifications.sql
git commit -m "feat(notifications): email patients on request received and declined"
```

---

## Task 4: Availability helpers (Item 3 logic)

**Files:**
- Create: `src/utils/availability.js`
- Test: `src/utils/availability.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `toMinutes(time: string): number|null`
  - `intervalsOverlap(aStart, aEnd, bStart, bEnd): boolean` — all in minutes; half-open `[start, end)`.
  - `countOverlapping(slotStartMin: number, durationMin: number, busy: Array<{start_time, end_time}>): number`
  - `isSlotFull(slotStart: string, durationMin: number, busy: Array, capacity: number): boolean`
  - `filterAvailableSlots(candidates: string[], durationMin: number, busy: Array, capacity: number): string[]`

- [ ] **Step 1: Write the failing test**

```javascript
// src/utils/availability.test.js
import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  intervalsOverlap,
  countOverlapping,
  isSlotFull,
  filterAvailableSlots,
} from './availability';

const busy = [
  { start_time: '09:00', end_time: '09:30' },
  { start_time: '09:00', end_time: '10:00' },
];

describe('toMinutes', () => {
  it('parses HH:MM', () => expect(toMinutes('09:30')).toBe(570));
  it('returns null for bad input', () => expect(toMinutes('')).toBeNull());
});

describe('intervalsOverlap (half-open)', () => {
  it('detects overlap', () => expect(intervalsOverlap(540, 570, 555, 600)).toBe(true));
  it('touching edges do not overlap', () => expect(intervalsOverlap(540, 570, 570, 600)).toBe(false));
});

describe('countOverlapping', () => {
  it('counts a 30-min slot at 09:00 against both busy rows', () => {
    expect(countOverlapping(toMinutes('09:00'), 30, busy)).toBe(2);
  });
  it('counts a slot at 09:30 only against the 09:00-10:00 row', () => {
    expect(countOverlapping(toMinutes('09:30'), 30, busy)).toBe(1);
  });
  it('long booking overruns into a later appt', () => {
    const later = [{ start_time: '10:00', end_time: '10:30' }];
    expect(countOverlapping(toMinutes('09:30'), 60, later)).toBe(1); // 09:30-10:30 hits 10:00-10:30
  });
});

describe('isSlotFull', () => {
  it('hidden when overlaps >= capacity', () => {
    expect(isSlotFull('09:00', 30, busy, 2)).toBe(true);
  });
  it('visible when capacity exceeds overlaps', () => {
    expect(isSlotFull('09:00', 30, busy, 3)).toBe(false);
  });
  it('treats capacity below 1 as 1 (floor)', () => {
    const one = [{ start_time: '09:00', end_time: '09:30' }];
    expect(isSlotFull('09:00', 30, one, 0)).toBe(true);
  });
});

describe('filterAvailableSlots', () => {
  it('removes full slots, keeps the rest', () => {
    const candidates = ['09:00', '09:30', '10:00'];
    // capacity 1: 09:00 (2 overlaps) hidden, 09:30 (1 overlap) hidden, 10:00 free
    expect(filterAvailableSlots(candidates, 30, busy, 1)).toEqual(['10:00']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/availability.test.js`
Expected: FAIL — `Failed to resolve import "./availability"`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/availability.js
export const toMinutes = (time) => {
  if (!time || typeof time !== 'string' || !time.includes(':')) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

// Half-open intervals [aStart, aEnd) and [bStart, bEnd).
export const intervalsOverlap = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && bStart < aEnd;

export const countOverlapping = (slotStartMin, durationMin, busy) => {
  if (slotStartMin == null) return 0;
  const slotEnd = slotStartMin + Number(durationMin || 0);
  let count = 0;
  for (const appt of busy || []) {
    const bStart = toMinutes(appt.start_time);
    const bEnd = toMinutes(appt.end_time);
    if (bStart == null || bEnd == null) continue;
    if (intervalsOverlap(slotStartMin, slotEnd, bStart, bEnd)) count += 1;
  }
  return count;
};

export const isSlotFull = (slotStart, durationMin, busy, capacity) => {
  const cap = Math.max(1, Number(capacity) || 0);
  return countOverlapping(toMinutes(slotStart), durationMin, busy) >= cap;
};

export const filterAvailableSlots = (candidates, durationMin, busy, capacity) =>
  (candidates || []).filter((slot) => !isSlotFull(slot, durationMin, busy, capacity));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/availability.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/utils/availability.js src/utils/availability.test.js
git commit -m "feat(booking): add capacity-based slot availability helpers"
```

---

## Task 5: Public busy-slots RPC (Item 3a SQL)

**Files:**
- Modify: `supabase/notifications.sql` (append)

**Interfaces:**
- Consumes: tables `public.appointments`, `public.apt_staff`.
- Produces: `public.booking_busy_slots(uuid, date)` and `public.booking_busy_slots_text(text, text)` returning jsonb `{ capacity, busy: [{start_time, end_time}] }`; granted to `anon, authenticated`.

- [ ] **Step 1: Append the RPC to `supabase/notifications.sql`**

Insert **before** the final `notify pgrst, 'reload schema';` line:

```sql
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
```

- [ ] **Step 2: Apply to Supabase**

Re-run `supabase/notifications.sql` in the SQL editor. Expected: no errors; functions created/granted.

- [ ] **Step 3: Manual verification**

In the SQL editor:
```sql
select public.booking_busy_slots_text('<a real clinic uuid>', '<a date with a confirmed appt>');
```
Expected: jsonb like `{"capacity": 1, "busy": [{"start_time":"09:00","end_time":"09:30"}]}`. Confirm it returns **only** times — no names/notes.

- [ ] **Step 4: Commit**

```bash
git add supabase/notifications.sql
git commit -m "feat(booking): add public booking_busy_slots RPC for capacity checks"
```

---

## Task 6: Fetch busy slots + filter availability in PublicBookingView (Item 3a UI)

**Files:**
- Modify: `src/components/PublicBookingView.jsx`

**Interfaces:**
- Consumes: `filterAvailableSlots` from `../utils/availability`; RPC `booking_busy_slots_text`.
- Produces: none (UI wiring).

> Verified via the already-tested helper + manual dev-server check.

- [ ] **Step 1: Import the helper**

Add to the imports:

```javascript
import { filterAvailableSlots } from '../utils/availability';
```

- [ ] **Step 2: Add busy-slots state**

After `const [calendarMonth, setCalendarMonth] = useState(...)` add:

```javascript
const [busySlots, setBusySlots] = useState([]);
const [clinicCapacity, setClinicCapacity] = useState(1);
```

- [ ] **Step 3: Fetch busy slots when clinic or date changes**

Add this effect after the "Auto set duration from treatment" effect:

```javascript
useEffect(() => {
  if (!clinic?.id || !appointment.date) {
    setBusySlots([]);
    return;
  }
  let isActive = true;
  (async () => {
    const { data, error: rpcError } = await supabase.rpc('booking_busy_slots_text', {
      p_clinic_id: clinic.id,
      p_date: appointment.date,
    });
    if (!isActive) return;
    if (rpcError || !data) {
      // Fail open: show all working-hours slots on error.
      console.error('booking_busy_slots failed:', rpcError);
      setBusySlots([]);
      setClinicCapacity(1);
      return;
    }
    setBusySlots(Array.isArray(data.busy) ? data.busy : []);
    setClinicCapacity(Number(data.capacity) || 1);
  })();
  return () => { isActive = false; };
}, [clinic, appointment.date]);
```

- [ ] **Step 4: Apply the capacity filter to `availableSlots`**

In the `availableSlots` `useMemo`, replace the final `return slots;` with:

```javascript
    return filterAvailableSlots(slots, selectedDuration, busySlots, clinicCapacity);
```

and add `busySlots, clinicCapacity` to that `useMemo`'s dependency array.

- [ ] **Step 5: Verify build + behavior**

Run: `npm run build`
Expected: succeeds.

Manual: on a date whose only working slot is taken by a confirmed appt at a single-dentist clinic, that time no longer appears in the slot list; other times remain. With the RPC unreachable, all slots still show (fail-open).

- [ ] **Step 6: Commit**

```bash
git add src/components/PublicBookingView.jsx
git commit -m "feat(booking): hide public slots when all dentists are busy"
```

---

## Task 7: Doctor conflict warning + overbook override (Item 3b)

**Files:**
- Modify: `src/components/RequestsView.jsx`

**Interfaces:**
- Consumes: `addMinutes` (already imported); `intervalsOverlap`, `toMinutes` from `../utils/availability`; existing `appointments` prop.
- Produces: none (UI wiring).

> Logic reuses the tested `availability` helpers; the wiring is verified manually. `appointments` is already passed to `RequestsView` from `App.jsx`.

- [ ] **Step 1: Pass `appointments` into RequestsView from App**

In `src/App.jsx`, the `view === 'requests'` block renders `<RequestsView ... />`. Add the prop:

```jsx
appointments={appointments}
```

(The `appointments` array is already in scope in `AppContent`.)

- [ ] **Step 2: Import overlap helpers + accept the prop**

In `src/components/RequestsView.jsx`, update the import line and the destructured props:

```javascript
import { addMinutes } from '../utils/time';
import { intervalsOverlap, toMinutes } from '../utils/availability';
```

Add `appointments = [],` to the destructured `RequestsView({ ... })` parameters.

- [ ] **Step 3: Add a conflict-finder and prompt state**

After the existing `const [errors, setErrors] = useState({});` add:

```javascript
const [conflictPrompt, setConflictPrompt] = useState({});

const findConflicts = (request) => {
  const date = getRequestDate(request);
  const startTime = getRequestTime(request);
  const start = toMinutes(startTime);
  if (!date || start == null) return [];
  const end = start + getDefaultDuration(request);
  return (appointments || []).filter((a) => {
    if (a.status !== 'confirmed' || a.date !== date) return false;
    const aStart = toMinutes(a.startTime);
    const aEnd = a.endTime ? toMinutes(a.endTime) : aStart + (a.duration || 30);
    if (aStart == null || aEnd == null) return false;
    return intervalsOverlap(start, end, aStart, aEnd);
  });
};
```

- [ ] **Step 4: Gate approval through the conflict check**

Add a wrapper used by the approve buttons:

```javascript
const handleApproveClick = (request, options = {}) => {
  const conflicts = findConflicts(request);
  if (conflicts.length > 0) {
    setConflictPrompt((prev) => ({ ...prev, [request.id]: { options, conflicts } }));
    return;
  }
  approveRequest(request, options);
};

const confirmOverbook = (request) => {
  const pending = conflictPrompt[request.id];
  setConflictPrompt((prev) => {
    const next = { ...prev };
    delete next[request.id];
    return next;
  });
  approveRequest(request, pending?.options || {});
};

const cancelOverbook = (request) => {
  setConflictPrompt((prev) => {
    const next = { ...prev };
    delete next[request.id];
    return next;
  });
};
```

- [ ] **Step 5: Point the approve buttons at `handleApproveClick` and render the inline prompt**

In the `request.status === 'pending'` footer:
- Change the new-patient "Approve + Add patient" button's `onClick` to `() => handleApproveClick(request, { addPatientRecord: true })`.
- Change the existing-patient "Approve appointment" button's `onClick` to `() => handleApproveClick(request)`.

Then, immediately above the action buttons (still inside the pending block), add:

```jsx
{conflictPrompt[request.id] && (
  <div className="form-error" style={{ marginBottom: '0.5rem' }}>
    <div>
      This time overlaps {conflictPrompt[request.id].conflicts.length} confirmed appointment(s):{' '}
      {conflictPrompt[request.id].conflicts
        .map((c) => `${c.startTime}-${c.endTime || addMinutes(c.startTime, c.duration || 30)}`)
        .join(', ')}. Book anyway?
    </div>
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => confirmOverbook(request)}>
        Book anyway
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => cancelOverbook(request)}>
        Cancel
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify build + behavior**

Run: `npm run build`
Expected: succeeds.

Manual: as a clinic user with a confirmed appt at 09:00, approving a pending request for an overlapping time shows the inline "Book anyway?" prompt; **Book anyway** completes the approval (creating the overlapping appointment); **Cancel** dismisses it without booking. A non-overlapping request approves directly with no prompt.

- [ ] **Step 7: Commit**

```bash
git add src/components/RequestsView.jsx src/App.jsx
git commit -m "feat(requests): warn on overlapping appointments with overbook override"
```

---

## Task 8: Full regression pass

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test -- --run`
Expected: all tests pass, including the two new util suites.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit (only if any fix was needed)**

```bash
git add -A
git commit -m "test: regression pass for booking validation, notifications, capacity"
```

---

## Self-Review

**Spec coverage:**
- Item 1 (required + formats) → Tasks 1–2. ✓ (required list, IC 12-digit, phone, email, DOB, name all in Task 1 tests + Task 2 wiring)
- Item 2 (received/confirmed/declined emails) → Task 3 (received + declined); confirmed path already exists (noted in spec, requires no code). ✓
- Item 3a (public hide at capacity) → Tasks 4 (helpers), 5 (RPC), 6 (wiring). ✓ (full-interval overlap, capacity floor, unassigned-counts-as-1 via counting all confirmed rows, fail-open all covered)
- Item 3b (doctor warn + overbook) → Task 7. ✓ (inline prompt, no restriction on same/different dentist)
- "No anon RLS exposure" → Task 5 RPC returns only times. ✓
- Pending requests don't block public slots → Task 5 RPC filters `status='confirmed'`. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:**
- `validateNewPatient` returns `{ ok, fieldErrors }` — consumed identically in Task 2. ✓
- `filterAvailableSlots(candidates, durationMin, busy, capacity)` — defined Task 4, called Task 6 with `(slots, selectedDuration, busySlots, clinicCapacity)`. ✓
- `intervalsOverlap(aStart, aEnd, bStart, bEnd)` + `toMinutes` — defined Task 4, reused Task 7. ✓
- RPC name `booking_busy_slots_text` — Task 5 defines, Task 6 calls. Matches. ✓
- `booking_busy_slots` jsonb shape `{ capacity, busy:[{start_time,end_time}] }` — produced Task 5, consumed Task 6. ✓

No issues found.
