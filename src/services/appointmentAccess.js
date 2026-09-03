import {
  supabase,
} from "../lib/supabaseClient";

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

export async function getAppointmentAccess() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      "Unable to read your login session"
    );
  }

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