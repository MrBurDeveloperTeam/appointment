# Admin Dashboard Server-Side Aggregation — Design

**Date:** 2026-07-27
**Branch base:** `cloudflared`
**Status:** Approved (pending spec review)

## Problem

`AdminDashboard.refresh()` ([src/components/AdminDashboard.jsx:70-97](../../../src/components/AdminDashboard.jsx#L70-L97))
loads **8 queries per clinic for every clinic**, wrapped in a single `Promise.all`,
so all requests launch simultaneously. With 378 clinics that is **~3,024
concurrent requests**.

Observed symptoms (all one root cause — unbounded fan-out):
1. Console floods with `net::ERR_INSUFFICIENT_RESOURCES` (Chrome exhausts its
   connection/socket pool). "535 log entries are not shown."
2. Enough requests fail that the top-level `Promise.all` rejects → catch block →
   **"Failed to load admin data."** banner.
3. On refresh, the browser is still resource-starved, which starves/aborts the
   `GET /sso/exchange` call in `AuthProvider`; a failed/401 exchange triggers
   sign-out → **auto-logout on refresh**.

It worked with a handful of clinics; it collapses at 378. This is architectural.

## Goal

Replace the per-clinic fan-out with **server-side aggregation** so the Overview
loads in a handful of requests, and load full per-clinic detail **only on
demand**.

Out of scope: the auto-logout is addressed **indirectly** (removing the flood
removes the resource starvation). If logout still reproduces after the flood is
gone, that is a separate auth investigation — flag, do not bundle.

## Architecture — three data tiers

### Tier 1 — Overview load: one RPC `admin_dashboard_summary()`

A single `SECURITY DEFINER` RPC (admin-gated) returns everything the Overview and
collapsed clinic cards need, replacing ~3,024 requests with **1**.

### Tier 2 — Per-clinic detail, on demand

When a card is expanded (`expandedClinicId`, line 775) or the Manage/Details modal
opens (lines 232, 1438), fetch **that one clinic's** full lists via the existing
`DataStore.getX(clinicId)` methods, and cache in `clinicDetails[clinicId]` so
re-opening does not refetch.

### Tier 3 — Users

Unchanged — `DataStore.getUsers()` is already a single query.

## RPC contract: `public.admin_dashboard_summary()`

```
returns jsonb:
{
  "clinics": [
    {
      "clinic_id": uuid,
      "counts": {
        "patients": int, "appointments": int, "staff": int,
        "rooms": int, "treatments": int
      },
      "settings": {
        "clinic_name": text,
        "working_hours_start": text,
        "working_hours_end": text,
        "slot_duration": int,
        "phone": text
      }
    },
    ...
  ],
  "monthly_trend": [ { "month": "YYYY-MM", "count": int }, ... ]  // last 6 months, global
}
```

**Security (critical):** the RPC is `SECURITY DEFINER` and bypasses RLS, so it
MUST gate on the caller being an admin before returning anything:

```sql
if not exists (
  select 1 from public.profiles
  where user_id = auth.uid() and account_type = 'admin'
) then
  raise exception 'not authorized' using errcode = '42501';
end if;
```

(Confirmed: admins are `profiles.account_type = 'admin'`.)

**Implementation notes:**
- Counts computed set-based (LEFT JOIN … GROUP BY, or scalar subqueries per clinic
  in one pass) — never per-clinic round trips.
- Tables: `apt_patients`, `appointments`, `apt_staff`, `apt_rooms`,
  `apt_treatments`, `apt_settings`, `apt_clinics`. (`appointments` is un-prefixed.)
- `monthly_trend`: aggregate `appointments.date` by `to_char(date,'YYYY-MM')` for
  the last 6 months across all clinics (matches the existing `appointmentTrend`
  chart window at line 155-165). The client fills any missing months with 0.
- Settings columns confirmed present: `clinic_name`, `working_hours_start`,
  `working_hours_end`, `slot_duration`. `phone` read defensively (may be null /
  absent → return null).

## Client changes

`src/data/index.js` (+ a small datastore module or inline):
1. `DataStore.getAdminDashboardSummary()` → `supabase.rpc('admin_dashboard_summary')`,
   returns the parsed payload.

`src/components/AdminDashboard.jsx`:
2. `refresh()`: remove the per-clinic `Promise.all` fan-out (lines 70-97). Call
   `getAdminDashboardSummary()` alongside `getClinics()` / `getUsers()` /
   `getAdminActivity()`. Store `summaryByClinicId` (map) and `monthlyTrend` in state.
3. `clinicSummaries` (line 116): read counts from `summaryByClinicId[clinic.id].counts`
   instead of `clinicDetails[...].length`.
4. Global trend `useMemo` (line 167): use `monthlyTrend` from the RPC instead of
   iterating `clinicDetails`.
5. Add `ensureClinicDetails(clinicId)`: if `clinicDetails[clinicId]` is missing,
   fetch that clinic's 8 lists and cache. Call from `openClinicModal` (line 179)
   and the View Details toggle (line 769).
6. Collapsed settings display (lines 986-1007): read from the summary's `settings`.
   Expanded per-clinic analytics (lines 779-830) continues to use lazily-loaded
   `clinicDetails` (only rendered for the expanded clinic, line 775).

## Data flow

- **Mount:** `getClinics()` + `getUsers()` + `getAdminActivity()` +
  `admin_dashboard_summary()` — 4 light requests total.
- **Counts / KPIs / global chart:** from the summary payload.
- **Expand card / open modal:** lazy-load that clinic's details into `clinicDetails`
  (cached).

## Error handling

- RPC failure → existing "Failed to load admin data." banner (now rare).
- On-demand detail fetch failure → localized error in the modal/expanded section,
  not a global banner; does not blow away the whole dashboard.
- Admin-gate rejection in RPC → surfaces as an error to the client → banner.

## Testing

- **RPC (SQL):** counts match direct `COUNT(*)` per clinic for a sample;
  `monthly_trend` matches a manual aggregate; **non-admin caller is rejected**.
- **Load (browser):** network panel shows ~4 requests on load (not thousands); no
  `ERR_INSUFFICIENT_RESOURCES`; banner gone.
- **On-demand:** expanding a clinic / opening Manage fires exactly that clinic's
  detail queries; re-opening uses cache.
- **Regression:** counts, KPIs, charts, modal lists show correct numbers.

## Scope

Frontend + one new RPC. No changes to existing per-entity DataStore modules (the
on-demand path reuses them). One migration (`admin_dashboard_summary`) applied to
the live DB and mirrored into `supabase/schema.sql`.
