# Admin Dashboard Server-Side Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Admin Dashboard's ~3,024-request per-clinic fan-out with a single admin-gated aggregation RPC plus on-demand per-clinic detail loading.

**Architecture:** A new `SECURITY DEFINER` Postgres RPC `admin_dashboard_summary()` returns per-clinic counts, settings, and a global 6-month appointment trend in one call. The client reads counts/trend from the RPC and lazy-loads a clinic's full lists only when its card is expanded or a modal opens (cached in `clinicDetails`).

**Tech Stack:** React 18 (hooks), Supabase JS (`supabase.rpc`), PostgreSQL (plpgsql), applied via Supabase MCP migration + mirrored in `supabase/schema.sql`.

## Global Constraints

- All persistence goes through `src/data/` (the `DataStore` facade) — never call Supabase tables directly from components. RPC wrapper lives in `DataStore`.
- DB is snake_case; JS app is camelCase. New DataStore method returns app-shaped (camelCase) data.
- `appointments` is un-prefixed; clinic tables are `apt_*` (`apt_patients`, `apt_staff`, `apt_rooms`, `apt_treatments`, `apt_settings`, `apt_clinics`).
- Admins are `profiles.account_type = 'admin'`. The RPC is `SECURITY DEFINER` and bypasses RLS, so it MUST reject non-admin callers.
- Global trend window is **6 months** (matches existing `appointmentTrend`, AdminDashboard.jsx:155-165).
- No lint/typecheck step exists; verification is manual + SQL + browser network panel.
- SQL is applied to the live DB via Supabase MCP `apply_migration`, then mirrored into `supabase/schema.sql`.

---

### Task 1: Create the `admin_dashboard_summary()` RPC

**Files:**
- Apply: Supabase migration `admin_dashboard_summary` (via MCP `apply_migration`)
- Modify: `supabase/schema.sql` (add the function in the HELPER FUNCTIONS section, after `handle_new_user()`)

**Interfaces:**
- Produces: `public.admin_dashboard_summary()` returns `jsonb`:
  ```json
  {
    "clinics": [
      { "clinic_id": "uuid",
        "counts": { "patients": int, "appointments": int, "staff": int, "rooms": int, "treatments": int },
        "settings": { "clinic_name": text|null, "working_hours_start": text|null,
                      "working_hours_end": text|null, "slot_duration": int|null, "phone": null } }
    ],
    "monthly_trend": [ { "month": "YYYY-MM", "count": int } ]
  }
  ```
  (`phone` is always null — `apt_settings` has no phone column; kept in shape because the UI reads `settings.phone` defensively.)

- [ ] **Step 1: Apply the migration**

Use MCP `apply_migration` with name `admin_dashboard_summary` and this SQL:

```sql
create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  -- Gate: bypasses RLS, so only admins may call it.
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and account_type = 'admin'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'clinics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clinic_id', c.id,
        'counts', jsonb_build_object(
          'patients',    (select count(*) from public.apt_patients   p where p.clinic_id = c.id),
          'appointments',(select count(*) from public.appointments   a where a.clinic_id = c.id),
          'staff',       (select count(*) from public.apt_staff      s where s.clinic_id = c.id),
          'rooms',       (select count(*) from public.apt_rooms      r where r.clinic_id = c.id),
          'treatments',  (select count(*) from public.apt_treatments t where t.clinic_id = c.id)
        ),
        'settings', jsonb_build_object(
          'clinic_name',         st.clinic_name,
          'working_hours_start', st.working_hours_start,
          'working_hours_end',   st.working_hours_end,
          'slot_duration',       st.slot_duration,
          'phone',               null
        )
      ) order by c.created_at)
      from public.apt_clinics c
      left join public.apt_settings st on st.clinic_id = c.id
    ), '[]'::jsonb),
    'monthly_trend', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'count', m.cnt) order by m.month)
      from (
        select to_char(a.date, 'YYYY-MM') as month, count(*) as cnt
        from public.appointments a
        where a.date >= (date_trunc('month', current_date) - interval '5 months')
        group by 1
      ) m
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_dashboard_summary() to authenticated;
```

- [ ] **Step 2: Verify the RPC returns correct counts (SQL test)**

