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
