import { useEffect, useMemo, useState } from 'react';
import { getInitials } from '../utils/people';

export default function ReportsView({ appointments, patients, treatments, staff }) {
  const [activeTab, setActiveTab] = useState('dentist');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const monthOptions = useMemo(() => {
    const months = new Set();
    appointments.forEach((apt) => {
      if (apt.date) months.add(apt.date.slice(0, 7));
    });
    months.add(currentMonth);
    return Array.from(months).sort().reverse();
  }, [appointments, currentMonth]);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  useEffect(() => {
    if (!monthOptions.includes(selectedMonth)) {
      setSelectedMonth(currentMonth);
    }
  }, [monthOptions, selectedMonth, currentMonth]);

  const monthLabel = useMemo(() => {
    const date = new Date(`${selectedMonth}-01T00:00:00`);
    if (Number.isNaN(date.getTime())) return selectedMonth;
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const monthAppointments = useMemo(
    () => appointments.filter((apt) => apt.date && apt.date.startsWith(selectedMonth)),
    [appointments, selectedMonth]
  );

  const dentists = useMemo(() => staff.filter((s) => s.role === 'dentist'), [staff]);
  const nurses = useMemo(() => staff.filter((s) => s.role === 'nurse'), [staff]);

  const treatmentById = useMemo(() => {
    const map = {};
    treatments.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [treatments]);

  const dentistStats = useMemo(() => {
    const byDentist = {};
    monthAppointments.forEach((apt) => {
      if (!apt.dentistId) return;
      if (!byDentist[apt.dentistId]) {
        byDentist[apt.dentistId] = {
          appointments: 0,
          patients: new Set(),
          minutes: 0,
          treatments: {},
        };
      }
      const entry = byDentist[apt.dentistId];
      entry.appointments += 1;
      entry.patients.add(String(apt.patientId));
      entry.minutes += Number(apt.duration || 30);
      const tId = apt.treatmentId || apt.treatmentType;
      if (tId) {
        entry.treatments[tId] = (entry.treatments[tId] || 0) + 1;
      }
    });
    return byDentist;
  }, [monthAppointments]);

  const treatmentStats = useMemo(() => {
    const map = {};
    monthAppointments.forEach((apt) => {
      const key = apt.treatmentId || apt.treatmentType;
      if (!key) return;
      if (!map[key]) map[key] = 0;
      map[key] += 1;
    });
    return map;
  }, [monthAppointments]);

  const appointmentStatusCounts = useMemo(() => {
    const counts = {
      completed: 0,
      confirmed: 0,
      cancelled: 0,
      pending: 0,
      'no-show': 0,
      rescheduled: 0,
    };
    monthAppointments.forEach((apt) => {
      const key = apt.status || 'confirmed';
      if (!counts[key]) counts[key] = 0;
      counts[key] += 1;
    });
    return counts;
  }, [monthAppointments]);

  const monthlyOverview = useMemo(() => {
    const total = monthAppointments.length;
    const completed = monthAppointments.filter((apt) => apt.status === 'completed').length;
    const upcoming = monthAppointments.filter((apt) => {
      const aptDate = apt.date || '';
      return aptDate >= new Date().toISOString().slice(0, 10) && apt.status !== 'cancelled';
    }).length;
    const activePatients = new Set(monthAppointments.map((apt) => String(apt.patientId))).size;
    return { total, completed, upcoming, activePatients };
  }, [monthAppointments]);

  const treatmentSummary = useMemo(() => {
    const totalAppointments = monthAppointments.length;
    const typesUsed = Object.keys(treatmentStats).length;
    const breakdown = treatments.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      count: treatmentStats[t.id] || 0,
    }));
    return { totalAppointments, typesUsed, breakdown };
  }, [monthAppointments, treatmentStats, treatments]);

  const nurseSummaries = useMemo(() => {
    return nurses.map((n) => {
      const workingDays = n.workingDays || [];
      const dailyHours = (() => {
        const [sh, sm] = (n.startTime || '09:00').split(':').map(Number);
        const [eh, em] = (n.endTime || '18:00').split(':').map(Number);
        return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
      })();
      const totalHours = Math.round(dailyHours * workingDays.length * 4 * 10) / 10;
      return {
        ...n,
        workingDays,
        dailyHours,
        totalHours,
      };
    });
  }, [nurses]);

  const performanceMetrics = useMemo(() => {
    const total = monthAppointments.length || 1;
    const completed = appointmentStatusCounts.completed;
    const noShow = appointmentStatusCounts['no-show'];
    const cancelled = appointmentStatusCounts.cancelled;
    return {
      completionRate: Math.round((completed / total) * 1000) / 10,
      noShowRate: Math.round((noShow / total) * 1000) / 10,
      cancellationRate: Math.round((cancelled / total) * 1000) / 10,
      totalAppointments: monthAppointments.length,
    };
  }, [appointmentStatusCounts, monthAppointments]);

  const dayOfWeekStats = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    monthAppointments.forEach((apt) => {
      if (!apt.date) return;
      const date = new Date(apt.date);
      if (!Number.isNaN(date.getTime())) {
        counts[date.getDay()] += 1;
      }
    });
    return counts;
  }, [monthAppointments]);

  const statusOrder = ['completed', 'confirmed', 'pending', 'cancelled', 'no-show', 'rescheduled'];
  const statusLabel = {
    completed: 'Completed',
    confirmed: 'Confirmed',
    pending: 'Pending',
    cancelled: 'Cancelled',
    'no-show': 'No Shows',
    rescheduled: 'Rescheduled',
  };

  return (
    <div className="reports-layout">
      <aside className="reports-nav" role="tablist" aria-label="Reports sections">
        {[
          { id: 'dentist', label: 'Dentist Stats' },
          { id: 'nurse', label: 'Nurse Hours' },
          { id: 'treatments', label: 'Treatments' },
          { id: 'monthly', label: 'Monthly' },
          { id: 'appointments', label: 'Appointment Stats' },
        ].map((item) => (
          <button
            key={item.id}
            className={`reports-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
            role="tab"
            aria-selected={activeTab === item.id}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <div className="reports-content">
        <div className="reports-header">
          <div>
            <div className="reports-title">
              {activeTab === 'dentist' && 'Dentist Statistics'}
              {activeTab === 'nurse' && 'Nurse Working Hours'}
              {activeTab === 'treatments' && 'Treatment Statistics'}
              {activeTab === 'monthly' && 'Monthly Overview'}
              {activeTab === 'appointments' && 'Appointment Statistics'}
            </div>
          </div>
          <div className="reports-filter">
            <select className="form-select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTab === 'dentist' && (
          <div className="reports-section">
            {dentists.length === 0 && (
              <div className="empty-state">
                <h3>No dentists</h3>
                <p>Add dentists to see statistics.</p>
              </div>
            )}
            {dentists.map((dentist) => {
              const stats = dentistStats[dentist.id] || { appointments: 0, patients: new Set(), minutes: 0, treatments: {} };
              const hours = Math.round((stats.minutes / 60) * 10) / 10;
              const treatmentBreakdown = Object.entries(stats.treatments)
                .sort((a, b) => b[1] - a[1])
                .map(([id, count]) => ({
                  id,
                  name: treatmentById[id]?.name || 'Unknown',
                  color: treatmentById[id]?.color || '#4A90A4',
                  count,
                }));

              return (
                <div key={dentist.id} className="reports-card">
                  <div className="reports-card-header">
                    <div className="reports-avatar" style={{ background: dentist.color || '#4A90A4' }}>
                      {getInitials(dentist.name)}
                    </div>
                    <div>
                      <div className="reports-name">{dentist.name}</div>
                      <div className="reports-subtitle">{dentist.specialty || 'General'}</div>
                    </div>
                  </div>
                  <div className="reports-metrics">
                    <div className="reports-metric-card">
                      <div className="reports-metric-value">{stats.patients.size}</div>
                      <div className="reports-metric-label">Patients</div>
                    </div>
                    <div className="reports-metric-card">
                      <div className="reports-metric-value">{stats.appointments}</div>
                      <div className="reports-metric-label">Appointments</div>
                    </div>
                    <div className="reports-metric-card">
                      <div className="reports-metric-value">{hours}h</div>
                      <div className="reports-metric-label">Hours</div>
                    </div>
                  </div>
                  <div className="reports-breakdown">
                    {treatmentBreakdown.length === 0 && <div className="empty-state">No treatment data</div>}
                    {treatmentBreakdown.map((item) => (
                      <div key={item.id} className="reports-breakdown-row">
                        <span className="reports-dot" style={{ background: item.color }}></span>
                        <span>{item.name}</span>
                        <span className="reports-breakdown-count">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'nurse' && (
          <div className="reports-section">
            {nurseSummaries.length === 0 && (
              <div className="empty-state">
                <h3>No nurses</h3>
                <p>Add nurses to see hours.</p>
              </div>
            )}
            {nurseSummaries.map((n) => (
              <div key={n.id} className="reports-card">
                <div className="reports-card-header">
                  <div className="reports-avatar" style={{ background: n.color || '#4A90A4' }}>
                    {getInitials(n.name)}
                  </div>
                  <div>
                    <div className="reports-name">{n.name}</div>
                    <div className="reports-subtitle">{n.assignedTo ? `Assists ${dentists.find((d) => d.id === n.assignedTo)?.name || 'Dentist'}` : 'Available to all'}</div>
                  </div>
                </div>
                <div className="reports-metrics">
                  <div className="reports-metric-card">
                    <div className="reports-metric-value">{n.workingDays.length}</div>
                    <div className="reports-metric-label">Working Days</div>
                  </div>
                  <div className="reports-metric-card">
                    <div className="reports-metric-value">{n.dailyHours}h</div>
                    <div className="reports-metric-label">Daily Hours</div>
                  </div>
                  <div className="reports-metric-card">
                    <div className="reports-metric-value">{n.totalHours}h</div>
                    <div className="reports-metric-label">Total Hours</div>
                  </div>
                </div>
                <div className="reports-day-row">
                  <div className="staff-days">
                    {dayNames.map((d, idx) => (
                      <span key={d} className={`day-chip ${n.workingDays.indexOf(idx) !== -1 ? 'active' : ''}`}>
                        {d[0]}
                      </span>
                    ))}
                  </div>
                  <div className="reports-subtitle">{n.startTime || '09:00'} - {n.endTime || '18:00'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'treatments' && (
          <div className="reports-section">
            <div className="reports-summary-grid">
              <div className="reports-summary-card teal">
                <div className="reports-metric-value">{treatmentSummary.totalAppointments}</div>
                <div className="reports-metric-label">Total Appointments</div>
              </div>
              <div className="reports-summary-card green">
                <div className="reports-metric-value">{treatmentSummary.typesUsed}</div>
                <div className="reports-metric-label">Treatment Types Used</div>
              </div>
            </div>
            <div className="reports-card">
              <div className="reports-card-title">Treatment Breakdown</div>
              <div className="reports-breakdown">
                {treatmentSummary.breakdown.map((item) => (
                  <div key={item.id} className="reports-breakdown-row">
                    <span className="reports-dot" style={{ background: item.color }}></span>
                    <span>{item.name}</span>
                    <span className="reports-breakdown-count">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="reports-section">
            <div className="reports-summary-grid four">
              <div className="reports-summary-card teal">
                <div className="reports-metric-value">{monthlyOverview.total}</div>
                <div className="reports-metric-label">Total Appointments</div>
              </div>
              <div className="reports-summary-card green">
                <div className="reports-metric-value">{monthlyOverview.completed}</div>
                <div className="reports-metric-label">Completed</div>
              </div>
              <div className="reports-summary-card amber">
                <div className="reports-metric-value">{monthlyOverview.upcoming}</div>
                <div className="reports-metric-label">Upcoming</div>
              </div>
              <div className="reports-summary-card violet">
                <div className="reports-metric-value">{monthlyOverview.activePatients}</div>
                <div className="reports-metric-label">Active Patients</div>
              </div>
            </div>

            <div className="reports-card">
              <div className="reports-card-title">Appointment Status</div>
              <div className="reports-status-grid">
                {statusOrder.slice(0, 4).map((key) => (
                  <div key={key} className="reports-status-card">
                    <div className="reports-metric-value">{appointmentStatusCounts[key] || 0}</div>
                    <div className="reports-metric-label">{statusLabel[key]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="reports-card">
              <div className="reports-card-title">Quick Stats</div>
              <div className="reports-status-grid">
                <div className="reports-status-card">
                  <div className="reports-metric-value">{dentists.length}</div>
                  <div className="reports-metric-label">Dentists</div>
                </div>
                <div className="reports-status-card">
                  <div className="reports-metric-value">{nurses.length}</div>
                  <div className="reports-metric-label">Nurses</div>
                </div>
                <div className="reports-status-card">
                  <div className="reports-metric-value">
                    {patients.filter((p) => p.createdAt && p.createdAt.startsWith(selectedMonth)).length}
                  </div>
                  <div className="reports-metric-label">New Patients</div>
                </div>
                <div className="reports-status-card">
                  <div className="reports-metric-value">{patients.length}</div>
                  <div className="reports-metric-label">Total Patients</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="reports-section">
            <div className="reports-summary-grid wide">
              {statusOrder.map((key) => (
                <div key={key} className="reports-summary-card muted">
                  <div className="reports-metric-value">{appointmentStatusCounts[key] || 0}</div>
                  <div className="reports-metric-label">{statusLabel[key]}</div>
                  <div className="reports-metric-sub">{Math.round(((appointmentStatusCounts[key] || 0) / Math.max(1, monthAppointments.length)) * 1000) / 10}%</div>
                </div>
              ))}
            </div>

            <div className="reports-card">
              <div className="reports-card-title">Performance Metrics</div>
              <div className="reports-status-grid">
                <div className="reports-status-card">
                  <div className="reports-metric-value">{performanceMetrics.completionRate}%</div>
                  <div className="reports-metric-label">Completion Rate</div>
                  <div className="reports-metric-sub">Completed / Finished</div>
                </div>
                <div className="reports-status-card">
                  <div className="reports-metric-value">{performanceMetrics.noShowRate}%</div>
                  <div className="reports-metric-label">No-Show Rate</div>
                  <div className="reports-metric-sub">No-shows / Finished</div>
                </div>
                <div className="reports-status-card">
                  <div className="reports-metric-value">{performanceMetrics.cancellationRate}%</div>
                  <div className="reports-metric-label">Cancellation Rate</div>
                  <div className="reports-metric-sub">Cancelled / Finished</div>
                </div>
                <div className="reports-status-card">
                  <div className="reports-metric-value">{performanceMetrics.totalAppointments}</div>
                  <div className="reports-metric-label">Total Appointments</div>
                </div>
              </div>
            </div>

            <div className="reports-card">
              <div className="reports-card-title">Status Breakdown</div>
              <div className="reports-bars">
                {statusOrder.map((key) => (
                  <div key={key} className="reports-bar-row">
                    <div className="reports-bar-label">{statusLabel[key]}</div>
                    <div className="reports-bar-track">
                      <div
                        className={`reports-bar-fill ${key}`}
                        style={{ width: `${Math.min(100, ((appointmentStatusCounts[key] || 0) / Math.max(1, monthAppointments.length)) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="reports-bar-value">{appointmentStatusCounts[key] || 0}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="reports-card">
              <div className="reports-card-title">Appointments by Day of Week</div>
              <div className="reports-week-grid">
                {dayNames.map((day, idx) => (
                  <div key={day} className="reports-week-card">
                    <div className="reports-week-day">{day}</div>
                    <div className="reports-week-value">{dayOfWeekStats[idx]}</div>
                    <div className="reports-week-meta">appointments</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
