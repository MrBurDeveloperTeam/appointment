# Design: Public Booking Validation, Confirmation Notifications & Capacity-Aware Scheduling

**Date:** 2026-06-25
**Branch:** `fix/kris/minor-bugs` (off `cloudflared`)
**Status:** Approved (pending written-spec review)

## Overview

Three related improvements to the appointment booking flow:

1. **Item 1 — Compulsory + formatted public booking fields.** Make the core identity/contact
   fields required on the public new-patient form, with per-field input format enforcement
   (IC numeric-only, phone format, email, DOB-not-future, name letters-only).
2. **Item 2 — Confirmation emails at every lifecycle moment.** The patient is notified when their
   booking request is received (pending), when the doctor accepts (confirmed), and when the doctor
   declines. Email only, via the existing Resend + `pg_net` database pipeline. (WhatsApp is out of
   scope — no provider integration exists in this repo.)
3. **Item 3 — Capacity-aware public slots + doctor overbook.** The public calendar hides a time only
   when **all** dentists are busy (capacity reached). The doctor can still deliberately overbook
   (same time, same or different dentist) after an explicit conflict warning.

Chosen architecture: **Approach A (database-centric)** — extend the existing `pg_net`/Resend triggers
and add `SECURITY DEFINER` RPCs, matching the patterns already used for OTP and confirmation emails.
This keeps the unauthenticated public page from reading appointment rows directly and adds no new
infrastructure or exposed credentials.

## Affected files

| File | Change |
|---|---|
| `src/components/PublicBookingView.jsx` | Item 1 (validation + sanitizers), Item 3a (busy-slot fetch + availability filter) |
| `src/components/RequestsView.jsx` | Item 3b (conflict detection + inline override prompt) |
| `supabase/notifications.sql` (**new**) | Item 2 (request-received + declined triggers) **and** Item 3a (`booking_busy_slots` RPC + text wrapper) — all new request-lifecycle/booking SQL lives in this one new file |

All SQL is applied **manually** to Supabase (no migration tooling in this repo, consistent with
existing practice). New SQL depends on `private.send_email_internal` from `supabase/reminders.sql`.

---

## Item 1 — Public form validation (frontend only)

**Scope:** `PublicBookingView.jsx`, **new-patient branch only**. The existing-patient flow is
identity-verified via OTP and submits no new-patient fields — it is left untouched.

### Required vs optional

- **Required** (block step-1 "Next" and final submit): Name, IC/ID, DOB, Gender, Phone, Email,
  Address, Emergency Contact Name, Emergency Contact Phone, Source, Preferred Dentist.
- **Optional:** Tax Number, Allergies, Medical Conditions, Medications, Insurance, Notes.

### Input formats

| Field | Rule | Enforcement |
|---|---|---|
| IC/ID | Exactly 12 digits, no letters | Live: strip non-digits, cap length 12 (mirror OTP input sanitizer). Submit: reject if length ≠ 12. |
| Phone, Emergency Phone | Digits, leading `+`, spaces; min 7 digits | Live: filter to `[0-9+ ]`. Submit: reject if < 7 digits. |
| Email | Valid email pattern | Submit-time regex (in addition to browser `type=email`). |
| DOB | Not in the future | `max={todayISO()}` on the date input + submit check (`dob <= today`). |
| Name | Letters, spaces, hyphens, apostrophes only | Live filter (reject digits/symbols) + submit check (non-empty after trim). |

### Implementation

- Add `validateNewPatient(patient)` returning `{ ok: boolean, fieldErrors: Record<field,string> }`.
- Add per-field `onChange` sanitizers for IC, phone (×2), and name.
- Required fields render a visual `*`; errors show inline under the field via the existing
  `.form-error` class.
- Wire `isValidPatientStep()` (currently lines ~538) to call `validateNewPatient` for the `new`
  branch; keep the existing OTP-based checks for the `existing` branch.
- `handleSubmit` re-runs validation so the Review step cannot be used to bypass field rules.

### Edge cases

- Trim all values before validating.
- Existing-patient validation unchanged.
- Final submit re-validates (defence against step-skipping).

---

## Item 2 — Confirmation emails (database-centric)

**Scope:** new `supabase/notifications.sql`, built on `private.send_email_internal` + `pg_net`/Resend.
Three lifecycle moments, all keyed off the email already stored on the row.

| Moment | Trigger | Recipient | Message (summary) |
|---|---|---|---|
| **Booking received** | `AFTER INSERT ON public.appointment_requests` | `coalesce(new.email, new.lookup_email)` | "We received your request for {date} at {time}; pending review." |
| **Confirmed** | doctor Approve inserts `appointments` row `status='confirmed'` → **existing** `trigger_send_confirmation` | patient via `appointments.patient_id` join | "Your appointment is confirmed for {date} at {time}." |
| **Declined** | `AFTER UPDATE OF status ON appointment_requests` where `new.status='declined' AND old.status IS DISTINCT FROM 'declined'` | `coalesce(new.email, new.lookup_email)` | "Unfortunately we couldn't accommodate your requested time." |

### New DB objects

1. `public.send_request_received()` — trigger fn, `SECURITY DEFINER`,
   `set search_path = private, public, extensions`. Fires `AFTER INSERT` on `appointment_requests`.
   Resolves recipient via `coalesce(new.email, new.lookup_email)`; guards `like '%@%'`; calls
   `send_email_internal`. Uses `new.appointment_date`/`new.appointment_start_time` (fallback to
   `preferred_dates[1]`/`preferred_times[1]`) for the message body.
2. `public.send_request_declined()` — trigger fn, same security settings. Fires
   `AFTER UPDATE OF status`, guarded so it only sends on the transition **into** `declined`.

### Key properties

