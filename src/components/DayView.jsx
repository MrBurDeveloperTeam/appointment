import { useRef, useState } from 'react';
import { toISODate, todayISO, sameDate } from '../utils/date';
import { addMinutes, minutesToTime, formatTime } from '../utils/time';
import { getInitials } from '../utils/people';
import { getColorBg } from '../utils/colors';
import Modal from './Modal';

export default function DayView({
  currentDate,
  appointments,
  patients,
  rooms,
  treatments,
  staff,
  settings,
  onSlotSelect,
  onAppointmentSelect,
  onAppointmentReschedule,
}) {
  const settingsSafe = settings || {};
  const startHour = parseInt((settingsSafe.workingHours && settingsSafe.workingHours.start) || '09:00', 10);
  const endHour = parseInt((settingsSafe.workingHours && settingsSafe.workingHours.end) || '18:00', 10);
  const totalMinutes = (endHour - startHour) * 60;
  const columnHeight = totalMinutes; // 1px per minute for consistent positioning
  const dentists = (staff || []).filter((s) => s.role === 'dentist');
  const dayOfWeek = currentDate.getDay();
  const dateStr = toISODate(currentDate);
  const todaysAppointments = appointments.filter((apt) => apt.date === dateStr);
  const isToday = sameDate(currentDate, new Date());
  const now = new Date();
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : null;
  const dayStartMinutes = startHour * 60;
  const dayEndMinutes = endHour * 60;
  const isPastDate = dateStr < todayISO();
  const pastBlockHeight =
    isPastDate
      ? columnHeight
      : isToday && nowMinutes !== null
        ? Math.min(Math.max(0, nowMinutes - dayStartMinutes), columnHeight)
        : 0;
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [pendingReschedule, setPendingReschedule] = useState(null);
  const [hoverLine, setHoverLine] = useState(null);
  const unassignedAppointments = todaysAppointments.filter((apt) => !apt.dentistId);
  const hasUnassigned = unassignedAppointments.length > 0;

  const patientName = (id) => {
    const p = patients.find((pt) => pt.id === id);
    return p ? p.name : 'Unknown';
  };
  const treatmentColor = (id) => {
    const t = treatments.find((tr) => tr.id === id);
    return t ? t.color : '#4A90A4';
  };
  const treatmentName = (id) => {
    const t = treatments.find((tr) => tr.id === id);
    return t ? t.name : '';
  };
  const roomName = (id) => {
    const r = rooms.find((rm) => rm.id === id);
    return r ? r.name : 'Room';
  };
  const dentistName = (id) => {
    const d = dentists.find((dt) => dt.id === id);
    return d ? d.name : '';
  };
  const statusClass = (status) => {
    if (status === 'no-show') return 'noshow';
    if (!status) return 'scheduled';
    if (['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) return status;
    return 'scheduled';
  };
  const statusIcon = (status) => {
    const cls = statusClass(status);
    // Design: Minimal circular indicators with specific icons
    const icons = {
      scheduled: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <polyline points="8 4 8 8 10 9" />
        </svg>
      ),
      pending: (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-spin">
          <path d="M8 2a6 6 0 1 1-4.24 1.76" />
        </svg>
      ),
      confirmed: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2.5 8.5 6 12 13.5 3.5" />
        </svg>
      ),
      completed: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <circle cx="8" cy="8" r="6" />
        </svg>
      ),
      cancelled: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      ),
      noshow: (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <line x1="12" y1="8" x2="4" y2="8" />
        </svg>
      )
    };

    // Fallback
    const icon = icons[cls] || icons.scheduled;

    return (
      <span className={`status-bubble ${cls}`} title={status ? status.toUpperCase() : 'CONFIRMED'}>
        {icon}
      </span>
    );
  };

  if (!dentists.length) {
    return (
      <div className="empty-state" style={{ padding: 32 }}>
        <h3 className="empty-state-title">No dentists configured</h3>
        <p className="empty-state-text">Add dentists in Settings to use the Day view.</p>
      </div>
    );
  }

  const handleColumnClick = (e, dateStrLocal, offsetMinutes, dentistId) => {
    const absoluteMinutes = dayStartMinutes + offsetMinutes;
    if (isPastDate) return;
    if (isToday && nowMinutes !== null && absoluteMinutes <= nowMinutes) {
      return; // block past slots only during today's working window
    }
    if (onSlotSelect) {
      onSlotSelect(dateStrLocal, minutesToTime(Math.min(dayStartMinutes + columnHeight, absoluteMinutes)), dentistId);
    }
  };

  const snapMinutes = (minutes) => Math.round(minutes / 15) * 15;

  const handleDrop = (e, dateStrLocal, dentistId) => {
    e.preventDefault();
    const dragged = dragRef.current;
    if (!dragged || !onAppointmentReschedule) return;
    if (isPastDate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = gridRef.current ? gridRef.current.scrollTop : 0;
    const offsetRaw = e.clientY - rect.top + scrollTop;
    const snapped = Math.max(0, Math.min(columnHeight, snapMinutes(offsetRaw)));
    const absoluteMinutes = dayStartMinutes + snapped;
    if (isToday && nowMinutes !== null && absoluteMinutes <= nowMinutes) return;
    const newStart = minutesToTime(Math.min(dayStartMinutes + columnHeight, absoluteMinutes));
    const duration = dragged.duration || 30;
    const updates = {
      date: dateStrLocal,
      startTime: newStart,
      endTime: addMinutes(newStart, duration),
      dentistId: dentistId || null,
    };
    setPendingReschedule({
      appointment: dragged,
      updates,
      message: `Reschedule ${patientName(dragged.patientId)} to ${dateStrLocal} at ${formatTime(newStart)}?`,
    });
    setDragPreview(null);
  };

  const handleDragStart = (apt) => (e) => {
    dragRef.current = apt;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', apt.id);
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e) => {
    dragRef.current = null;
    if (e && e.currentTarget) {
      e.currentTarget.classList.remove('dragging');
    }
    setDragPreview(null);
  };

  const handleDragOver = (e, dentistId) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = gridRef.current ? gridRef.current.scrollTop : 0;
    const offsetRaw = e.clientY - rect.top + scrollTop;
    const snapped = Math.max(0, Math.min(columnHeight, snapMinutes(offsetRaw)));
    const absoluteMinutes = dayStartMinutes + snapped;
    if (isToday && nowMinutes !== null && absoluteMinutes <= nowMinutes) return;
    setDragPreview({ dentistId: dentistId || null, offset: snapped });
    e.dataTransfer.dropEffect = 'move';
  };

  const handleHoverMove = (e, dentistId) => {
    if (dragRef.current) return;
    if (isPastDate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = gridRef.current ? gridRef.current.scrollTop : 0;
    const offsetRaw = e.clientY - rect.top + scrollTop;
    const snapped = Math.max(0, Math.min(columnHeight, snapMinutes(offsetRaw)));
    const absoluteMinutes = dayStartMinutes + snapped;
    if (isToday && nowMinutes !== null && absoluteMinutes <= nowMinutes) {
      setHoverLine(null);
      return;
    }
    setHoverLine({ dentistId: dentistId || null, offset: snapped });
  };

  const handleHoverLeave = () => {
    if (!dragRef.current) {
      setHoverLine(null);
    }
  };

  return (
    <div className="calendar-day-view" style={{ display: 'flex', minHeight: columnHeight + 120 }}>
      <div className="day-time-column" style={{ flexShrink: 0 }}>
        <div style={{ height: 70, borderBottom: '1px solid var(--border-light)' }}></div>
        {Array(endHour - startHour)
          .fill(0)
          .map((_, i) => {
            const hour = startHour + i;
            return (
              <div key={hour} className="week-time-slot">
                {hour % 12 || 12} {hour >= 12 ? 'PM' : 'AM'}
              </div>
            );
          })}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="dentist-headers">
          {dentists.map((dentist) => {
            const isWorkingDay = dentist.workingDays ? dentist.workingDays.indexOf(dayOfWeek) !== -1 : true;
            const dentistStart = dentist.startTime || (settingsSafe.workingHours && settingsSafe.workingHours.start) || '09:00';
            const dentistEnd = dentist.endTime || (settingsSafe.workingHours && settingsSafe.workingHours.end) || '18:00';
            return (
              <div
                key={dentist.id}
                className={`dentist-header ${!isWorkingDay ? 'off-duty' : ''}`}
                style={{ borderBottom: `3px solid ${dentist.color || '#4A90A4'}` }}
              >
                <div className="dentist-avatar" style={{ background: dentist.color || '#4A90A4' }}>
                  {getInitials(dentist.name)}
                </div>
                <div className="dentist-header-info">
                  <div className="dentist-header-name">{dentist.name}</div>
                  <div className="dentist-header-hours">
                    {isWorkingDay ? `${formatTime(dentistStart)} - ${formatTime(dentistEnd)}` : 'Off Duty'}
                  </div>
                </div>
              </div>
            );
          })}
          {hasUnassigned && (
            <div
              className="dentist-header"
              style={{
                borderBottom: '3px solid var(--border-light)',
                background: 'var(--bg-card)',
              }}
            >
              <div className="dentist-avatar" style={{ background: '#9CA3AF' }}>
                U
              </div>
              <div className="dentist-header-info">
                <div className="dentist-header-name">Unassigned</div>
                <div className="dentist-header-hours">No dentist set</div>
              </div>
            </div>
          )}
        </div>

        <div ref={gridRef} style={{ flex: 1 }}>
          <div style={{ display: 'flex', position: 'relative', height: columnHeight }}>
            {dentists.map((dentist) => {
              const isWorkingDay = dentist.workingDays ? dentist.workingDays.indexOf(dayOfWeek) !== -1 : true;
              const dentistAppointments = todaysAppointments.filter((apt) => apt.dentistId === dentist.id);
              const previewActive = dragPreview && dragPreview.dentistId === dentist.id;
              const hoverActive = hoverLine && hoverLine.dentistId === dentist.id;

              return (
                <div
                  key={dentist.id}
                  className="day-column"
                  style={{ position: 'relative', height: columnHeight }}
                  onDragOver={(e) => {
                    handleDragOver(e, dentist.id);
                  }}
                  onDrop={(e) => handleDrop(e, dateStr, dentist.id)}
                  onMouseMove={(e) => handleHoverMove(e, dentist.id)}
                  onMouseLeave={handleHoverLeave}
                  onClick={(e) => {
                    if (e.target.closest('.day-appointment-card')) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const scrollTop = gridRef.current ? gridRef.current.scrollTop : 0;
                    const offsetRaw = e.clientY - rect.top + scrollTop;
                    const minutesFromStart = Math.max(0, Math.min(columnHeight, Math.round(offsetRaw)));
                    handleColumnClick(e, dateStr, minutesFromStart, dentist.id);
                  }}
                >
                  {pastBlockHeight > 0 && (
                    <div
                      className="past-block"
                      style={{ height: pastBlockHeight }}
                    ></div>
                  )}
                  {Array(endHour - startHour)
                    .fill(0)
                    .map((_, idx) => (
                      <div key={idx} className="week-hour-line"></div>
                    ))}
                  {!isWorkingDay && <div className="off-duty-overlay">Off Duty</div>}
                  {previewActive && (
                    <div className="drag-preview-line" style={{ top: previewActive ? dragPreview.offset : 0 }}>
                      <span className="drag-preview-label">
                        {formatTime(minutesToTime(dayStartMinutes + dragPreview.offset))}
                      </span>
                    </div>
                  )}
                  {hoverActive && (
                    <div className="hover-time-line" style={{ top: hoverLine.offset }}>
                      <span className="hover-time-label">
                        {formatTime(minutesToTime(dayStartMinutes + hoverLine.offset))}
                      </span>
                    </div>
                  )}

                  {dentistAppointments.map((apt) => {
                    const color = treatmentColor(apt.treatmentId || apt.treatmentType);
                    const startParts = apt.startTime.split(':').map(Number);
                    const endParts = apt.endTime
                      ? apt.endTime.split(':').map(Number)
                      : addMinutes(apt.startTime, apt.duration || 30).split(':').map(Number);
                    const top = (startParts[0] - startHour) * 60 + startParts[1];
                    const height = endParts[0] * 60 + endParts[1] - (startParts[0] * 60 + startParts[1]);

                    return (
                      <div
                        key={apt.id}
                        className="day-appointment-card"
                        draggable
                        style={{
                          top,
                          height: height,
                          left: 4,
                          right: 4,
                          background: getColorBg ? getColorBg(color) : '#E8F4F8',
                          color,
                          borderLeft: `5px solid ${color}`,
                          position: 'absolute',
                          zIndex: 10,
                        }}
                        onDragStart={handleDragStart(apt)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          if (onAppointmentSelect) onAppointmentSelect(apt);
                        }}
                      >
                        <div className="day-appointment-header">
                          <div className="week-appointment-time">{formatTime(apt.startTime)}</div>
                          {statusIcon(apt.status)}
                        </div>
                        <div className="week-appointment-title">{patientName(apt.patientId)}</div>
                        <div className="week-appointment-title">
                          {apt.dentistId ? `${dentistName(apt.dentistId)} - ` : ''}
                          {treatmentName(apt.treatmentId || apt.treatmentType) || 'No treatment'}
                          {apt.roomId ? ` - ${roomName(apt.roomId)}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {hasUnassigned && (
              <div
                className="day-column"
                style={{ position: 'relative', height: columnHeight, background: 'var(--bg-card)' }}
                onDragOver={(e) => {
                  handleDragOver(e, null);
                }}
                onDrop={(e) => handleDrop(e, dateStr, null)}
                onMouseMove={(e) => handleHoverMove(e, null)}
                onMouseLeave={handleHoverLeave}
                onClick={(e) => {
                  if (e.target.closest('.day-appointment-card')) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const scrollTop = gridRef.current ? gridRef.current.scrollTop : 0;
                  const offsetRaw = e.clientY - rect.top + scrollTop;
                  const minutesFromStart = Math.max(0, Math.min(columnHeight, Math.round(offsetRaw)));
                  handleColumnClick(e, dateStr, minutesFromStart, '');
                }}
              >
                {pastBlockHeight > 0 && (
                  <div
                    className="past-block"
                    style={{ height: pastBlockHeight }}
                  ></div>
                )}
                {Array(endHour - startHour)
                  .fill(0)
                  .map((_, idx) => (
                    <div key={idx} className="week-hour-line"></div>
                  ))}
                {dragPreview && dragPreview.dentistId === null && (
                  <div className="drag-preview-line" style={{ top: dragPreview.offset }}>
                    <span className="drag-preview-label">
                      {formatTime(minutesToTime(dayStartMinutes + dragPreview.offset))}
                    </span>
                  </div>
                )}
                {hoverLine && hoverLine.dentistId === null && (
                  <div className="hover-time-line" style={{ top: hoverLine.offset }}>
                    <span className="hover-time-label">
                      {formatTime(minutesToTime(dayStartMinutes + hoverLine.offset))}
                    </span>
                  </div>
                )}
                {unassignedAppointments.map((apt) => {
                  const color = treatmentColor(apt.treatmentId || apt.treatmentType);
                  const startParts = apt.startTime.split(':').map(Number);
                  const endParts = apt.endTime
                    ? apt.endTime.split(':').map(Number)
                    : addMinutes(apt.startTime, apt.duration || 30).split(':').map(Number);
                  const top = (startParts[0] - startHour) * 60 + startParts[1];
                  const height = endParts[0] * 60 + endParts[1] - (startParts[0] * 60 + startParts[1]);

                  return (
                    <div
                      key={apt.id}
                      className="day-appointment-card"
                      draggable
                      style={{
                        top,
                        height: height,
                        left: 4,
                        right: 4,
                        background: getColorBg ? getColorBg(color) : '#E8F4F8',
                        color,
                        borderLeft: `5px solid ${color}`,
                        position: 'absolute',
                        zIndex: 10,
                      }}
                      onDragStart={handleDragStart(apt)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        if (onAppointmentSelect) onAppointmentSelect(apt);
                      }}
                    >
                      <div className="day-appointment-header">
                        <div className="week-appointment-time">{formatTime(apt.startTime)}</div>
                        {statusIcon(apt.status)}
                      </div>
                      <div className="week-appointment-title">{patientName(apt.patientId)}</div>
                      {apt.roomId && <div className="week-appointment-title">{roomName(apt.roomId)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {pendingReschedule && (
        <Modal title="Confirm reschedule" onClose={() => setPendingReschedule(null)}>
          <div style={{ padding: '0 var(--space-lg) var(--space-lg)' }}>
            <p style={{ marginBottom: 'var(--space-md)' }}>{pendingReschedule.message}</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setPendingReschedule(null)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={() => {
                  onAppointmentReschedule(pendingReschedule.appointment, pendingReschedule.updates);
                  setPendingReschedule(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


