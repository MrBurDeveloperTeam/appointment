export const formatTime = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

export const addMinutes = (time, minutesToAdd) => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + Number(minutesToAdd || 0);
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

export const minutesToTime = (minutes) => {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const h = Math.floor(clamped / 60) % 24;
  const m = Math.round(clamped % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