Run via MCP `execute_sql`:

```sql
-- Compare RPC counts for one clinic against direct counts.
with rpc as (
  select jsonb_array_elements(public.admin_dashboard_summary()->'clinics') as c
)
select
  (c->>'clinic_id')::uuid as clinic_id,
  (c->'counts'->>'patients')::int as rpc_patients,
  (select count(*) from public.apt_patients p where p.clinic_id = (c->>'clinic_id')::uuid) as real_patients,
  (c->'counts'->>'appointments')::int as rpc_appts,
  (select count(*) from public.appointments a where a.clinic_id = (c->>'clinic_id')::uuid) as real_appts
from rpc
where (c->>'clinic_id')::uuid = '377fdd9a-6bbe-4f5a-9702-946d5198db00';
```

Expected: `rpc_patients = real_patients` and `rpc_appts = real_appts`.

NOTE: this runs as the MCP service role, which passes the admin gate. The non-admin rejection is covered by code review of the `if not exists (... account_type='admin')` guard (cannot easily impersonate a non-admin JWT from MCP). Confirm the guard is present in the applied function via:
```sql
select pg_get_functiondef('public.admin_dashboard_summary()'::regprocedure) like '%account_type = ''admin''%' as has_admin_gate;
```
Expected: `has_admin_gate = true`.

- [ ] **Step 3: Verify monthly_trend matches a manual aggregate**

Run:

```sql
select public.admin_dashboard_summary()->'monthly_trend' as rpc_trend,
       (select jsonb_agg(jsonb_build_object('month', month, 'count', cnt) order by month)
        from (
          select to_char(date,'YYYY-MM') month, count(*) cnt
          from public.appointments
          where date >= (date_trunc('month', current_date) - interval '5 months')
          group by 1
        ) t) as manual_trend;
```

Expected: `rpc_trend` equals `manual_trend`.

- [ ] **Step 4: Mirror the function into schema.sql**

In `supabase/schema.sql`, in the `-- 5. HELPER FUNCTIONS` section, after the `handle_new_user()` function block (after its closing `$$;`), paste the exact same `create or replace function public.admin_dashboard_summary() ...` body and the `grant execute` line from Step 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): admin_dashboard_summary() RPC for aggregated admin data

Admin-gated SECURITY DEFINER RPC returning per-clinic counts, settings,
and a global 6-month appointment trend in one call, replacing the admin
dashboard's per-clinic fan-out.

Mirrors live migration admin_dashboard_summary."
```

---

### Task 2: Add `DataStore.getAdminDashboardSummary()`

**Files:**
- Modify: `src/data/index.js` (add method near `getAdminActivity`, ~line 186)

**Interfaces:**
- Consumes: `supabase` (already imported at `src/data/index.js:2`), `public.admin_dashboard_summary()` (Task 1).
- Produces: `DataStore.getAdminDashboardSummary()` → `Promise<{ summaryByClinicId: Record<string, { patients, appointments, staff, rooms, treatments, settings }>, monthlyTrend: Array<{ month: string, count: number }> }>`. `settings` is camelCase: `{ clinicName, workingHours: { start, end }, slotDuration, phone }`.

- [ ] **Step 1: Add the method**

In `src/data/index.js`, immediately after the `getAdminActivity()` method (ends ~line 194), add:

```javascript
  async getAdminDashboardSummary() {
    const { data, error } = await supabase.rpc("admin_dashboard_summary");
    if (error) throw error;
    const payload = data || {};
    const summaryByClinicId = {};
    (payload.clinics || []).forEach((c) => {
      const s = c.settings || {};
      summaryByClinicId[c.clinic_id] = {
        patients: c.counts?.patients ?? 0,
        appointments: c.counts?.appointments ?? 0,
        staff: c.counts?.staff ?? 0,
        rooms: c.counts?.rooms ?? 0,
        treatments: c.counts?.treatments ?? 0,
        settings: {
          clinicName: s.clinic_name || "Dental Clinic",
          workingHours: { start: s.working_hours_start || "09:00", end: s.working_hours_end || "18:00" },
          slotDuration: s.slot_duration || 30,
          phone: s.phone || "-",
        },
      };
    });
    const monthlyTrend = (payload.monthly_trend || []).map((m) => ({
      month: m.month,
      count: m.count,
    }));
    return { summaryByClinicId, monthlyTrend };
  },
