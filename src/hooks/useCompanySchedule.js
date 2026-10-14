import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getAppointmentAccess, APPOINTMENT_PERMISSIONS } from '../services/appointmentAccess';
import { getWorkspaceType } from '../services/workspaceContext';

export async function fetchCompanySchedule(start, end, personalClinicId) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Please log in again.');
  const { data: memberships, error } = await supabase.from('company_members')
    .select('company_owner_user_id').eq('member_user_id', user.id).eq('status', 'active');
  if (error) throw error;
  const results = await Promise.all([...new Set((memberships || []).map(m => m.company_owner_user_id))].map(async ownerId => {
    const access = await getAppointmentAccess(ownerId);
    if (!access.permissions?.[APPOINTMENT_PERMISSIONS.SCHEDULE] || !access.clinicId || access.clinicId === personalClinicId) return [];
    const { data: allowed, error: accessError } = await supabase.rpc('can_access_clinic', { p_clinic_id: access.clinicId });
    if (accessError || !allowed) throw new Error('Company schedule access requires a database update. Your personal appointments are still available.');
    const { data: staff, error: staffError } = await supabase.from('apt_staff')
      .select('id').eq('clinic_id', access.clinicId).eq('user_id', user.id).eq('role', 'dentist');
    if (staffError) throw staffError;
    if (!staff?.length) return [];
    const { data: owner } = await supabase.from('profiles').select('company_name').eq('user_id', ownerId).maybeSingle();
    const { data: clinic, error: clinicError } = await supabase.from('apt_clinics').select('name').eq('id', access.clinicId).single();
    if (clinicError) throw clinicError;
    const { data: rows, error: rowsError } = await supabase.from('appointments')
      .select('id,clinic_id,date,start_time,end_time,duration,status,dentist_id')
      .eq('clinic_id', access.clinicId).in('dentist_id', staff.map(s => s.id))
      .gte('date', start).lte('date', end);
    if (rowsError) throw rowsError;
    return (rows || []).map(a => ({ id: a.id, clinicId: a.clinic_id, date: a.date,
      startTime: a.start_time, endTime: a.end_time, duration: a.duration, status: a.status,
      dentistId: null, sourceDentistId: a.dentist_id, readOnly: true,
      companyName: owner?.company_name || clinic.name, workspaceOwnerUserId: ownerId }));
  }));
  return results.flat();
}

export default function useCompanySchedule(clinicId, start, end, enabled) {
  const [state, setState] = useState({ appointments: [], error: '', loading: false });
  useEffect(() => {
    let cancelled = false;
    setState({ appointments: [], error: '', loading: false });
    if (!enabled || !clinicId || !start || !end || getWorkspaceType() !== 'personal') return;
    setState({ appointments: [], error: '', loading: true });
    fetchCompanySchedule(start, end, clinicId).then(appointments => {
      if (!cancelled) setState({ appointments, error: '', loading: false });
    }).catch(error => {
      if (!cancelled) setState({ appointments: [], error: error.message || 'Unable to load company appointments.', loading: false });
    });
    return () => { cancelled = true; };
  }, [clinicId, start, end, enabled]);
  return state;
}