- **Confirmed path requires no new code** — the doctor's existing Approve already creates a
  `confirmed` appointment and the confirmation trigger already exists (hardened in commit `ffe39c7`).
- **Idempotency:** insert trigger fires once per request; decline trigger's
  `old.status IS DISTINCT FROM 'declined'` guard prevents duplicate decline emails on re-saves.
- **Failure isolation:** `send_email_internal` returns a jsonb error rather than raising, so a flaky
  Resend call never rolls back the patient's booking or the doctor's decision.

### Operational dependency (not a code issue)

The "from" addresses (`appointments@snabbb.com`, `noreply@snabbb.com`, set in commit `ffe39c7`) only
deliver if `snabbb.com` is a **verified sender domain** in the Resend account. Unverified → sends fail
silently. This is an ops prerequisite on the Resend side.

---

## Item 3 — Capacity-aware slots + doctor overbook

Deliberate asymmetry: the **public** page *hides* full slots; the **doctor** can *override* and
overbook intentionally.

### 3a. Public side — hide a slot only when all dentists are busy

**New DB object** (in `supabase/notifications.sql`): `public.booking_busy_slots(p_clinic_id uuid, p_date date)` — `SECURITY DEFINER`,
returns `{ start_time text, end_time text }` rows for **confirmed** appointments on that date, plus the
clinic capacity. Capacity = `count(*)` of `apt_staff` where `role = 'dentist'`. A `_text` wrapper
variant is provided for PostgREST UUID-cast safety (matching the OTP RPC convention). The RPC returns
**only time ranges and a capacity number — no patient names, IDs, or notes** — so no anon RLS policy on
`appointments` is needed and no appointment detail is exposed.

Response shape (single jsonb is acceptable):
`{ capacity: int, busy: [{ start_time, end_time }, ...] }`.

**Frontend (`PublicBookingView.jsx`):**
- On clinic + date change, call `booking_busy_slots`; store `busy[]` and `capacity`.
- Rewrite `availableSlots` (currently lines ~366) so a candidate start `t` is **hidden** when the
  number of confirmed appts whose `[start,end)` overlaps `[t, t + chosenDuration)` is **≥ capacity**.
  - **Overlap = full-interval:** `t < appt.endMin AND (t + dur) > appt.startMin`.
  - **Unassigned confirmed appts each count as 1 busy unit** — so the comparison counts *total
    overlapping confirmed appts* vs `capacity` (not distinct dentist_ids).
- **Capacity floor:** if a clinic has 0 dentists configured, treat capacity as **1** (a single appt
  still blocks its slot; avoids "infinite availability" before staff setup).
- **Fail open:** if the RPC errors, show all working-hours slots (current behavior) and log — a backend
  hiccup must never block bookings.

### 3b. Doctor side — warn on conflict, allow override

**Frontend (`RequestsView.jsx`):**
- Before approving, compute overlaps against the **already-loaded** `appointments` prop (no new fetch).
  Overlap = any confirmed appt whose interval intersects the request's `[start, start+duration)`.
- If overlaps exist, render an **inline** confirm in the card footer (not a popup modal):
  *"This time overlaps {patientName} at {HH:MM}–{HH:MM}. Book anyway?"* with **Book anyway** / **Cancel**.
- On **Book anyway**, proceed with the existing `approveRequest` insert — same or different dentist,
  **no restriction**. This replaces today's silent-allow with informed-allow.
- State: reuse existing per-card `errors[request.id]` / `processing`; add `conflictPrompt[request.id]`.
  No new component.

### Interaction between 3a and 3b

Public hides at capacity (prevents *accidental* patient overbooking); the doctor may *intentionally*
exceed capacity. They don't conflict — a doctor-created overbook simply targets a slot that was already
hidden publicly.

### Edge cases

- **Pending requests do NOT reduce public availability** — only confirmed appts do. Two patients can
  request the same slot; the doctor resolves the second via the conflict warning. (Confirmed choice.)
- A request whose time is now full still appears in the doctor's pending queue and triggers the conflict
  prompt on approval. Correct by design.
- **No timezone math:** all comparisons use stored `date` (date) + `start_time`/`end_time` (text
  `HH:MM`), identical representation on both sides.

---

## Testing strategy

- **Item 1:** unit tests for `validateNewPatient` (each required field empty → error; IC non-12/with
  letters → error; phone too short → error; future DOB → error; name with digits → error; all-valid →
  ok). Vitest + jsdom (existing setup).
- **Item 2:** SQL is integration-only (manual apply + observe Resend). Document a manual test checklist:
  insert request → receive "received" email; approve → "confirmed"; decline → "declined"; re-decline →
  no duplicate.
- **Item 3a:** unit-test the availability filter as a pure helper (given busy[], capacity, duration →
  expected hidden/visible slots), covering: below capacity (visible), at capacity (hidden), unassigned
  appt counts, 0-dentist floor, full-interval overrun.
- **Item 3b:** unit-test the overlap detector (pure helper) and assert the prompt gates the approve call.

## Out of scope

- WhatsApp / any non-email channel (no provider integration in repo).
- Changes to the existing-patient OTP flow.
- Dentist selection on the public form (it picks a treatment, not a dentist).
- Reworking the cron reminder system in `reminders.sql`.
- Any RLS policy change exposing appointment data to anon (explicitly avoided via the busy-slots RPC).

## Risks / dependencies

- **Resend sender-domain verification** for `snabbb.com` (ops, see Item 2).
- SQL applied manually — deployer must run `notifications.sql` and the `booking_busy_slots` additions
  against Supabase and `notify pgrst, 'reload schema'`.
- `booking_busy_slots` must be granted to `anon, authenticated` (like the OTP RPCs) to be callable from
  the public page.
