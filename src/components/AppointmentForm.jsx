import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { addMinutes, formatTime, minutesToTime } from '../utils/time';
import { todayISO } from '../utils/date';
import { getInitials } from '../utils/people';
import { getColorBg } from '../utils/colors';
import { useToast } from '../context/ToastProvider';
import { findAppointmentConflicts } from '../utils/availability';

const APPOINTMENT_DURATION_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

export default function AppointmentForm({
  patients,
  rooms,
  treatments,
  dentists,
  appointments,
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
  const [pendingConflicts, setPendingConflicts] = useState(null);
  const [form, setForm] = useState({
    patientId: patients[0] ? patients[0].id : '',
    roomId: rooms[0] ? rooms[0].id : '',
    treatmentId: treatments[0] ? treatments[0].id : '',
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
        treatmentId: initialData.treatmentId || prev.treatmentId || (treatments[0] ? treatments[0].id : ''),
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

  const isDentistBusy = (dentistId) => {
    if (!dentistId) return false;
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isEditing && credits < 1) {
      addToast("Insufficient credits to create a new appointment.", 'error');
      return;
    }
    if (!form.patientId || !form.date || !form.startTime) return;

    const duration = Number(form.duration);

    if (!Number.isInteger(duration) || duration <= 0) {
      addToast('Enter a valid appointment duration', 'error');
      return;
    }

    if (!isEditing && (form.date < today || (form.date === today && form.startTime <= currentTime))) {
      addToast('Please choose a future date and time.', 'warning');
      return;
    }

    // Working Hours Validation
    if (settings && settings.workingHours) {
      const { start, end } = settings.workingHours;
      if (start && end) {
        if (form.startTime < start || endTime > end) {
          addToast(`Appointment must be within working hours (${formatTime(start)} - ${formatTime(end)}).`, 'warning');
          return;
        }
      }
    }

    // Overlap check (warn + allow override). Same clinic, any dentist; cancelled/no-show ignored.
    // First attempt with conflicts shows a centered toast + flips the button to
    // "Book anyway"; a second submit proceeds (deliberate overbook).
    if (!pendingConflicts) {
      const editingId = initialData && initialData.id ? initialData.id : form.id;
      const conflicts = findAppointmentConflicts(
        { date: form.date, startTime: form.startTime, duration: form.duration },
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
        addToast(
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
        // Error handling is mostly done in parent (AddToast), but we catch here to ensure finall runs
        console.error("Save failed", err);
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
    <Modal title={isEditing ? 'Edit Appointment' : 'New Appointment'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Patient</label>
            <div className="patient-item selected" style={{ cursor: 'default', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="patient-avatar">{selectedPatient ? getInitials(selectedPatient.name) : 'P'}</div>
                <div className="patient-info">
                  <div className="patient-name">{selectedPatient ? selectedPatient.name : 'Select patient'}</div>
                  <div className="patient-contact">
                    {selectedPatient ? selectedPatient.phone || selectedPatient.email || 'No contact info' : 'No patient selected'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPatientPicker((prev) => !prev)}
              >
                Change
              </button>
            </div>
            {showPatientPicker && (
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
                      className={`patient-item ${String(form.patientId) === String(p.id) ? 'selected' : ''}`}
                      onClick={() => handlePatientSelect(p.id)}
                    >
                      <div className="patient-avatar">{getInitials(p.name)}</div>
                      <div className="patient-info">
                        <div className="patient-name">{p.name}</div>
                        <div className="patient-contact">{p.phone || p.email || 'No contact info'}</div>
                      </div>
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
                {treatments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
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
                    Supplies: {selectedTreatment.suppliesNeeded.join(', ')}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Dentist</label>
            <div className="dentist-selector">
              <button
                type="button"
                className={`dentist-pill ${form.dentistId ? '' : 'selected'}`}
                onClick={() => setForm({ ...form, dentistId: '' })}
              >
                <span className="dentist-pill-avatar" style={{ background: '#9CA3AF' }}>U</span>
                <span>Unassigned</span>
              </button>
              {dentists.map((d) => {
                const availability = dentistAvailability(d);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`dentist-pill ${String(form.dentistId) === String(d.id) ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, dentistId: d.id })}
                    title={availability === 'busy' ? 'Busy at selected time' : availability === 'off-duty' ? 'Off duty' : 'Available'}
                  >
                    <span className="dentist-pill-avatar" style={{ background: d.color || '#4A90A4' }}>
                      {getInitials(d.name)}
                    </span>
                    <span>{d.name}</span>
                    <span className={`dentist-pill-status ${availability}`}></span>
                  </button>
                );
              })}
            </div>
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
            <div className="room-pills">
              <button
                type="button"
                className={`room-pill ${form.roomId ? '' : 'selected'}`}
                style={{ color: '#6B7280', background: 'var(--bg-secondary)' }}
                onClick={() => setForm({ ...form, roomId: '' })}
              >
                <span className="room-pill-dot" style={{ background: '#9CA3AF' }}></span>
                Unassigned
              </button>
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`room-pill ${String(form.roomId) === String(r.id) ? 'selected' : ''}`}
                  style={{ color: r.color, background: getColorBg(r.color) }}
                  onClick={() => setForm({ ...form, roomId: r.id })}
                >
                  <span className="room-pill-dot" style={{ background: r.color }}></span>
                  {r.name}
                </button>
              ))}
            </div>
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
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <div className="modal-footer">
          {showCreditWarning && (
            <div style={{ color: 'var(--danger)', fontWeight: 'bold', marginRight: 'auto', fontSize: 'var(--font-size-sm)' }}>
              Insufficient Credits (0)
            </div>
          )}
          <div className="flex-1"></div>
          {isEditing && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={isSubmitting}
              onClick={() => onDelete && onDelete(form)}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={showCreditWarning || isSubmitting}>
            {isSubmitting
              ? (isEditing ? 'Saving...' : 'Creating...')
              : pendingConflicts
                ? 'Book anyway'
                : (isEditing ? 'Save Appointment' : 'Create Appointment')
            }
          </button>
        </div>
      </form>
    </Modal>
  );
}
