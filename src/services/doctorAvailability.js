import { intervalsOverlap, toMinutes } from '../utils/availability';
import { formatTime } from '../utils/time';

export async function getExternalBusySlots(clinicId, date) {
  if (!clinicId || !date) throw new Error('Clinic and date are required to check doctor availability.');
  const { supabase } = await import('../lib/supabaseClient');
  const { data, error } = await supabase.rpc('apt_external_busy_slots', {
    p_clinic_id: clinicId, p_date: date,
  });
  if (error) throw new Error('Unable to check cross-workspace availability. Please try again or contact your administrator.');
  if (!Array.isArray(data)) throw new Error('Unable to verify doctor availability.');
  return data;
}

export function externalDoctorConflict(busy, dentistId, startTime, duration) {
  if (!dentistId) return null;
  const start = toMinutes(startTime);
  if (start == null) return null;
  return busy.find(slot => String(slot.dentist_id) === String(dentistId)
    && intervalsOverlap(start, start + Number(duration), toMinutes(slot.start_time), toMinutes(slot.end_time))) || null;
}

export function doctorConflictMessage(slot) {
  return `This doctor is unavailable from ${formatTime(slot.start_time)}–${formatTime(slot.end_time)} due to an appointment in another workspace. Choose another time or dentist.`;
}