```

- [ ] **Step 2: Manual verification in browser console**

With the dev server running and logged in as admin, open DevTools console on the dashboard and run:

```js
const r = await window.__DS?.getAdminDashboardSummary?.();
```
(If `window.__DS` is not exposed, skip — Task 4's UI verification covers this. Do NOT add a debug global; rely on Task 4.)

- [ ] **Step 3: Commit**

```bash
git add src/data/index.js
git commit -m "feat(data): getAdminDashboardSummary() wraps the aggregation RPC"
```

---

### Task 3: Add `ensureClinicDetails()` lazy-loader in AdminDashboard

**Files:**
- Modify: `src/components/AdminDashboard.jsx` (add helper; wire to expand toggle line 769 and `openClinicModal` line 179)

**Interfaces:**
- Consumes: `DataStore.getPatients/getAppointments/getStaff/getRooms/getTreatments/getSettings/getHolidays/getActivityLog` (existing), `clinicDetails`/`setClinicDetails` state (line 36).
- Produces: `ensureClinicDetails(clinicId)` — async; if `clinicDetails[clinicId]` is absent, fetches the 8 lists for that one clinic and merges into `clinicDetails`. Idempotent (cached).

- [ ] **Step 1: Add the helper function**

In `src/components/AdminDashboard.jsx`, after the `refresh` function (after line 106) and before the mount `useEffect` (line 108), add:

```javascript
  const ensureClinicDetails = async (clinicId) => {
    if (!clinicId) return;
    // Already cached — skip refetch.
    if (clinicDetails[clinicId]) return;
    try {
      const [patients, appointments, staff, rooms, treatments, settings, holidays, activity] =
        await Promise.all([
          DataStore.getPatients(clinicId),
          DataStore.getAppointments(clinicId),
          DataStore.getStaff(clinicId),
          DataStore.getRooms(clinicId),
          DataStore.getTreatments(clinicId),
          DataStore.getSettings(clinicId),
          DataStore.getHolidays(clinicId),
          DataStore.getActivityLog(clinicId),
        ]);
      setClinicDetails((prev) => ({
        ...prev,
        [clinicId]: { patients, appointments, staff, rooms, treatments, settings, holidays, activity },
      }));
    } catch (err) {
      console.error("Failed to load clinic details:", err);
      setDetailError("Failed to load clinic details.");
    }
  };
```

- [ ] **Step 2: Trigger it when a card is expanded**

Find the View Details toggle button (line 767-772):

```javascript
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setExpandedClinicId(expandedClinicId === clinic.id ? '' : clinic.id)}
                        >
```

Replace the `onClick` with one that also loads details when opening:

```javascript
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            const next = expandedClinicId === clinic.id ? '' : clinic.id;
                            setExpandedClinicId(next);
                            if (next) ensureClinicDetails(next);
                          }}
                        >
