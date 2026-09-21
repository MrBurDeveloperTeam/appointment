import { todayISO } from './date';

export const getRequestDate = (request) =>
  request.appointmentDate ||
  request.preferredDates?.[0] ||
  '';

export const getRequestTime = (request) =>
  request.appointmentStartTime ||
  request.preferredTimes?.[0] ||
  '';

export const isRequestExpired = (
  request,
  now = new Date()
) => {
  const date = getRequestDate(request);
  const time = getRequestTime(request);

  if (!date) return false;

  const today = todayISO();

  if (date < today) return true;
  if (date > today) return false;

  if (!time) return false;

  const currentTime =
    `${String(now.getHours()).padStart(2, '0')}:` +
    `${String(now.getMinutes()).padStart(2, '0')}`;

  return time <= currentTime;
};

export const getEffectiveRequestStatus = (
  request
) => {
  if (
    request.status === 'pending' &&
    isRequestExpired(request)
  ) {
    return 'expired';
  }

  return request.status;
};