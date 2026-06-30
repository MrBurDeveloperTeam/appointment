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

// Statuses that no longer occupy a slot and so should never count as a conflict.
const NON_BLOCKING_STATUSES = new Set(['cancelled', 'no-show']);

/**
 * Find existing appointments (app-shaped: camelCase startTime/endTime/duration/date/status/id)
 * whose time overlaps the candidate on the same date, in the same clinic.
 * @param {{date:string,startTime:string,duration:number}} candidate
 * @param {Array} appointments - existing appointments already scoped to the active clinic
 * @param {string|null} [ignoreId] - appointment id to skip (the one being edited)
 * @returns {Array} the conflicting appointments
 */
export const findAppointmentConflicts = (candidate, appointments, ignoreId = null) => {
  if (!candidate) return [];
  const start = toMinutes(candidate.startTime);
  if (!candidate.date || start == null) return [];
  const end = start + Number(candidate.duration || 0);
  return (appointments || []).filter((a) => {
    if (!a) return false;
    if (ignoreId && a.id === ignoreId) return false;
    if (a.date !== candidate.date) return false;
    if (NON_BLOCKING_STATUSES.has(a.status)) return false;
    const aStart = toMinutes(a.startTime);
    const aEnd = a.endTime ? toMinutes(a.endTime) : (aStart == null ? null : aStart + (a.duration || 30));
    if (aStart == null || aEnd == null) return false;
    return intervalsOverlap(start, end, aStart, aEnd);
  });
};
