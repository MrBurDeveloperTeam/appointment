import { useMemo } from 'react';
import WeekView from './WeekView';
import DayView from './DayView';
import { buildMonthGrid } from '../utils/calendar';
import { formatMonthTitle, formatDayLong, sameDate, todayISO, toISODate, addDays, addMonths } from '../utils/date';
import { formatTime, minutesToTime } from '../utils/time';

export default function CalendarView({
  currentDate,
  setCurrentDate,
  calendarView,
  setCalendarView,
  appointments,
  patients,
  rooms,
  treatments,
  staff,
  holidays,
  settings,
  onSlotSelect,
  onAppointmentSelect,
  onAppointmentReschedule,
}) {
  const monthCells = useMemo(() => buildMonthGrid(currentDate), [currentDate]);

  const appointmentsByDate = useMemo(() => {
    return appointments.reduce((acc, apt) => {
      acc[apt.date] = acc[apt.date] ? [...acc[apt.date], apt] : [apt];
      return acc;
    }, {});
  }, [appointments]);

  const changeByView = (delta) => {
    if (calendarView === 'day') {
      setCurrentDate((prev) => addDays(prev, delta));
    } else if (calendarView === 'week') {
      setCurrentDate((prev) => addDays(prev, delta * 7));
    } else {
      setCurrentDate((prev) => addMonths(prev, delta));
    }
  };

  const patientName = (id) => {
    const p = patients.find((pt) => pt.id === id);
    return p ? p.name : 'Unknown';
  };
  const roomName = (id) => {
    const r = rooms.find((rm) => rm.id === id);
    return r ? r.name : 'Room';
  };
  const statusClass = (status) => {
    if (status === 'no-show') return 'noshow';
    return status || 'confirmed';
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="calendar-nav-btn" onClick={() => changeByView(-1)} aria-label="Previous">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </button>
          <button className="calendar-nav-btn" onClick={() => changeByView(1)} aria-label="Next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
        <div className="calendar-title">
          <div>{formatMonthTitle(currentDate)}</div>
          {calendarView === 'day' && (
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 2 }}>
              {formatDayLong(currentDate)}
            </div>
          )}
        </div>
        <div className="calendar-views" role="tablist" aria-label="Calendar view">
          {['day', 'week', 'month'].map((v) => (
            <button
              key={v}
              className={`calendar-view-btn ${calendarView === v ? 'active' : ''}`}
              onClick={() => setCalendarView(v)}
              role="tab"
              aria-selected={calendarView === v}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {calendarView === 'month' && (
        <div className="calendar-month">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
          {monthCells.map(({ date, inMonth }, idx) => {
            const iso = toISODate(date);
            const items = appointmentsByDate[iso] || [];
            const isToday = sameDate(date, new Date());
            const isPastDay = iso < todayISO();
            const cls = ['calendar-day'];
            if (!inMonth) cls.push('other-month');
            if (isToday) cls.push('today');
            if (isPastDay) cls.push('past-day');
            return (
              <div
                key={`${iso}-${idx}`}
                className={cls.join(' ')}
                onClick={() => {
                  setCurrentDate(new Date(iso));
                  setCalendarView('day');
                }}
                onDoubleClick={() => {
                  if (isPastDay) return;
                  const defaultStart =
                    (settings && settings.workingHours && settings.workingHours.start) || '09:00';
                  const defaultEnd =
                    (settings && settings.workingHours && settings.workingHours.end) || '18:00';
                  if (iso === todayISO()) {
                    const now = new Date();
                    const nowMinutes = now.getHours() * 60 + now.getMinutes();
                    const startMinutes = parseInt(defaultStart, 10) * 60;
                    const endMinutes = parseInt(defaultEnd, 10) * 60;
                    const nextHour = Math.ceil(nowMinutes / 60) * 60;
                    const nextMinutes = Math.max(startMinutes, nextHour);
                    if (nextMinutes >= endMinutes) return;
                    const nextTime = minutesToTime(nextMinutes);
                    if (onSlotSelect) onSlotSelect(iso, nextTime);
                    return;
                  }
                  if (onSlotSelect) onSlotSelect(iso, defaultStart);
                }}
              >
                <div className="day-number">{date.getDate()}</div>
                <div className="day-appointments">
                  {items.slice(0, 3).map((apt) => (
                    <div
                      key={apt.id}
                      className={`day-appointment status-${statusClass(apt.status)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onAppointmentSelect) onAppointmentSelect(apt);
                      }}
                      title={`${patientName(apt.patientId)} - ${formatTime(apt.startTime)}${apt.roomId ? ` - ${roomName(apt.roomId)}` : ''}`}
                    >
                      <span className={`day-appointment-dot status-${statusClass(apt.status)}`} />
                      <span className="day-appointment-time">{formatTime(apt.startTime)}</span>
                      <span className="day-appointment-title">
                        {(() => {
                          const name = patientName(apt.patientId);
                          // Truncate name to ~10-12 chars for cleaner month view
                          return name.length > 12 ? name.substring(0, 12) + '...' : name;
                        })()}
                      </span>
                    </div>
                  ))}
                  {items.length > 3 && <div className="day-more">+{items.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {calendarView === 'week' && (
        <WeekView
          currentDate={currentDate}
          appointments={appointments}
          patients={patients}
          rooms={rooms}
          treatments={treatments}
          holidays={holidays}
          settings={settings}
          onSelectDate={(d) => {
            setCurrentDate(new Date(d));
            setCalendarView('day');
          }}
          onSlotSelect={onSlotSelect}
          onAppointmentSelect={onAppointmentSelect}
          onAppointmentReschedule={onAppointmentReschedule}
        />
      )}

      {calendarView === 'day' && (
        <DayView
          currentDate={currentDate}
          appointments={appointments}
          patients={patients}
          rooms={rooms}
          treatments={treatments}
          staff={staff}
          settings={settings}
          onSlotSelect={onSlotSelect}
          onAppointmentSelect={onAppointmentSelect}
          onAppointmentReschedule={onAppointmentReschedule}
        />
      )}
    </div>
  );
}
