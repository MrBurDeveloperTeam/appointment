import { useEffect, useMemo, useState } from 'react';
import { formatTime } from '../utils/time';
import { getInitials } from '../utils/people';
import { dentalChartingUrl } from '../utils/dentalCharting';

const PAGE_SIZE = 8;

export default function PatientsView({
  patients,
  appointments,
  dentists,
  treatments,
  onNew,
  onEdit,
  searchPatients,
}) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);

  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      if (searchPatients) {
        setIsSearching(true);
        try {
          const results = await searchPatients(query);
          setSearchResults(results);
          setPage(1); // Reset to first page of results
        } catch (e) {
          console.error(e);
        } finally {
          setIsSearching(false);
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, searchPatients]);

  const displayPatients = useMemo(() => {
    if (query && searchResults) return searchResults;
    if (query && !searchResults) return []; // Waiting for search
    return patients; // Default list (50)
  }, [patients, query, searchResults]);

  const filtered = displayPatients; // Renaming for compatibility with below logic

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedPatients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const upcomingAndHistory = (patientId) => {
    const all = appointments
      .filter((a) => String(a.patientId) === String(patientId))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = [];
    const history = [];
    all.forEach((a) => {
      const d = new Date(a.date);
      d.setHours(0, 0, 0, 0);
      if (d >= today && (a.status === 'confirmed' || a.status === 'pending')) {
        if (upcoming.length < 3) upcoming.push(a);
      } else if (history.length < 10) {
        history.push(a);
      }
    });
    return { upcoming, history };
  };

  const treatmentName = (id) => {
    const t = treatments.find((tr) => tr.id === id || tr.id === String(id));
    return t ? t.name : '';
  };
  const dentistName = (id) => {
    const d = dentists.find((dn) => dn.id === id);
    return d ? d.name : '';
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input
          className="search-input"
          placeholder="Search patients..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div style={{ marginLeft: 'auto' }}>
          {isSearching && <span className="text-muted" style={{ marginRight: 10 }}>Searching...</span>}
          <button className="btn btn-primary" onClick={() => onNew()}>
            + New Patient
          </button>
        </div>
      </div>
      <div className="patient-list">
        {pagedPatients.map((p) => {
          const appointmentCount = appointments.filter((a) => String(a.patientId) === String(p.id)).length;
          const hasAllergies = p.allergies && p.allergies.trim() !== '';
          const hasMedical = p.medicalConditions && p.medicalConditions.trim() !== '';
          const expanded = expandedId === p.id;
          const { upcoming, history } = upcomingAndHistory(p.id);
          return (
            <div key={p.id} className={`patient-card ${expanded ? 'expanded' : ''}`}>
              <div
                className="patient-row"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  if (e.target.closest('.patient-edit-btn')) return;
                  setExpandedId(expanded ? null : p.id);
                }}
              >
                <div className="patient-avatar">{getInitials(p.name)}</div>
                <div className="patient-info">
                  <div className="patient-name">
                    {p.name}
                    {hasAllergies ? <span className="patient-alert-badge allergy" title="Has allergies">!</span> : null}
                    {hasMedical ? <span className="patient-alert-badge medical" title="Has medical conditions">!</span> : null}
                  </div>
                  <div className="patient-contact">{p.phone || p.email || 'No contact info'}</div>
                </div>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {appointmentCount} apt{appointmentCount !== 1 ? 's' : ''}
                </span>
                <button className="patient-edit-btn" onClick={() => onEdit(p)} aria-label="Edit patient">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
                <svg className="patient-expand-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              {expanded && (
                <div className="patient-details" style={{ display: 'block' }}>
                  <div className="patient-details-content">
                    <div className="patient-info-section">
                      {p.phone && (
                        <div className="patient-detail-item">
                          <span className="detail-label">Phone:</span> {p.phone}
                        </div>
                      )}
                      {p.email && (
                        <div className="patient-detail-item">
                          <span className="detail-label">Email:</span> {p.email}
                        </div>
                      )}
                      {p.idNumber && (
                        <div className="patient-detail-item">
                          <span className="detail-label">IC/ID:</span> {p.idNumber}
                        </div>
                      )}
                      {p.dob && (
                        <div className="patient-detail-item">
                          <span className="detail-label">DOB:</span> {new Date(p.dob).toLocaleDateString()}
                        </div>
                      )}
                      {p.address && (
                        <div className="patient-detail-item">
                          <span className="detail-label">Address:</span> {p.address}
                        </div>
                      )}
                      {p.source && (
                        <div className="patient-detail-item">
                          <span className="detail-label">Source:</span> {p.source}
                        </div>
                      )}
                      {p.allergies && (
                        <div className="patient-detail-item warning">
                          <span className="detail-label">Allergies:</span> {p.allergies}
                        </div>
                      )}
                      {p.medicalConditions && (
                        <div className="patient-detail-item warning">
                          <span className="detail-label">Medical:</span> {p.medicalConditions}
                        </div>
                      )}
                      {p.notes && (
                        <div className="patient-detail-item">
                          <span className="detail-label">Notes:</span> {p.notes}
                        </div>
                      )}
                      {!p.phone && !p.email && !p.idNumber && !p.dob && !p.address && !p.source && !p.allergies && !p.medicalConditions && !p.notes && (
                        <div className="patient-detail-item text-muted">
                          No additional information recorded. Click Edit to add details.
                        </div>
                      )}
                    </div>

                    {upcoming.length > 0 && (
                      <div className="patient-history-section">
                        <div className="history-title">Upcoming Appointments</div>
                        {upcoming.map((apt) => (
                          <div key={apt.id} className="patient-history-item">
                            <div className="patient-history-row">
                              <span className="patient-history-date">
                                {new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                                {formatTime(apt.startTime)}
                              </span>
                              <span className="patient-history-treatment">{treatmentName(apt.treatmentId || apt.treatmentType) || '-'}</span>
                              <span className="patient-history-dentist">{dentistName(apt.dentistId)}</span>
                              <span className={`patient-history-status ${apt.status}`}>{apt.status}</span>
                            </div>
                            {apt.notes ? <div className="patient-history-notes">{apt.notes}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}

                    {history.length > 0 && (
                      <div className="patient-history-section">
                        <div className="history-title">Visit History</div>
                        {history.map((apt) => (
                          <div key={apt.id} className="patient-history-item">
                            <div className="patient-history-row">
                              <span className="patient-history-date">
                                {new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span className="patient-history-treatment">{treatmentName(apt.treatmentId || apt.treatmentType) || '-'}</span>
                              <span className="patient-history-dentist">{dentistName(apt.dentistId)}</span>
                              <span className={`patient-history-status ${apt.status}`}>{apt.status}</span>
                            </div>
                            {apt.notes ? <div className="patient-history-notes">{apt.notes}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}

                    {upcoming.length === 0 && history.length === 0 && (
                      <div className="patient-history-section">
                        <div className="history-empty">No appointments yet</div>
                      </div>
                    )}

                    <div className="patient-dental-record-action">
                      <button
                        type="button"
                        className="patient-dental-record-button"
                        onClick={() => window.open(dentalChartingUrl({ patient_id: p.id, record: 'latest' }), '_blank', 'noopener,noreferrer')}
                      >
                        View Latest Dental Record <span aria-hidden="true">↗</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-state">
            <h3>No patients</h3>
            <p>Add a patient to get started.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNew()}>
              Add Patient
            </button>
          </div>
        )}
      </div>
      {filtered.length > PAGE_SIZE && (
        <div className="patient-pagination">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </button>
          <div className="patient-page-indicator">
            Page {page} of {totalPages}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
