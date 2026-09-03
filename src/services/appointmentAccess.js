export const APPOINTMENT_PERMISSIONS = {
  SCHEDULE: "appointment.schedule.access",
  MANAGE: "appointment.manage",
  PATIENTS: "appointment.patients.access",
  REQUESTS: "appointment.requests.manage",
  REPORTS: "appointment.reports.view",
  SETTINGS: "appointment.settings.manage",
};

export async function getAppointmentAccess() {
  const response = await fetch(
    "/api/company/access-context?app=appointment",
    {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const result = await response
    .json()
    .catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.error ||
      "Unable to load Appointment access"
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