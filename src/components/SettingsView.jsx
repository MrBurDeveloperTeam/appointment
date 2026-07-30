
import { Fragment, useMemo, useState } from 'react';
import { getColorBg, getContrastText } from '../utils/colors';
import { getInitials } from '../utils/people';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from '../context/ToastProvider';

export default function SettingsView({
  settings,
  rooms,
  treatments,
  staff,
  holidays,
  saveSettings,
  addRoom,
  updateRoom,
  deleteRoom,
  addTreatment,
  updateTreatment,
  deleteTreatment,
  addStaff,
  updateStaff,
  deleteStaff,
  saveHolidays,
  addHoliday,
  updateHoliday,
  deleteHoliday,
  theme,
  setTheme,
}) {
  const { addToast } = useToast();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const colorOptions = ['#4A90A4', '#7CB798', '#E5C07B', '#9B8AC4', '#E07B7B', '#A8D8EA'];
  const specialtyOptions = ['General', 'Endodontics', 'Pediatric', 'Orthodontics', 'Periodontics', 'Prosthodontics'];
  const [activeSection, setActiveSection] = useState('staff');
  const [modalState, setModalState] = useState({ type: null, mode: 'new' });
  const [form, setForm] = useState(() => ({
    clinicName: (settings && settings.clinicName) || 'Dental Clinic',
    workingHoursStart: (settings && settings.workingHours && settings.workingHours.start) || '09:00',
    workingHoursEnd: (settings && settings.workingHours && settings.workingHours.end) || '18:00',
    slotDuration: (settings && settings.slotDuration) || 30,
    restDays: (settings && settings.restDays) || [],
  }));
  const [roomForm, setRoomForm] = useState({ id: '', name: '', color: '#4A90A4' });
  const [treatmentForm, setTreatmentForm] = useState({ id: '', name: '', duration: 30, color: '#7CB798', suppliesNeeded: '' });
  const [staffForm, setStaffForm] = useState({
    id: '',
    role: 'dentist',
    name: '',
    phone: '',
    color: '#4A90A4',
    specialty: '',
    workingDays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '18:00',
    assignedTo: '',
  });
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    type: 'public',
    isPublic: true,
  });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: '', payload: null });

  const dentists = useMemo(() => staff.filter((s) => s.role === 'dentist'), [staff]);
  const nurses = useMemo(() => staff.filter((s) => s.role === 'nurse'), [staff]);

  const toggleRestDay = (day) => {
    setForm((f) => {
      const has = f.restDays.indexOf(day) !== -1;
      return { ...f, restDays: has ? f.restDays.filter((d) => d !== day) : [...f.restDays, day] };
    });
  };

  const handleSaveSettings = () => {
    // A clinic that marks every weekday as a rest day has no bookable days,
    // which silently breaks the public booking page. Block that here.
    if (form.restDays.length >= 7) {
      addToast('You must keep at least one working day (not all 7 can be rest days).', 'error');
      return;
    }
    saveSettings({
      clinicName: form.clinicName,
      workingHours: { start: form.workingHoursStart, end: form.workingHoursEnd },
      slotDuration: Number(form.slotDuration) || 30,
      restDays: form.restDays,
    });
    addToast('Settings saved', 'success');
  };

  const openRoomModal = (room) => {
    if (room) {
      setRoomForm({ id: room.id, name: room.name, color: room.color });
      setModalState({ type: 'room', mode: 'edit' });
      return;
    }
    setRoomForm({ id: '', name: '', color: '#4A90A4' });
    setModalState({ type: 'room', mode: 'new' });
  };

  const openTreatmentModal = (treatment) => {
    if (treatment) {
      setTreatmentForm({
        id: treatment.id,
        name: treatment.name,
        duration: treatment.duration,
        color: treatment.color,
        suppliesNeeded: treatment.suppliesNeeded ? treatment.suppliesNeeded.join(', ') : '',
      });
      setModalState({ type: 'treatment', mode: 'edit' });
      return;
    }
    setTreatmentForm({ id: '', name: '', duration: 30, color: '#7CB798', suppliesNeeded: '' });
    setModalState({ type: 'treatment', mode: 'new' });
  };

  const openStaffModal = (role, staffMember) => {
    if (staffMember) {
      setStaffForm({
        id: staffMember.id,
        role: staffMember.role,
        name: staffMember.name,
        phone: staffMember.phone || '',
        color: staffMember.color || '#4A90A4',
        specialty: staffMember.specialty || '',
        workingDays: staffMember.workingDays || [],
        startTime: staffMember.startTime || '09:00',
        endTime: staffMember.endTime || '18:00',
        assignedTo: staffMember.assignedTo || '',
      });
      setModalState({ type: 'staff', mode: 'edit' });
      return;
    }
    setStaffForm({
      id: '',
      role: role || 'dentist',
      name: '',
      phone: '',
      color: '#4A90A4',
      specialty: '',
      workingDays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '18:00',
      assignedTo: '',
    });
    setModalState({ type: 'staff', mode: 'new' });
  };

  const openHolidayModal = (holiday) => {
    if (holiday) {
      setHolidayForm({
        id: holiday.id,
        name: holiday.name,
        startDate: holiday.startDate,
        endDate: holiday.endDate || '',
        type: holiday.type || 'public',
        isPublic: holiday.type === 'public',
      });
      setModalState({ type: 'holiday', mode: 'edit' });
      return;
    }
    setHolidayForm({ name: '', startDate: '', endDate: '', type: 'public', isPublic: true });
    setModalState({ type: 'holiday', mode: 'new' });
  };

  const closeModal = () => setModalState({ type: null, mode: 'new' });

  const handleRoomSubmit = () => {
    if (!roomForm.name.trim()) {
      addToast('Enter room name', 'error');
      return;
    }
    if (roomForm.id) {
      updateRoom(roomForm.id, { name: roomForm.name, color: roomForm.color });
    } else {
      addRoom({ name: roomForm.name, color: roomForm.color });
    }
    closeModal();
  };

  const handleTreatmentSubmit = () => {
    if (!treatmentForm.name.trim()) {
      addToast('Enter treatment name', 'error');
      return;
    }
    const payload = {
      name: treatmentForm.name,
      duration: Number(treatmentForm.duration) || 30,
      color: treatmentForm.color,
      suppliesNeeded: treatmentForm.suppliesNeeded
        ? treatmentForm.suppliesNeeded.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    };
    if (treatmentForm.id) {
      updateTreatment(treatmentForm.id, payload);
    } else {
      addTreatment(payload);
    }
    closeModal();
  };

  const handleStaffSubmit = () => {
    if (!staffForm.name.trim()) {
      addToast('Enter staff name', 'error');
      return;
    }
    const payload = {
      role: staffForm.role,
      name: staffForm.name,
      phone: staffForm.phone,
      color: staffForm.color,
      specialty: staffForm.specialty,
      workingDays: staffForm.workingDays,
      startTime: staffForm.startTime,
      endTime: staffForm.endTime,
      assignedTo: staffForm.role === 'nurse' ? staffForm.assignedTo : '',
    };
    if (staffForm.id) {
      updateStaff(staffForm.id, payload);
    } else {
      addStaff(payload);
    }
    closeModal();
  };

  const handleHolidaySubmit = () => {
    if (!holidayForm.name || !holidayForm.startDate) {
      addToast('Enter holiday name and start date', 'error');
      return;
    }
    if (holidayForm.id) {
      updateHoliday(holidayForm.id, holidayForm);
    } else {
      addHoliday(holidayForm);
    }
    closeModal();
  };

  const handleDelete = () => {
    if (modalState.type === 'room' && roomForm.id) {
      setConfirmDialog({ open: true, type: 'room', payload: { id: roomForm.id, name: roomForm.name } });
    }
    if (modalState.type === 'treatment' && treatmentForm.id) {
      setConfirmDialog({ open: true, type: 'treatment', payload: { id: treatmentForm.id, name: treatmentForm.name } });
    }
    if (modalState.type === 'staff' && staffForm.id) {
      setConfirmDialog({ open: true, type: 'staff', payload: { id: staffForm.id, name: staffForm.name } });
    }
    if (modalState.type === 'holiday' && holidayForm.id) {
      setConfirmDialog({ open: true, type: 'holiday', payload: { id: holidayForm.id, name: holidayForm.name } });
    }
  };

  const handleConfirmDelete = () => {
    if (confirmDialog.type === 'room' && confirmDialog.payload?.id) {
      deleteRoom(confirmDialog.payload.id);
    }
    if (confirmDialog.type === 'treatment' && confirmDialog.payload?.id) {
      deleteTreatment(confirmDialog.payload.id);
    }
    if (confirmDialog.type === 'staff' && confirmDialog.payload?.id) {
      deleteStaff(confirmDialog.payload.id);
    }
    if (confirmDialog.type === 'holiday' && confirmDialog.payload?.id) {
      deleteHoliday(confirmDialog.payload.id);
    }
    closeModal();
    setConfirmDialog({ open: false, type: '', payload: null });
  };

  const renderDayChips = (workingDays) => (
    <div className="staff-days">
      {dayNames.map((d, idx) => (
        <span
          key={d}
          className={`day-chip ${workingDays && workingDays.indexOf(idx) !== -1 ? 'active' : ''}`}
        >
          {d[0]}
        </span>
      ))}
    </div>
  );

  const scheduleSummary = `${form.workingHoursStart}-${form.workingHoursEnd}, ${form.slotDuration} mins`;
  const malaysiaHolidayYear = new Date().getFullYear();
  const buildMalaysiaHolidays = (year) => [
    { name: "New Year's Day", startDate: `${year}-01-01`, endDate: `${year}-01-01`, type: 'public', isPublic: true },
    { name: 'Federal Territory Day', startDate: `${year}-02-01`, endDate: `${year}-02-01`, type: 'public', isPublic: true },
    { name: 'Labour Day', startDate: `${year}-05-01`, endDate: `${year}-05-01`, type: 'public', isPublic: true },
    { name: 'Wesak Day', startDate: `${year}-05-15`, endDate: `${year}-05-15`, type: 'public', isPublic: true },
    { name: 'Agong Birthday', startDate: `${year}-06-02`, endDate: `${year}-06-02`, type: 'public', isPublic: true },
    { name: 'Awal Muharram', startDate: `${year}-07-06`, endDate: `${year}-07-06`, type: 'public', isPublic: true },
    { name: 'National Day', startDate: `${year}-08-31`, endDate: `${year}-08-31`, type: 'public', isPublic: true },
    { name: "Prophet's Birthday", startDate: `${year}-09-15`, endDate: `${year}-09-15`, type: 'public', isPublic: true },
    { name: 'Malaysia Day', startDate: `${year}-09-16`, endDate: `${year}-09-16`, type: 'public', isPublic: true },
    { name: 'Deepavali', startDate: `${year}-10-20`, endDate: `${year}-10-20`, type: 'public', isPublic: true },
    { name: 'Christmas Day', startDate: `${year}-12-25`, endDate: `${year}-12-25`, type: 'public', isPublic: true },
  ];
  const handleLoadMalaysiaHolidays = () => {
    const base = buildMalaysiaHolidays(malaysiaHolidayYear);
    const existing = (holidays || []).map((h) => ({
      name: h.name,
      startDate: h.startDate,
      endDate: h.endDate || h.startDate,
      type: h.type || 'public',
      isPublic: h.isPublic || false,
    }));
    const keyOf = (h) => `${h.name}-${h.startDate}`;
    const existingKeys = new Set(existing.map(keyOf));
    const merged = [...existing, ...base.filter((h) => !existingKeys.has(keyOf(h)))];
    saveHolidays(merged);
  };

  const isUnconfigured = !form.workingHoursStart || dentists.length === 0 || rooms.length === 0 || treatments.length === 0;

  return (
    <div className="settings-layout">
      <aside className="settings-nav" role="tablist" aria-label="Settings sections">
        {[
          { id: 'staff', label: 'Staff' },
          { id: 'rooms', label: 'Rooms' },
          { id: 'treatments', label: 'Treatments' },
          { id: 'holidays', label: 'Holidays' },
          { id: 'schedule', label: 'Schedule' },
        ].map((item) => (
          <button
            key={item.id}
            className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => setActiveSection(item.id)}
            role="tab"
            aria-selected={activeSection === item.id}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <div className="settings-content">
        {isUnconfigured && (
          <div style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "var(--danger)",
            padding: "16px 20px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            height: "fit-content",
            alignSelf: "start"
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "1rem", fontWeight: 600, lineHeight: 1 }}>Setup Required</h4>
              <div style={{ fontSize: "0.9rem", opacity: 0.9, lineHeight: 1.4 }}>
                You need to add at least <strong>1 dentist</strong>, <strong>1 room</strong>, and <strong>1 treatment</strong>, and configure your <strong>working hours</strong> to unlock the app.
              </div>
            </div>
          </div>
        )}

        {activeSection === 'staff' && (
          <Fragment>
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-title">Dentists</div>
                <button className="btn btn-secondary btn-sm" onClick={() => openStaffModal('dentist')}>
                  + Add Dentist
                </button>
              </div>
              <div className="settings-card-body">
                {dentists.length === 0 && <div className="empty-state">No dentists</div>}
                {dentists.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="staff-item clickable"
                    onClick={() => openStaffModal(null, s)}
                  >
                    <div className="staff-avatar" style={{ background: s.color || '#4A90A4' }}>
                      {getInitials(s.name)}
                    </div>
                    <div className="staff-info">
                      <div className="staff-name-row">
                        <span className="staff-name">{s.name}</span>
                        {s.specialty && <span className="staff-pill">{s.specialty}</span>}
                      </div>
                      <div className="staff-meta-row">
                        {s.phone && <span className="staff-meta">{s.phone}</span>}
                        <span className="staff-meta">{s.startTime || '09:00'}-{s.endTime || '18:00'}</span>
                      </div>
                      {renderDayChips(s.workingDays || [])}
                    </div>
                    <div className="staff-actions">
                      <span className="settings-cta">View</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-title">Nurses / Assistants</div>
                <button className="btn btn-secondary btn-sm" onClick={() => openStaffModal('nurse')}>
                  + Add Nurse
                </button>
              </div>
              <div className="settings-card-body">
                {nurses.length === 0 && <div className="empty-state">No nurses</div>}
                {nurses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="staff-item clickable"
                    onClick={() => openStaffModal(null, s)}
                  >
                    <div className="staff-avatar" style={{ background: s.color || '#4A90A4' }}>
                      {getInitials(s.name)}
                    </div>
                    <div className="staff-info">
                      <div className="staff-name-row">
                        <span className="staff-name">{s.name}</span>
                        {s.assignedTo && (
                          <span className="staff-pill">
                            Assists {dentists.find((d) => d.id === s.assignedTo)?.name || 'Dentist'}
                          </span>
                        )}
                      </div>
                      <div className="staff-meta-row">
                        {s.phone && <span className="staff-meta">{s.phone}</span>}
                        <span className="staff-meta">{s.startTime || '09:00'}-{s.endTime || '18:00'}</span>
                      </div>
                      {renderDayChips(s.workingDays || [])}
                    </div>
                    <div className="staff-actions">
                      <span className="settings-cta">View</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Fragment>
        )}

        {activeSection === 'rooms' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-title">Rooms</div>
              <div className="settings-card-actions">
                <span className="settings-card-subtitle">{rooms.length} total</span>
                <button className="btn btn-secondary btn-sm" onClick={() => openRoomModal()}>
                  + Add Room
                </button>
              </div>
            </div>
            <div className="settings-card-body">
              <div className="settings-list">
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="settings-list-item clickable"
                    onClick={() => openRoomModal(r)}
                  >
                    <div>
                      <div className="settings-list-title">{r.name}</div>
                      <div className="settings-list-meta">
                        <span style={{ background: r.color, color: getContrastText(r.color), padding: '2px 6px', borderRadius: 6 }}>{r.color}</span>
                      </div>
                    </div>
                    <span className="settings-cta">View</span>
                  </button>
                ))}
                {rooms.length === 0 && <div className="empty-state">No rooms</div>}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'treatments' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-title">Treatments</div>
              <div className="settings-card-actions">
                <span className="settings-card-subtitle">{treatments.length} total</span>
                <button className="btn btn-secondary btn-sm" onClick={() => openTreatmentModal()}>
                  + Add Treatment
                </button>
              </div>
            </div>
            <div className="settings-card-body">
              <div className="settings-list">
                {treatments.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="settings-list-item clickable"
                    onClick={() => openTreatmentModal(t)}
                  >
                    <div>
                      <div className="settings-list-title">{t.name}</div>
                      <div className="settings-list-meta">
                        {t.duration} mins{' '}
                        <span style={{ background: t.color, color: getContrastText(t.color), padding: '2px 6px', borderRadius: 6 }}>{t.color}</span>
                      </div>
                    </div>
                    <span className="settings-cta">View</span>
                  </button>
                ))}
                {treatments.length === 0 && <div className="empty-state">No treatments</div>}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'holidays' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-title">Holidays</div>
              <div className="settings-card-actions">
                <span className="settings-card-subtitle">{holidays.length} configured</span>
                <button className="btn btn-secondary btn-sm" onClick={() => openHolidayModal()}>
                  + Add Holiday
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleLoadMalaysiaHolidays}>
                  Load Malaysia Holidays
                </button>
              </div>
            </div>
            <div className="settings-card-body">
              <div className="settings-list">
                {holidays.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="settings-list-item clickable"
                    onClick={() => openHolidayModal(h)}
                  >
                    <div>
                      <div className="settings-list-title">{h.name}</div>
                      <div className="settings-list-meta">
                        {h.startDate} {h.endDate && h.endDate !== h.startDate ? ` ${h.endDate}` : ''}  {h.type}
                      </div>
                    </div>
                    <span className="settings-cta">View</span>
                  </button>
                ))}
                {holidays.length === 0 && <div className="empty-state">No holidays</div>}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'schedule' && (
          <div className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-title">Schedule</div>
              <div className="settings-card-subtitle">{scheduleSummary}</div>
            </div>
            <div className="settings-card-body">
              <div className="form-group">
                <label className="form-label">Clinic Name</label>
                <input className="form-input" value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Working Start</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.workingHoursStart}
                    onChange={(e) => setForm({ ...form, workingHoursStart: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Working End</label>
                  <input
                    className="form-input"
                    type="time"
                    value={form.workingHoursEnd}
                    onChange={(e) => setForm({ ...form, workingHoursEnd: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Slot Duration (mins)</label>
                <input
                  className="form-input"
                  type="number"
                  value={form.slotDuration}
                  onChange={(e) => setForm({ ...form, slotDuration: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Rest Days</label>
                <div className="day-selector">
                  {dayNames.map((d, idx) => (
                    <label key={d} className="day-checkbox">
                      <input type="checkbox" checked={form.restDays.indexOf(idx) !== -1} onChange={() => toggleRestDay(idx)} />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* <div className="settings-theme">
                <div>
                  <div className="settings-theme-title">Theme</div>
                  <div className="settings-theme-subtitle">Light / Dark mode</div>
                </div>
                <label className="theme-toggle">
                  <input
                    type="checkbox"
                    checked={theme === 'dark'}
                    onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
                  />
                  <span className="theme-slider"></span>
                  <span className="theme-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                </label>
              </div> */}
              <button className="btn btn-primary" onClick={handleSaveSettings}>
                Save Settings
              </button>
            </div>
          </div>
        )}

      </div>

      {modalState.type === 'staff' && (
        <Modal title={modalState.mode === 'edit' ? 'Edit Staff' : 'Add Staff'} onClose={closeModal}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}>
                  <option value="dentist">Dentist</option>
                  <option value="nurse">Nurse</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-swatch-list">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${staffForm.color === color ? 'selected' : ''}`}
                      style={{ background: color }}
                      onClick={() => setStaffForm({ ...staffForm, color })}
                      aria-label={`Select ${color}`}
                    ></button>
                  ))}
                </div>
              </div>
            </div>
            {staffForm.role === 'dentist' && (
              <div className="form-group">
                <label className="form-label">Specialty</label>
                <select className="form-select" value={staffForm.specialty} onChange={(e) => setStaffForm({ ...staffForm, specialty: e.target.value })}>
                  <option value="">Select specialty</option>
                  {specialtyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {staffForm.role === 'nurse' && (
              <div className="form-group">
                <label className="form-label">Assists</label>
                <select className="form-select" value={staffForm.assignedTo} onChange={(e) => setStaffForm({ ...staffForm, assignedTo: e.target.value })}>
                  <option value="">None</option>
                  {dentists.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Start</label>
                <input className="form-input" type="time" value={staffForm.startTime} onChange={(e) => setStaffForm({ ...staffForm, startTime: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">End</label>
                <input className="form-input" type="time" value={staffForm.endTime} onChange={(e) => setStaffForm({ ...staffForm, endTime: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Working Days</label>
              <div className="day-selector">
                {dayNames.map((d, idx) => (
                  <label key={d} className="day-checkbox">
                    <input
                      type="checkbox"
                      checked={staffForm.workingDays.indexOf(idx) !== -1}
                      onChange={() => {
                        const has = staffForm.workingDays.indexOf(idx) !== -1;
                        setStaffForm((f) => ({
                          ...f,
                          workingDays: has ? f.workingDays.filter((x) => x !== idx) : [...f.workingDays, idx],
                        }));
                      }}
                    />
                    <span>{d}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            {modalState.mode === 'edit' && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleStaffSubmit}>
              {modalState.mode === 'edit' ? 'Save Staff' : 'Add Staff'}
            </button>
          </div>
        </Modal>
      )}

      {modalState.type === 'room' && (
        <Modal title={modalState.mode === 'edit' ? 'Edit Room' : 'Add Room'} onClose={closeModal}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-swatch-list">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${roomForm.color === color ? 'selected' : ''}`}
                      style={{ background: color }}
                      onClick={() => setRoomForm({ ...roomForm, color })}
                      aria-label={`Select ${color}`}
                    ></button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            {modalState.mode === 'edit' && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleRoomSubmit}>
              {modalState.mode === 'edit' ? 'Save Room' : 'Add Room'}
            </button>
          </div>
        </Modal>
      )}

      {modalState.type === 'treatment' && (
        <Modal title={modalState.mode === 'edit' ? 'Edit Treatment' : 'Add Treatment'} onClose={closeModal}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={treatmentForm.name} onChange={(e) => setTreatmentForm({ ...treatmentForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Duration (mins)</label>
                <input className="form-input" type="number" value={treatmentForm.duration} onChange={(e) => setTreatmentForm({ ...treatmentForm, duration: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-swatch-list">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${treatmentForm.color === color ? 'selected' : ''}`}
                      style={{ background: color }}
                      onClick={() => setTreatmentForm({ ...treatmentForm, color })}
                      aria-label={`Select ${color}`}
                    ></button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Supplies (comma separated)</label>
                <input className="form-input" value={treatmentForm.suppliesNeeded} onChange={(e) => setTreatmentForm({ ...treatmentForm, suppliesNeeded: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            {modalState.mode === 'edit' && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleTreatmentSubmit}>
              {modalState.mode === 'edit' ? 'Save Treatment' : 'Add Treatment'}
            </button>
          </div>
        </Modal>
      )}

      {modalState.type === 'holiday' && (
        <Modal title={modalState.mode === 'edit' ? 'Edit Holiday' : 'Add Holiday'} onClose={closeModal}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Holiday Name</label>
              <input className="form-input" value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input className="form-input" type="date" value={holidayForm.startDate} onChange={(e) => setHolidayForm({ ...holidayForm, startDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <input className="form-input" type="date" value={holidayForm.endDate} onChange={(e) => setHolidayForm({ ...holidayForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={holidayForm.type} onChange={(e) => setHolidayForm({ ...holidayForm, type: e.target.value, isPublic: e.target.value === 'public' })}>
                  <option value="public">Public</option>
                  <option value="clinic">Clinic</option>
                </select>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            {modalState.mode === 'edit' && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleHolidaySubmit}>
              {modalState.mode === 'edit' ? 'Save Holiday' : 'Add Holiday'}
            </button>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={`Delete ${confirmDialog.type}`}
        description={`This will permanently remove the ${confirmDialog.type}. This action cannot be undone.`}
        confirmLabel={`Delete ${confirmDialog.type}`}
        confirmVariant="danger"
        onClose={() => setConfirmDialog({ open: false, type: '', payload: null })}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