```

- [ ] **Step 3: Trigger it when the Manage modal opens**

Find `openClinicModal` (starts line 179). At the **start** of the function body, add a details preload (Manage/detail views read `clinicDetails[clinicId]`):

```javascript
  const openClinicModal = (clinic) => {
    if (clinic?.id) ensureClinicDetails(clinic.id);
```
(Keep the rest of the existing function unchanged.)

- [ ] **Step 4: Trigger it when the detail modal opens (View Details → patients/staff/etc.)**

Find where `detailModal` is opened (search for `setDetailModal({ open: true`). At each such call site, ensure details are loaded first by adding before it:
```javascript
    ensureClinicDetails(<clinicIdVariableInScope>);
```
Use the clinic id variable already in scope at that call site (e.g. `clinic.id` or `detailModal.clinicId` depending on context). If a single call site opens it, one insertion suffices.

- [ ] **Step 5: Manual verification**

Run the dev server. As admin, open the dashboard. Expand a clinic card → its details load (network panel shows ~8 requests for THAT clinic only). Collapse and re-expand → no new requests (cached).

- [ ] **Step 6: Commit**

```bash
git add src/components/AdminDashboard.jsx
git commit -m "feat(admin): lazy-load per-clinic details on expand/modal open"
```

---

### Task 4: Replace the fan-out in `refresh()` with the aggregation RPC

**Files:**
- Modify: `src/components/AdminDashboard.jsx` (refresh 56-106; add state; rewire `clinicSummaries` 116, `totals` 144, `appointmentTrend` 155, settings display 986-1007)

**Interfaces:**
- Consumes: `DataStore.getAdminDashboardSummary()` (Task 2), `ensureClinicDetails` (Task 3).
- Produces: two new state values `summaryByClinicId` (map) and `monthlyTrend` (array), read by the memos.

- [ ] **Step 1: Add state for the summary**

After line 36 (`const [clinicDetails, setClinicDetails] = useState({});`), add:

```javascript
  const [summaryByClinicId, setSummaryByClinicId] = useState({});
  const [monthlyTrend, setMonthlyTrend] = useState([]);
```

- [ ] **Step 2: Rewrite `refresh()` to drop the fan-out**

Replace the entire `refresh` function body (lines 56-106) with:

```javascript
  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [clinicsData, usersData, adminActivityData, summary] = await Promise.all([
        DataStore.getClinics(),
        DataStore.getUsers(),
        DataStore.getAdminActivity(),
        DataStore.getAdminDashboardSummary(),
      ]);
      setClinics(clinicsData || []);
      setUsers((usersData || []).filter((u) => u.status !== 'inactive'));
      setAdminActivity(adminActivityData || []);
      setSummaryByClinicId(summary?.summaryByClinicId || {});
      setMonthlyTrend(summary?.monthlyTrend || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Rewire `clinicSummaries` to read counts from the summary**

Replace `clinicSummaries` (lines 116-128) with:

```javascript
  const clinicSummaries = useMemo(() => {
    return clinics.map((clinic) => {
      const summary = summaryByClinicId[clinic.id];
      const stats = {
        patients: summary?.patients ?? 0,
        appointments: summary?.appointments ?? 0,
        staff: summary?.staff ?? 0,
        rooms: summary?.rooms ?? 0,
        treatments: summary?.treatments ?? 0,
      };
      return { ...clinic, stats };
    });
  }, [clinics, summaryByClinicId]);
```

- [ ] **Step 4: Rewire `totals` dependency**

`totals` (lines 144-152) already reads `clinicSummaries[].stats`, so its body is unchanged. Confirm its dependency array still reads `[clinicSummaries, clinics.length, users.length]` — no edit needed.

- [ ] **Step 5: Rewire `appointmentTrend` to use `monthlyTrend`**

Replace `appointmentTrend` (lines 155-176) with:

```javascript
  const appointmentTrend = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }),
        count: 0,
      });
    }
    const index = Object.fromEntries(months.map((m, i) => [m.key, i]));
    (monthlyTrend || []).forEach((row) => {
      const idx = index[row.month];
      if (idx !== undefined) months[idx].count = row.count;
    });
    return months;
  }, [monthlyTrend]);
```

- [ ] **Step 6: Point the collapsed settings display at the summary**

The collapsed clinic-card settings (lines 986-1007) read `clinicDetails[clinic.id]?.settings?.*`. For the collapsed view use the summary instead so it shows without lazy-loading. Replace those reads:
- `clinicDetails[clinic.id]?.settings?.clinicName || 'Dental Clinic'` → `summaryByClinicId[clinic.id]?.settings?.clinicName || 'Dental Clinic'`
- `clinicDetails[clinic.id]?.settings?.workingHours?.start || '09:00'` → `summaryByClinicId[clinic.id]?.settings?.workingHours?.start || '09:00'`
- `clinicDetails[clinic.id]?.settings?.workingHours?.end || '18:00'` → `summaryByClinicId[clinic.id]?.settings?.workingHours?.end || '18:00'`
- `clinicDetails[clinic.id]?.settings?.slotDuration || 30` → `summaryByClinicId[clinic.id]?.settings?.slotDuration || 30`
- `clinicDetails[clinic.id]?.settings?.phone || '-'` → `summaryByClinicId[clinic.id]?.settings?.phone || '-'`

(The expanded analytics block at lines 779-830 and the `activity` list at line 966 still use `clinicDetails` — leave those; they are populated by `ensureClinicDetails` when the card expands.)

- [ ] **Step 7: Browser verification — the core fix**

Run the dev server, log in as admin, open the dashboard with DevTools Network open. Reload.
- Expected: on load, ~4 XHR/fetch requests (clinics, users, admin activity, `rpc/admin_dashboard_summary`) plus auth — NOT thousands.
- Expected: no `net::ERR_INSUFFICIENT_RESOURCES` in console.
- Expected: "Failed to load admin data." banner is gone; clinic cards show correct patient/appointment/staff/room counts; the Overview appointment-trend chart renders.

- [ ] **Step 8: Regression check — counts accuracy**

Pick one clinic on the dashboard, note its displayed counts, and compare to SQL:
```sql
select
  (select count(*) from public.apt_patients where clinic_id = '<id>') as patients,
  (select count(*) from public.appointments where clinic_id = '<id>') as appointments,
  (select count(*) from public.apt_staff where clinic_id = '<id>') as staff;
```
Expected: displayed numbers match. (Note: patient counts may now be HIGHER than before the change for clinics with >50 patients, because the old fan-out capped patients at limit=50 — this is a correctness improvement, not a regression.)

- [ ] **Step 9: Commit**

```bash
git add src/components/AdminDashboard.jsx
git commit -m "perf(admin): load dashboard via aggregation RPC, ending the request flood

refresh() no longer fires 8 queries per clinic (~3,024 concurrent for
378 clinics). Counts, settings, and the appointment trend come from
admin_dashboard_summary(); full per-clinic lists load on demand.
Fixes ERR_INSUFFICIENT_RESOURCES / 'Failed to load admin data' and the
refresh-time auto-logout caused by the flood starving the SSO exchange."
```

---

### Task 5: Final end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full dashboard smoke test**

As admin: load dashboard (no flood, no banner), switch Overview/Clinics/Users/History tabs, expand a clinic (details lazy-load), open Manage on a clinic (details present), open a View-Details sub-list (patients/staff/rooms/treatments populate). All render without console errors.

- [ ] **Step 2: Refresh no longer logs out**

Hard-refresh the dashboard 3 times. Expected: stays logged in (the flood that previously starved `GET /sso/exchange` is gone). If logout STILL occurs, note it — it is a separate auth issue (per spec, out of scope) to be investigated independently, not a failure of this plan.

- [ ] **Step 3: Confirm clean git state**

```bash
git status --short
git log --oneline cloudflared..HEAD
```
Expected: clean tree; commits for Tasks 1-4 present.

---

## Self-Review

**Spec coverage:**
- Tier 1 RPC (counts + settings + trend, admin-gated) → Task 1. ✓
- DataStore wrapper → Task 2. ✓
- Tier 2 on-demand detail + cache → Task 3. ✓
- refresh() rewrite + memos rewired → Task 4. ✓
- Error handling (global banner on RPC fail; localized `detailError` on detail fail) → Task 4 Step 2 + Task 3 Step 1. ✓
- Tests (RPC counts, trend, admin-gate presence, browser request count, regression) → Task 1 Steps 2-3, Task 4 Steps 7-8, Task 5. ✓
- Auto-logout treated as indirectly fixed / flagged if persists → Task 5 Step 2. ✓
- schema.sql mirror → Task 1 Step 4. ✓

**Placeholder scan:** Task 3 Step 4 references `<clinicIdVariableInScope>` — this is intentional (the exact variable depends on the single call site the implementer will see); instruction is explicit about using the in-scope id. No code placeholders elsewhere.

**Type consistency:** `getAdminDashboardSummary()` returns `{ summaryByClinicId, monthlyTrend }` (Task 2) — consumed with those exact names in Task 4 Steps 1-2. `summaryByClinicId[id].settings.{clinicName,workingHours:{start,end},slotDuration,phone}` (Task 2) matches reads in Task 4 Step 6. `monthlyTrend[].{month,count}` (Task 2) matches Task 4 Step 5. `ensureClinicDetails(clinicId)` (Task 3) called in Task 3 Steps 2-4. Consistent.
