import { useEffect, useMemo, useState } from 'react';
import { addMinutes } from '../utils/time';

const normalizeEmail = (value) => (value || '').trim().toLowerCase();

const getRequestDate = (request) => request.appointmentDate || request.preferredDates?.[0] || '';
const getRequestTime = (request) => request.appointmentStartTime || request.preferredTimes?.[0] || '';

export default function RequestsView({
  appointmentRequests,
  patients,
  treatments,
  settings,
  addPatient,
  addAppointment,
  updateAppointmentRequest,
  refreshRequests,
}) {
  const [filter, setFilter] = useState('pending');
  const [processing, setProcessing] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!refreshRequests) return;
    refreshRequests();
    const timer = setInterval(() => {
      refreshRequests();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshRequests]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') return appointmentRequests;
    return appointmentRequests.filter((request) => request.status === filter);
  }, [appointmentRequests, filter]);

  const counts = useMemo(() => {
    return appointmentRequests.reduce(
      (acc, request) => {
        acc.all += 1;
        acc[request.status] = (acc[request.status] || 0) + 1;
        return acc;
      },
      { all: 0, pending: 0, accepted: 0, declined: 0 }
    );
  }, [appointmentRequests]);

  const findPatientByEmail = (email) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    return patients.find((patient) => normalizeEmail(patient.email) === normalized) || null;
  };

  const getTreatmentDuration = (treatmentId) => {
    const treatment = treatments.find((t) => String(t.id) === String(treatmentId));
    return treatment?.duration || null;
  };

  const getDefaultDuration = (request) =>
    request.appointmentDuration ||
    getTreatmentDuration(request.appointmentTreatmentId) ||
    settings?.slotDuration ||
    30;

  const setBusy = (id, value) => {
    setProcessing((prev) => ({ ...prev, [id]: value }));
  };

  const setError = (id, message) => {
    setErrors((prev) => ({ ...prev, [id]: message }));
  };

  const clearError = (id) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const approveRequest = async (request, options = {}) => {
    const { addPatientRecord = false } = options;
    clearError(request.id);
    setBusy(request.id, true);
    try {
      const date = getRequestDate(request);
      const startTime = getRequestTime(request);
      if (!date || !startTime) {
        throw new Error('Missing appointment date or time.');
      }

      let patientId = null;
      if (request.isNewPatient && addPatientRecord) {
        const created = await addPatient({
          name: request.patientName,
          phone: request.phone,
          email: request.email,
          idNumber: request.patientIdNumber || null,
          address: request.patientAddress || null,
        });
        patientId = created?.id || null;
      } else if (!request.isNewPatient && request.lookupEmail) {
        const found = findPatientByEmail(request.lookupEmail);
        if (!found) {
          throw new Error('No patient matched this email.');
        }
        patientId = found.id;
      }

      const duration = getDefaultDuration(request);
      await addAppointment({
        patientId,
        date,
        startTime,
        duration,
        treatmentId: request.appointmentTreatmentId || null,
        notes: request.appointmentNotes || request.notes || '',
        status: 'confirmed',
      });

      await updateAppointmentRequest(request.id, { status: 'accepted' });
    } catch (err) {
      setError(request.id, err.message || 'Failed to approve request.');
    } finally {
      setBusy(request.id, false);
    }
  };

  const declineRequest = async (request) => {
    clearError(request.id);
    setBusy(request.id, true);
    try {
      await updateAppointmentRequest(request.id, { status: 'declined' });
    } catch (err) {
      setError(request.id, err.message || 'Failed to decline request.');
    } finally {
      setBusy(request.id, false);
    }
  };

  return (
    <div className="requests-page">
      <div className="requests-header">
        <div>
          <h2 className="request-title">Appointment Requests</h2>
          <p>Review patient submissions and approve or decline.</p>
        </div>
        <div className="requests-filters" role="tablist" aria-label="Request status filters">
          {['pending', 'accepted', 'declined', 'all'].map((status) => (
            <button
              key={status}
              type="button"
              className={`status-pill ${filter === status ? 'selected' : ''}`}
              onClick={() => setFilter(status)}
              role="tab"
              aria-selected={filter === status}
            >
              {status} ({counts[status] || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="requests-grid">
        {filteredRequests.length === 0 && (
          <div className="empty-state">
            <h3>No requests found</h3>
            <p>New patient requests will appear here.</p>
            {refreshRequests && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={refreshRequests}>
                Refresh
              </button>
            )}
          </div>
        )}

        {filteredRequests.map((request) => {
          const date = getRequestDate(request);
          const startTime = getRequestTime(request);
          const duration = getDefaultDuration(request);
          const endTime = startTime ? addMinutes(startTime, duration) : '';
          const treatment = treatments.find((t) => String(t.id) === String(request.appointmentTreatmentId));
          const matchedPatient =
            !request.isNewPatient && request.lookupEmail ? findPatientByEmail(request.lookupEmail) : null;
          const existingMeta = request.isNewPatient
            ? 'New patient'
            : matchedPatient
              ? `Existing patient • Matched: ${matchedPatient.name}`
              : request.lookupEmail
                ? `Existing patient • Email: ${request.lookupEmail}`
                : 'Existing patient';
          const busy = Boolean(processing[request.id]);

          return (
            <div key={request.id} className="card request-card">
              <div className="card-header request-card-header">
                <div>
                  <div className="request-name">{request.patientName || 'Unknown patient'}</div>
                  <div className="request-meta">{existingMeta}</div>
                </div>
                <span className={`request-status ${request.status}`}>{request.status}</span>
              </div>
              <div className="card-body request-card-body">
                <div className="request-columns">
                  <div>
                    <div className="request-section-title">Patient details</div>
                    <div className="request-detail-row">
                      <span>Email</span>
                      <span>{request.isNewPatient ? request.email || '-' : request.lookupEmail || '-'}</span>
                    </div>
                    <div className="request-detail-row">
                      <span>Phone</span>
                      <span>{request.phone || '-'}</span>
                    </div>
                    <div className="request-detail-row">
                      <span>Address</span>
                      <span>{request.patientAddress || '-'}</span>
                    </div>
                    {request.patientNotes && (
                      <div className="request-detail-notes">
                        <strong>Patient notes:</strong> {request.patientNotes}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="request-section-title">Appointment request</div>
                    <div className="request-detail-row">
                      <span>Date</span>
                      <span>{date || '-'}</span>
                    </div>
                    <div className="request-detail-row">
                      <span>Time</span>
                      <span>{startTime ? `${startTime} - ${endTime}` : '-'}</span>
                    </div>
                    <div className="request-detail-row">
                      <span>Treatment</span>
                      <span>{treatment ? treatment.name : 'None'}</span>
                    </div>
                    <div className="request-detail-row">
                      <span>Duration</span>
                      <span>{duration ? `${duration} mins` : '-'}</span>
                    </div>
                    {request.appointmentNotes && (
                      <div className="request-detail-notes">
                        <strong>Appointment notes:</strong> {request.appointmentNotes}
                      </div>
                    )}
                  </div>
                </div>

                {!request.isNewPatient && (
                  <div className="request-match">
                    <span>Matched patient</span>
                    <span>{matchedPatient ? matchedPatient.name : 'No match found'}</span>
                  </div>
                )}

                {errors[request.id] && <div className="form-error">{errors[request.id]}</div>}
              </div>
              <div className="card-footer request-card-footer">
                {request.status === 'pending' ? (
                  <>
                    {request.isNewPatient ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => approveRequest(request, { addPatientRecord: true })}
                        >
                          Approve + Add patient
                        </button>
                        {/* <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => approveRequest(request, { addPatientRecord: false })}
                        >
                          Approve appointment only
                        </button> */}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || !matchedPatient}
                        onClick={() => approveRequest(request)}
                      >
                        Approve appointment
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => declineRequest(request)}
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <div className="request-footer-note">
                    Reviewed {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString() : ''}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
