import { getExternalBusySlots, externalDoctorConflict, doctorConflictMessage } from '../services/doctorAvailability';
﻿import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { addMinutes, formatTime, minutesToTime } from '../utils/time';
import { todayISO } from '../utils/date';
import { getInitials } from '../utils/people';
import { useToast } from '../context/ToastProvider';
import { findAppointmentConflicts, isDateHoliday } from '../utils/availability';
import { hasAppointmentPassed, PAST_APPOINTMENT_MESSAGE } from '../utils/appointmentReadOnly';
import PatientFlag from './PatientFlag';
import SelectAutocomplete from './SelectAutocomplete';

// Turns a raw save failure (Supabase/Postgres/network) into something a
// receptionist can act on. Unknown errors still show the original text.
function friendlySaveError(err) {
  const raw = String((err && err.message) || err || '').trim();
  if (/exclusion|overlap|already booked/i.test(raw)) {
    return 'This time slot was just taken for the selected dentist. Please choose another time or dentist.';
  }
  if (/failed to fetch|network|offline|timed? ?out/i.test(raw)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (/permission|not authori[sz]ed|row-level security|jwt|policy/i.test(raw)) {
    return "You don't have permission to save this appointment. Please sign in again or contact your clinic admin.";
  }
  return raw ? `Could not save the appointment: ${raw}` : 'Could not save the appointment. Please try again.';
}

const APPOINTMENT_DURATION_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

export default function AppointmentForm({
  clinicId,
  patients,
  rooms,
  treatments,
  dentists,
  appointments,
  holidays,
  onSave,
  onDelete,
  onClose,
  settings,
  initialData,
  searchPatients,
  credits,
}) {
  const { addToast } = useToast();
  const defaultDuration = settings && settings.slotDuration ? settings.slotDuration : 30;
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Overlap warning: holds the conflicting appointments after a first save attempt;
  // a second submit while this is set proceeds (deliberate overbook).
  // Archived treatments are hidden from new bookings (but still shown, marked,
  // when an existing appointment already uses one).
  const activeTreatments = treatments.filter((t) => !t.archived);
  const [pendingConflicts, setPendingConflicts] = useState(null);
  // Persistent message shown above the footer when a save is blocked or fails:
  // { message, level: 'error' | 'warning' }. Toasts alone vanish and sit far
  // from the Save button.
  const [saveError, setSaveError] = useState(null);
  const [form, setForm] = useState({
    patientId: patients[0] ? patients[0].id : '',
    roomId: rooms[0] ? rooms[0].id : '',
    treatmentId: activeTreatments[0] ? activeTreatments[0].id : '',
    dentistId: dentists[0] ? dentists[0].id : '',
    date: todayISO(),
    startTime: '09:00',
    duration: defaultDuration,
    notes: '',
    status: 'confirmed',
    id: null,
  });
  const [durationOption, setDurationOption] = useState(APPOINTMENT_DURATION_OPTIONS.includes(Number(defaultDuration)) ? String(defaultDuration) : 'other');
  const treatmentInitRef = useRef(false);
  const hydratedInitialRef = useRef(null);
  const isEditing = Boolean(initialData && initialData.id);
  const [clock, setClock] = useState(() => new Date());
  const isReadOnly = isEditing && hasAppointmentPassed(initialData, clock);
  useEffect(() => {
    if (!isEditing) return;
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isEditing]);
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const now = new Date();
  const today = todayISO();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const minDate = isEditing ? undefined : today;
  
  // Working Hours Constraints
  const workingStart = settings?.workingHours?.start || '00:00';
  const workingEnd = settings?.workingHours?.end || '23:59';

  // If today, min time is the LATER of (Now, Working Start)
  // If future date, min time is Working Start
  let minTime = workingStart;
  if (!isEditing && form.date === today) {
    minTime = currentTime > workingStart ? currentTime : workingStart;
  }
  const maxTime = workingEnd;

  useEffect(() => {
    // Hydrate from initialData only once per initialData identity. Re-running on
    // patients/rooms/treatments/dentists changes would clobber the user's edits
    // (e.g. revert a changed time) when the data store re-renders.
    if (initialData && hydratedInitialRef.current !== initialData) {
      hydratedInitialRef.current = initialData;
      const initialDuration = Number(initialData.duration || defaultDuration);
      setDurationOption(APPOINTMENT_DURATION_OPTIONS.includes(initialDuration) ? String(initialDuration) : 'other');

      setForm((prev) => ({
        ...prev,
        ...initialData,
        duration: initialDuration,
        id: initialData.id || null,
        patientId: initialData.patientId || prev.patientId || (patients[0] ? patients[0].id : ''),
        roomId: initialData.roomId || prev.roomId || (rooms[0] ? rooms[0].id : ''),
        treatmentId: initialData.treatmentId || prev.treatmentId || (activeTreatments[0] ? activeTreatments[0].id : ''),
        dentistId: initialData.dentistId || prev.dentistId || (dentists[0] ? dentists[0].id : ''),
        status: initialData.status || prev.status || 'confirmed',
        notes: initialData.notes ?? prev.notes ?? '',
      }));
    }
  }, [initialData, patients, rooms, treatments, dentists, defaultDuration]);

  useEffect(() => {
    if (!form.patientId && patients[0]) {
      setForm((prev) => ({ ...prev, patientId: patients[0].id }));
    }
  }, [patients]);

  useEffect(() => {
    const hasDentistOverride =
      initialData && Object.prototype.hasOwnProperty.call(initialData, 'dentistId');
    if (!form.dentistId && dentists[0] && !hasDentistOverride) {
      setForm((prev) => ({ ...prev, dentistId: dentists[0].id }));
    }
  }, [dentists]);

  useEffect(() => {
    if (!form.treatmentId) return;
    if (isEditing && !treatmentInitRef.current) {
      treatmentInitRef.current = true;
      return;
    }
    const nextTreatment = treatments.find((t) => String(t.id) === String(form.treatmentId));
    if (nextTreatment) { const treatmentDuration = Number(nextTreatment.duration); if (Number.isFinite(treatmentDuration) && treatmentDuration > 0) { setForm((prev) => ({ ...prev, duration: treatmentDuration })); setDurationOption(APPOINTMENT_DURATION_OPTIONS.includes(treatmentDuration) ? String(treatmentDuration) : 'other'); } }
  }, [form.treatmentId, treatments, isEditing]);

  const endTime = useMemo(() => addMinutes(form.startTime, form.duration), [form.startTime, form.duration]);

  // If the slot changes, drop any stale overlap confirmation so the user must re-confirm.
  useEffect(() => {
    setPendingConflicts(null);
  }, [form.date, form.startTime, form.duration]);

  // Any edit means the user is fixing the problem: drop the stale message.
  useEffect(() => {
    setSaveError(null);
  }, [form]);

  const selectedPatient = patients.find((p) => String(p.id) === String(form.patientId));
  const selectedTreatment = treatments.find((t) => String(t.id) === String(form.treatmentId));
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!patientQuery) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (searchPatients) {
        setIsSearching(true);
        try {
          // If we have less than 50 patients locally, we *could* filter locally, 
          // but to be consistent with potential large datasets, let's always ask the server 
          // or at least favor the server results if we can't find it locally.
          // For now, let's rely on server search.
          const results = await searchPatients(patientQuery);
          setSearchResults(results);
        } catch (err) {
          console.error("Search failed", err);
        } finally {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [patientQuery, searchPatients]);

  const filteredPatients = useMemo(() => {
    if (!patientQuery) return patients;
    return searchResults;
  }, [patients, patientQuery, searchResults]);

  const [externalBusy, setExternalBusy] = useState([]);
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const availabilityCheckRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setExternalBusy([]);
    setAvailabilityError('');
    if (!clinicId || !form.date || isReadOnly) return;
    setAvailabilityLoading(true);
    getExternalBusySlots(clinicId, form.date).then(slots => {
      if (!cancelled) setExternalBusy(slots);
    }).catch(error => {
      if (!cancelled) setAvailabilityError(error.message);
    }).finally(() => { if (!cancelled) setAvailabilityLoading(false); });
    return () => { cancelled = true; };
  }, [clinicId, form.date, isReadOnly]);
  const selectedExternalConflict = externalDoctorConflict(externalBusy, form.dentistId, form.startTime, form.duration);

  const isDentistBusy = (dentistId) => {
    if (!dentistId) return false;
    if (externalDoctorConflict(externalBusy, dentistId, form.startTime, form.duration)) return true;
    return appointments.some((apt) => {
      if (apt.id === form.id) return false;
      if (apt.dentistId !== dentistId) return false;
      if (apt.date !== form.date) return false;
      const aptEnd = apt.endTime || addMinutes(apt.startTime, apt.duration || 30);
      return form.startTime < aptEnd && endTime > apt.startTime;
    });
  };

  const dentistAvailability = (dentist) => {
    const dayIndex = new Date(form.date).getDay();
    const worksToday = dentist.workingDays ? dentist.workingDays.indexOf(dayIndex) !== -1 : true;
    if (!worksToday) return 'off-duty';
    return isDentistBusy(dentist.id) ? 'busy' : 'available';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || availabilityCheckRef.current) return;
    // Show the reason inline (stays until the user changes something) and as a toast.
    const fail = (message, level = 'error', duration) => {
      setSaveError({ message, level });
      addToast(message, level, duration);
    };
    setSaveError(null);
    if (isEditing && hasAppointmentPassed(initialData)) {
      setClock(new Date());
      fail(PAST_APPOINTMENT_MESSAGE, 'warning');
      return;
    }
    if (!isEditing && credits < 1) {
      fail('Insufficient credits to create a new appointment.', 'error');
      return;
    }
    if (!form.patientId) { fail('Please select a patient.', 'warning'); return; }
    if (!form.date) { fail('Please choose a date.', 'warning'); return; }
    if (!form.startTime) { fail('Please choose a start time.', 'warning'); return; }

    const duration = Number(form.duration);

    if (!Number.isInteger(duration) || duration <= 0) {
      fail('Enter a valid appointment duration.', 'error');
      return;
    }

    if (!isEditing && (form.date < today || (form.date === today && form.startTime <= currentTime))) {
      fail('Please choose a future date and time.', 'warning');
      return;
    }

    // Working Hours Validation
    if (settings && settings.workingHours) {
      const { start, end } = settings.workingHours;
      if (start && end) {
        if (form.startTime < start || endTime > end) {
          fail(`Appointment must be within working hours (${formatTime(start)} - ${formatTime(end)}).`, 'warning');
          return;
        }
      }
    }

    // Holiday block (hard stop, no override). The clinic is closed on holidays;
    // to open a holiday, remove it in Settings > Holidays.
    if (isDateHoliday(form.date, holidays)) {
      fail('This date is a clinic holiday. Please choose another date.', 'warning');
      return;
    }

    // Refresh external availability on every save, including "Book anyway".
    // The database constraint remains authoritative for racing writes.
    if (form.dentistId && !['cancelled', 'no-show'].includes(form.status)) {
      availabilityCheckRef.current = true;
      setCheckingAvailability(true);
      try {
        const slots = await getExternalBusySlots(clinicId, form.date);
        setExternalBusy(slots);
        setAvailabilityError('');
        const conflict = externalDoctorConflict(slots, form.dentistId, form.startTime, duration);
        if (conflict) { fail(doctorConflictMessage(conflict), 'warning', 6000); return; }
      } catch (error) {
        setAvailabilityError(error.message);
        fail(error.message || 'Could not check the doctor\'s availability. Please try again.', 'error');
        return;
      } finally {
        availabilityCheckRef.current = false;
        setCheckingAvailability(false);
      }
    }

    // Overlap check (warn + allow override). Same clinic, selected dentist; cancelled/no-show ignored.
    // First attempt with conflicts shows a centered toast + flips the button to
    // "Book anyway"; a second submit proceeds (deliberate overbook).
    if (!pendingConflicts) {
      const editingId = initialData && initialData.id ? initialData.id : form.id;
      const conflicts = findAppointmentConflicts(
        { date: form.date, startTime: form.startTime, duration: form.duration, dentistId: form.dentistId },
        appointments,
        editingId
      );
      if (conflicts.length > 0) {
        const detail = conflicts
          .map((c) => {
            const cEnd = c.endTime || addMinutes(c.startTime, c.duration || 30);
            const who = patients.find((p) => String(p.id) === String(c.patientId));
            return `${formatTime(c.startTime)}–${formatTime(cEnd)}${who ? ` (${who.name})` : ''}`;
          })
          .join(', ');
        fail(
          `This time overlaps ${conflicts.length} existing appointment${conflicts.length > 1 ? 's' : ''}: ${detail}. Click "Book anyway" to overbook.`,
          'warning',
          6000
        );
        setPendingConflicts(conflicts);
        return;
      }
    }

    setIsSubmitting(true);
    // Wrap async call
    Promise.resolve(onSave({
      ...form,
      duration,
      endTime,
      status: form.status || 'confirmed',
      id: initialData && initialData.id ? initialData.id : form.id,
    }))
      .catch((err) => {
        // The parent already toasts and rethrows; keep the modal open and
        // show the reason right above the Save button too.
        console.error("Save failed", err);
        setSaveError({ message: friendlySaveError(err), level: 'error' });
      })
      .finally(() => {
        // Only set submitting to false if we are still mounted/didn't close
        // Note: If onSave closes the modal, this setState might run on unmounted component
        // But React 18 handles this gracefully usually.
        setIsSubmitting(false);
      });
  };

  const handlePatientSelect = (patientId) => {
    setForm((prev) => ({ ...prev, patientId }));
    setShowPatientPicker(false);
    setPatientQuery('');
  };

  const handleTreatmentChange = (value) => {
    setForm((prev) => ({ ...prev, treatmentId: value }));
  };

  const statusOptions = [
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'pending', label: 'Pending' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'no-show', label: 'No Show' },
  ];


  const showCreditWarning = !isEditing && credits < 1;


  return (
    <Modal title={isReadOnly ? 'Appointment Details' : isEditing ? 'Edit Appointment' : 'New Appointment'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="modal-body">
          {isReadOnly && <p role="status">{PAST_APPOINTMENT_MESSAGE}</p>}
          <fieldset disabled={isReadOnly || checkingAvailability || isSubmitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="form-group">
            <label className="form-label">Patient</label>
            <div className="patient-item selected patient-picker-item" style={{ cursor: 'default' }}>
              <div className="patient-item-main">
                <div className="patient-avatar">{selectedPatient ? getInitials(selectedPatient.name) : 'P'}</div>
                <div className="patient-info">
                  <div className="patient-name">{selectedPatient ? selectedPatient.name || 'Unnamed patient' : 'Select patient'}</div>
                  <div className="patient-contact">
                    {selectedPatient ? selectedPatient.phone || selectedPatient.email || 'No contact info' : 'No patient selected'}
                  </div>
                </div>
              </div>
              {selectedPatient?.is_flagged === true && <PatientFlag className="patient-picker-flag" />}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPatientPicker((prev) => !prev)}
              >
                Change
              </button>
            </div>
            {showPatientPicker && !isReadOnly && (
              <div className="patient-picker">
                <input
                  className="search-input"
                  placeholder="Search patients..."
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
                <div className="patient-list">
                  {isSearching && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Searching...</div>}
                  {!isSearching && filteredPatients.map((p) => (
                    <div
                      key={p.id}
                      className={`patient-item patient-picker-item ${String(form.patientId) === String(p.id) ? 'selected' : ''}`}
                      onClick={() => handlePatientSelect(p.id)}
                    >
                      <div className="patient-avatar">{getInitials(p.name)}</div>
                      <div className="patient-info">
                        <div className="patient-name">{p.name || 'Unnamed patient'}</div>
                        <div className="patient-contact">{p.phone || p.email || 'No contact info'}</div>
                      </div>
                      {p.is_flagged === true && <PatientFlag className="patient-picker-flag" />}
                    </div>
                  ))}
                  {!isSearching && filteredPatients.length === 0 && (
                    <div className="empty-state" style={{ padding: 12 }}>
                      No matching patients.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                className="form-input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                min={minDate}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Time</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  className="form-select"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  required
                >
                  {(() => {
                    const startMin = Number(workingStart.split(':')[0]) * 60 + Number(workingStart.split(':')[1]);
                    const endMin = Number(workingEnd.split(':')[0]) * 60 + Number(workingEnd.split(':')[1]);
                    const step = 15; // fixed step for dropdown
                    const slots = [];

                    for (let m = startMin; m < endMin; m += step) {
                      const timeStr = minutesToTime(m);
                      // If today, filter out past times
                      if (!isEditing && form.date === today && timeStr <= currentTime) {
                        continue;
                      }
                      slots.push(timeStr);
                    }

                    // If current startTime is not in slots (e.g. from editing an odd time), add it
                    if (form.startTime && !slots.includes(form.startTime)) {
                      slots.push(form.startTime);
                      slots.sort();
                    }

                    if (slots.length === 0) return <option disabled>No slots available</option>;

                    return slots.map(t => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ));
                  })()}
                </select>
                <span className="text-muted" style={{ fontSize: 12 }}>to</span>
                <input className="form-input" type="time" value={endTime} readOnly disabled style={{ background: 'var(--bg-secondary)' }} />
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Treatment</label>
              <select
                className="form-select"
                value={form.treatmentId}
                onChange={(e) => handleTreatmentChange(e.target.value)}
              >
                <option value="">None</option>
                {treatments
                  .filter((t) => !t.archived || String(t.id) === String(form.treatmentId))
                  .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.archived ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Duration (mins)</label>

              <select className="form-select" value={durationOption} onChange={(e) => { const value = e.target.value; setDurationOption(value); setForm((current) => ({ ...current, duration: value === 'other' ? '' : Number(value) })); }}>
                {APPOINTMENT_DURATION_OPTIONS.map((duration) => <option key={duration} value={String(duration)}>{duration}</option>)}
                <option value="other">Others</option>
              </select>

              {durationOption === 'other' && (
                <input className="form-input mt-2" type="number" min="1" step="1" inputMode="numeric" placeholder="Enter duration in minutes" value={form.duration} onChange={(e) => setForm((current) => ({ ...current, duration: e.target.value === '' ? '' : Number(e.target.value) }))} />
              )}
            </div>
          </div>

          {selectedTreatment && (
            <div className="form-group">
              <div className="patient-contact" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span className="patient-source-badge">{selectedTreatment.duration} mins default</span>
                {selectedTreatment.suppliesNeeded && selectedTreatment.suppliesNeeded.length > 0 && (
                  <span className="patient-source-badge">
                    Supplies: {(selectedTreatment.suppliesDetail?.length
                      ? selectedTreatment.suppliesDetail.map((r) => (r.qty > 1 || r.uom ? `${r.name} ×${r.qty}${r.uom ? ` ${r.uom.toUpperCase()}` : ''}` : r.name))
                      : selectedTreatment.suppliesNeeded
                    ).join(', ')}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Dentist</label>
            <SelectAutocomplete
              ariaLabel="Dentist"
              placeholder="Search dentist…"
              value={form.dentistId}
              onChange={(id) => setForm((prev) => ({ ...prev, dentistId: id }))}
              options={[
                {
                  value: '',
                  label: 'Unassigned',
                  leading: <span className="ac-avatar" style={{ background: '#9CA3AF' }}>U</span>,
                },
                ...dentists.map((d) => {
                  const availability = dentistAvailability(d);
                  return {
                    value: d.id,
                    label: d.name,
                    leading: <span className="ac-avatar" style={{ background: d.color || '#4A90A4' }}>{getInitials(d.name)}</span>,
                    meta: availability === 'busy' ? 'Busy' : availability === 'off-duty' ? 'Off duty' : 'Available',
                    trailing: <span className={`ac-status ${availability}`}></span>,
                  };
                }),
              ]}
            />
            {availabilityLoading && <p role="status">Checking availability across workspaces...</p>}
            {availabilityError && <p role="alert">{availabilityError}</p>}
            {selectedExternalConflict && (
              <div className="doctor-conflict-notice" role="alert" aria-atomic="true">
                <svg className="doctor-conflict-notice__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="doctor-conflict-notice__content">
                  <strong className="doctor-conflict-notice__title">Doctor unavailable</strong>
                  <span className="doctor-conflict-notice__time">{formatTime(selectedExternalConflict.start_time)} – {formatTime(selectedExternalConflict.end_time)}</span>
                  <p>Already booked in another workspace. Choose another time or dentist.</p>
                </div>
              </div>
            )}
            <div className="dentist-availability-hint">
              <div className="availability-legend">
                <span className="availability-legend-dot available"></span> Available
              </div>
              <div className="availability-legend">
                <span className="availability-legend-dot busy"></span> Busy
              </div>
              <div className="availability-legend">
                <span className="availability-legend-dot off-duty"></span> Off Duty
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Room</label>
            <SelectAutocomplete
              ariaLabel="Room"
              placeholder="Search room…"
              value={form.roomId}
              onChange={(id) => setForm((prev) => ({ ...prev, roomId: id }))}
              options={[
                { value: '', label: 'Unassigned', leading: <span className="ac-dot" style={{ background: '#9CA3AF' }}></span> },
                ...rooms.map((r) => ({
                  value: r.id,
                  label: r.name,
                  leading: <span className="ac-dot" style={{ background: r.color }}></span>,
                })),
              ]}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <div className="status-pills">
              {statusOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`status-pill ${form.status === option.id ? 'selected' : ''}`}
                  onClick={() => setForm({ ...form, status: option.id })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              rows="3"
              style={{ resize: 'none' }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          </fieldset>
        </div>

        {saveError && (
          <div className={`form-save-error ${saveError.level}`} role="alert" aria-live="assertive">
            <svg className="form-save-error__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4.5M12 16h.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="form-save-error__text">{saveError.message}</span>
            <button type="button" className="form-save-error__close" aria-label="Dismiss message" onClick={() => setSaveError(null)}>×</button>
          </div>
        )}

        <div className="modal-footer">
          {showCreditWarning && (
            <div style={{ color: 'var(--danger)', fontWeight: 'bold', marginRight: 'auto', fontSize: 'var(--font-size-sm)' }}>
              Insufficient Credits (0)
            </div>
          )}
          <div className="flex-1"></div>
          {isEditing && !isReadOnly && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={isSubmitting}
              onClick={() => {
                if (hasAppointmentPassed(initialData)) {
                  setClock(new Date());
                  addToast(PAST_APPOINTMENT_MESSAGE, 'warning');
                  return;
                }
                onDelete && onDelete(form);
              }}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              '--surface': '#E8F6F4',
              '--surface-2': '#E8F6F4',
              '--bg-hover': '#D8F0ED',
              '--border-strong': 'rgba(42, 157, 143, 0.28)',
              '--text-primary': '#1F7A6F',
              '--text-secondary': '#1F7A6F',
              '--text-muted': '#2A9D8F',
            }}
          >
            {isReadOnly ? 'Close' : 'Cancel'}
          </button>

          {!isReadOnly && (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={showCreditWarning || isSubmitting || checkingAvailability}
              style={{
                '--primary-dark': '#5AB8AE',
                '--primary': '#5AB8AE',
              }}
            >
              {isSubmitting
                ? (isEditing ? 'Saving...' : 'Creating...')
                : pendingConflicts
                  ? 'Book anyway'
                  : (isEditing ? 'Save Appointment' : 'Create Appointment')
              }
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
