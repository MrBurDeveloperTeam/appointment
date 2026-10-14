import {
  supabase,
} from "../lib/supabaseClient";
import { getWorkspaceHeaders } from './workspaceContext';

export const APPOINTMENT_PERMISSIONS = {
  SCHEDULE: "appointment.schedule.access",
  MANAGE: "appointment.manage",
  PATIENTS: "appointment.patients.access",
  REQUESTS: "appointment.requests.manage",
  REPORTS: "appointment.reports.view",
  SETTINGS: "appointment.settings.manage",
};

function getAccessContextUrl() {
  const apiBase =
    import.meta.env.VITE_API_BASE_URL
      ?.replace(/\/$/, "");

  /*
   * If VITE_API_BASE_URL is:
   * https://app.snabbb.com/api
   *
   * this becomes:
   * https://app.snabbb.com/api/company/access-context
   */
  if (apiBase) {
    return (
      `${apiBase}/company/access-context` +
      "?app=appointment"
    );
  }

  /*
   * Same-origin fallback for the production
   * Appointment domain.
   */
  return (
    "/api/company/access-context" +
    "?app=appointment"
  );
}

/*
 * AuthProvider (profile load), App (permission revalidation) and
 * useCompanySchedule all ask for the access context during startup, so the
 * same request used to go out 3+ times at ~500ms each. Identical requests
 * (same user + same workspace) now share one in-flight call, and a successful
 * result is reused for a few seconds. Failures are never cached, the key
 * includes the signed-in user id (a different account never reuses it), and
 * the window is short enough that revalidation on a later mount still hits
 * the server.
 */
const ACCESS_REUSE_MS = 10 * 1000;
const accessRequests = new Map(); // key -> { promise, settledAt }

export async function getAppointmentAccess(workspaceOwnerUserId) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      "Unable to read your login session"
    );
  }

  const workspaceKey = workspaceOwnerUserId
    ? `company:${workspaceOwnerUserId}`
    : JSON.stringify(getWorkspaceHeaders());
  const key = `${session?.user?.id ?? "anon"}|${workspaceKey}`;

  const existing = accessRequests.get(key);
  if (
    existing &&
    (existing.settledAt === null || Date.now() - existing.settledAt < ACCESS_REUSE_MS)
  ) {
    return existing.promise;
  }

  const entry = { promise: null, settledAt: null };
  entry.promise = fetchAppointmentAccess(session, workspaceOwnerUserId).then(
    (result) => {
      entry.settledAt = Date.now();
      return result;
    },
    (error) => {
      if (accessRequests.get(key) === entry) accessRequests.delete(key);
      throw error;
    }
  );
  accessRequests.set(key, entry);
  return entry.promise;
}

async function fetchAppointmentAccess(session, workspaceOwnerUserId) {
  const accessToken =
    session?.access_token;

  if (!accessToken) {
    throw new Error(
      "Your login session is unavailable. Please log in again."
    );
  }

  const response = await fetch(
    getAccessContextUrl(),
    {
      method: "GET",
      credentials: "include",
      headers: {
        ...(workspaceOwnerUserId ? { 'X-Snabbb-Workspace-Type': 'company', 'X-Snabbb-Workspace-User-Id': workspaceOwnerUserId } : getWorkspaceHeaders()),
        Accept: "application/json",
        Authorization:
          `Bearer ${accessToken}`,
      },
    }
  );

  const result = await response
    .json()
    .catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error ||
      `Unable to load Appointment access (${response.status})`
    );
  }

  return result;
}

export function hasAppointmentPermission(
  access,
  permission
) {
  return (
    access?.permissions?.[permission] === true
  );
}
