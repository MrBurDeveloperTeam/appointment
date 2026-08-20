/**
 * Pushes a single clinic/appointment activity event to Odoo via the shared
 * `snabbb-worker` Cloudflare Worker (the one bound to the Workers Route
 * `appointment.snabbb.com/api/*`). Mirrors the same sync built for the
 * inventory app (see logActivityToOdoo.ts / ACTIVITY_TRACKER_ODOO_SYNC.md in
 * the inventory repo) — same idempotency key pattern, same best-effort
 * fire-and-forget semantics, same X-Snabbb-Api-Key + email auth model.
 *
 * IMPORTANT: this worker already has its OWN pre-existing route at
 * `/api/activity` (JWT-authenticated, reads/writes `apt_activity_log`
 * directly via a service-role Supabase client, keyed by clinicId — see
 * `getActivity`/`addActivity` in `./supabase/activity.js` on the worker
 * side). That route is unrelated to this Odoo sync and must NOT be reused,
 * for the exact same reason the inventory app couldn't reuse it either:
 * `if (url.pathname === ...)` blocks match top-to-bottom, so anything
 * posted to `/api/activity` without an `Authorization: Bearer <JWT>` header
 * gets rejected by that earlier handler before this code would ever run.
 * Use `/api/appointment/activity` instead.
 *
 * This call is best-effort: activity logging must never block the UI or
 * fail the local (Supabase) audit trail, so callers should fire-and-forget
 * it and swallow/log errors rather than await + throw.
 */

const ACTIVITY_ENDPOINT = "/api/appointment/activity";

/**
 * @param {{
 *   logId: string,                 // Supabase apt_activity_log row id -> idempotency key
 *   actorEmail: string | null,
 *   actorName: string | null,
 *   supabaseUserId: string | null,
 *   clinicId: string | null,       // null for admin-level activity (no clinic)
 *   type: string,                  // e.g. "patient_added", "appointment_updated", "page_view", ...
 *   description: string,
 *   occurredAt: string,            // ISO timestamp
 *   pagePath?: string | null,              // e.g. "/patients" — only set for type: "page_view"
 *   pageDurationSeconds?: number | null,   // only set for type: "page_view"
 * }} params
 * @returns {Promise<boolean>}
 */
export async function logActivityToOdoo(params) {
  if (!params.actorEmail) {
    // Nothing to resolve the Odoo partner by — skip rather than send a
    // request we know the backend will reject.
    console.warn("Skipping Odoo activity sync: no actor email available.");
    return false;
  }

  const payload = {
    external_ref: `apt-activity-${params.logId}`,
    actor_email: params.actorEmail,
    actor_name: params.actorName ?? null,
    supabase_user_id: params.supabaseUserId ?? null,
    clinic_id: params.clinicId ?? null,
    type: params.type,
    description: params.description,
    occurred_at: params.occurredAt,
    // Structured page-view fields — the appointment_activity_log Odoo module
    // has dedicated page_path / page_duration_seconds columns (with their
    // own list/form/search filters) specifically for type: "page_view"
    // events, rather than only the free-text description. Omitted for every
    // other event type.
    ...(params.pagePath != null ? { page_path: params.pagePath } : {}),
    ...(params.pageDurationSeconds != null ? { page_duration_seconds: params.pageDurationSeconds } : {}),
  };

  try {
    const res = await fetch(ACTIVITY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) {
      console.error("Failed to sync activity to Odoo:", data?.error || res.status);
      return false;
    }
    return true;
  } catch (err) {
    // Best-effort: the worker/Odoo being unreachable should never break local activity logging.
    console.error("Failed to sync activity to Odoo:", err?.message || err);
    return false;
  }
}
