import { useEffect, useMemo, useState } from 'react';
import { addMinutes } from '../utils/time';
import { intervalsOverlap, toMinutes } from '../utils/availability';

const normalizeEmail = (value) => (value || '').trim().toLowerCase();

const getRequestDate = (request) =>
  request.appointmentDate ||
  request.preferredDates?.[0] ||
  '';

const getRequestTime = (request) =>
  request.appointmentStartTime ||
  request.preferredTimes?.[0] ||
  '';

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getLocalTimeString = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
};

const isRequestExpired = (
  request,
  now = new Date()
) => {
  const requestDate = getRequestDate(request);
  const requestTime = getRequestTime(request);

  if (!requestDate) return false;

  const today = getLocalDateString(now);

  if (requestDate < today) return true;
  if (requestDate > today) return false;
  if (!requestTime) return false;

  const normalizedRequestTime =
    String(requestTime).slice(0, 5);

  return normalizedRequestTime <=
    getLocalTimeString(now);
};

const getEffectiveStatus = (request) => {
  if (
    request.status === 'pending' &&
    isRequestExpired(request)
  ) {
    return 'expired';
  }

  return request.status;
};

export default function RequestsView({
  appointmentRequests,
  patients,
  treatments,
  settings,
  appointments = [],
  dentists = [],
  addPatient,
  addAppointment,
  updateAppointmentRequest,
  refreshRequests,
}) {
  const [filter, setFilter] = useState('pending');
  const [processing, setProcessing] = useState({});
  const [errors, setErrors] = useState({});
  const [conflictPrompt, setConflictPrompt] = useState({});

  const getTreatmentDuration = (treatmentId) => {
    const treatment = treatments.find(
      (item) => String(item.id) === String(treatmentId)
    );

    return treatment?.duration || null;
  };

  const getDefaultDuration = (request) =>
    request.appointmentDuration ||
    getTreatmentDuration(request.appointmentTreatmentId) ||
    settings?.slotDuration ||
    30;

  const findConflicts = (request) => {
    const date = getRequestDate(request);
    const startTime = getRequestTime(request);
    const start = toMinutes(startTime);

    if (!date || start == null) return [];

    const end = start + getDefaultDuration(request);

    return (appointments || []).filter((appointment) => {
      if (
        appointment.status !== 'confirmed' ||
        appointment.date !== date
      ) {
        return false;
      }

      const appointmentStart = toMinutes(appointment.startTime);
      const appointmentEnd = appointment.endTime
        ? toMinutes(appointment.endTime)
        : appointmentStart + (appointment.duration || 30);

      if (
        appointmentStart == null ||
        appointmentEnd == null
      ) {
        return false;
      }

      return intervalsOverlap(
        start,
        end,
        appointmentStart,
        appointmentEnd
      );
    });
  };

  useEffect(() => {
    if (!refreshRequests) return undefined;

    refreshRequests();

    const timer = setInterval(() => {
      refreshRequests();
    }, 15000);

    return () => clearInterval(timer);
  }, [refreshRequests]);

  useEffect(() => {
    if (!updateAppointmentRequest) return;

    const expiredRequests = appointmentRequests.filter(
      (request) =>
        request.status === 'pending' &&
        isRequestExpired(request)
    );

    if (expiredRequests.length === 0) return;

    const markRequestsAsExpired = async () => {
      try {
        await Promise.all(
          expiredRequests.map((request) =>
            updateAppointmentRequest(request.id, {
              status: 'expired',
              reviewedAt: new Date().toISOString(),
            })
          )
        );

        if (refreshRequests) {
          await refreshRequests();
        }
      } catch (error) {
        console.error(
          'Failed to update expired requests:',
          error
        );
      }
    };

    markRequestsAsExpired();
  }, [
    appointmentRequests,
    updateAppointmentRequest,
    refreshRequests,
  ]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') {
      return appointmentRequests;
    }

    return appointmentRequests.filter(
      (request) => getEffectiveStatus(request) === filter
    );
  }, [appointmentRequests, filter]);

  const counts = useMemo(() => {
    return appointmentRequests.reduce(
      (accumulator, request) => {
        const status = getEffectiveStatus(request);

        accumulator.all += 1;
        accumulator[status] =
          (accumulator[status] || 0) + 1;

        return accumulator;
      },
      {
        all: 0,
        pending: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
      }
    );
  }, [appointmentRequests]);

  const findPatientById = (patientId) => {
    if (!patientId) return null;

    return (
      patients.find(
        (patient) =>
          String(patient.id) ===
          String(patientId)
      ) || null
    );
  };

  const findPatientByEmail = (email) => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) return null;

    return (
      patients.find(
        (patient) =>
          normalizeEmail(patient.email) === normalizedEmail
      ) || null
    );
  };

  const setBusy = (id, value) => {
    setProcessing((previous) => ({
      ...previous,
      [id]: value,
    }));
  };

  const setError = (id, message) => {
    setErrors((previous) => ({
      ...previous,
      [id]: message,
    }));
  };

  const clearError = (id) => {
    setErrors((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const markRequestExpired = async (request) => {
    try {
      await updateAppointmentRequest(request.id, {
        status: 'expired',
        reviewedAt: new Date().toISOString(),
      });

      if (refreshRequests) {
        await refreshRequests();
      }
    } catch (error) {
      console.error(
        'Failed to mark appointment request as expired:',
        error
      );
    }
  };

  // Resolve which dentist to assign when approving a request.
  // - explicit request choice wins;
  // - otherwise ("Any") pick the first dentist with no confirmed overlap at that slot.
  const resolveDentistId = (request, date, startTime, duration) => {
    if (request.requestedDentistId) return request.requestedDentistId;
    const start = toMinutes(startTime);
    if (start == null) return null;
    const end = start + Number(duration || 0);
    const busyDentistIds = new Set(
      (appointments || [])
        .filter((a) => a && a.date === date && a.status === 'confirmed' && a.dentistId)
        .filter((a) => {
          const aStart = toMinutes(a.startTime);
          const aEnd = a.endTime ? toMinutes(a.endTime) : (aStart == null ? null : aStart + (a.duration || 30));
          return aStart != null && aEnd != null && intervalsOverlap(start, end, aStart, aEnd);
        })
        .map((a) => String(a.dentistId)),
    );
    const free = (dentists || []).find((d) => !busyDentistIds.has(String(d.id)));
    return free ? free.id : null;
  };

  const approveRequest = async (request, options = {}) => {
    const { addPatientRecord = false } = options;

    clearError(request.id);
    setBusy(request.id, true);

    try {
      if (
        request.status === 'expired' ||
        isRequestExpired(request)
      ) {
        await markRequestExpired(request);

        throw new Error(
          'This appointment request has expired. Ask the patient to select a new future date.'
        );
      }

      const date = getRequestDate(request);
      const startTime = getRequestTime(request);

      if (!date || !startTime) {
        throw new Error(
          'Missing appointment date or time.'
        );
      }

      let patientId = null;

      if (request.isNewPatient && addPatientRecord) {
        const createdPatient = await addPatient({
          name: request.patientName,
          phone: request.phone,
          email: request.email,
          idNumber: request.patientIdNumber || null,
          address: request.patientAddress || null,
        });

        patientId = createdPatient?.id || null;
      } else if (!request.isNewPatient) {
        const matchedPatient =
          findPatientById(request.patientId) ||
          findPatientByEmail(request.lookupEmail);

        if (!matchedPatient) {
          throw new Error(
            'No patient matched this request.'
          );
        }

        patientId = matchedPatient.id;
      }

      const duration = getDefaultDuration(request);
      const dentistId = resolveDentistId(request, date, startTime, duration);

      await addAppointment({
        patientId,
        date,
        startTime,
        duration,
        dentistId,
        treatmentId:
          request.appointmentTreatmentId || null,
        notes:
          request.appointmentNotes ||
          request.notes ||
          '',
        status: 'confirmed',
      });

      await updateAppointmentRequest(request.id, {
        status: 'accepted',
        reviewedAt: new Date().toISOString(),
      });

      if (refreshRequests) {
        await refreshRequests();
      }
    } catch (error) {
      setError(
        request.id,
        error.message ||
          'Failed to approve request.'
      );
    } finally {
      setBusy(request.id, false);
    }
  };

  const handleApproveClick = async (
    request,
    options = {}
  ) => {
    clearError(request.id);

    if (isRequestExpired(request)) {
      setError(
        request.id,
        'This appointment request has expired. Ask the patient to select a new future date.'
      );

      await markRequestExpired(request);
      return;
    }

    const conflicts = findConflicts(request);

    if (conflicts.length > 0) {
      setConflictPrompt((previous) => ({
        ...previous,
        [request.id]: {
          options,
          conflicts,
        },
      }));

      return;
    }

    approveRequest(request, options);
  };

  const confirmOverbook = (request) => {
    const pendingConflict = conflictPrompt[request.id];

    setConflictPrompt((previous) => {
      const next = { ...previous };
      delete next[request.id];
      return next;
    });

    approveRequest(
      request,
      pendingConflict?.options || {}
    );
  };

  const cancelOverbook = (request) => {
    setConflictPrompt((previous) => {
      const next = { ...previous };
      delete next[request.id];
      return next;
    });
  };

  const declineRequest = async (request) => {
    clearError(request.id);

    if (isRequestExpired(request)) {
      setError(
        request.id,
        'This appointment request has already expired.'
      );

      await markRequestExpired(request);
      return;
    }

    setBusy(request.id, true);

    try {
      await updateAppointmentRequest(request.id, {
        status: 'declined',
        reviewedAt: new Date().toISOString(),
      });

      if (refreshRequests) {
        await refreshRequests();
      }
    } catch (error) {
      setError(
        request.id,
        error.message ||
          'Failed to decline request.'
      );
    } finally {
      setBusy(request.id, false);
    }
  };

  return (
    <div className="requests-page">
      <div className="requests-header">
        <div>
          <h2 className="request-title">
            Appointment Requests
          </h2>

          <p>
            Review patient submissions and approve or
            decline.
          </p>
        </div>

        <div
          className="requests-filters"
          role="tablist"
          aria-label="Request status filters"
        >
          {[
            'pending',
            'accepted',
            'declined',
            'expired',
            'all',
          ].map((status) => (
            <button
              key={status}
              type="button"
              className={`status-pill ${
                filter === status ? 'selected' : ''
              }`}
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

            <p>
              New patient requests will appear here.
            </p>

            {refreshRequests && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={refreshRequests}
              >
                Refresh
              </button>
            )}
          </div>
        )}

        {filteredRequests.map((request) => {
          const date = getRequestDate(request);
          const startTime = getRequestTime(request);
          const duration = getDefaultDuration(request);
          const endTime = startTime
            ? addMinutes(startTime, duration)
            : '';

          const treatment = treatments.find(
            (item) =>
              String(item.id) ===
              String(request.appointmentTreatmentId)
          );

          const matchedPatient =
            !request.isNewPatient
              ? findPatientById(request.patientId) ||
                findPatientByEmail(request.lookupEmail)
              : null;

          const existingMeta = request.isNewPatient
            ? 'New patient'
            : matchedPatient
              ? `Existing patient • Matched: ${matchedPatient.name}`
              : request.lookupEmail
                ? `Existing patient • Email: ${request.lookupEmail}`
                : 'Existing patient';

          const busy = Boolean(
            processing[request.id]
          );

          const effectiveStatus =
            getEffectiveStatus(request);

          const expired =
            effectiveStatus === 'expired';

          return (
            <div
              key={request.id}
              className="card request-card"
            >
              <div className="card-header request-card-header">
                <div>
                  <div className="request-name">
                    {request.patientName ||
                      'Unknown patient'}
                  </div>

                  <div className="request-meta">
                    {existingMeta}
                  </div>
                </div>

                <span
                  className={`request-status ${effectiveStatus}`}
                >
                  {effectiveStatus}
                </span>
              </div>

              <div className="card-body request-card-body">
                <div className="request-columns">
                  <div>
                    <div className="request-section-title">
                      Patient details
                    </div>

                    <div className="request-detail-row">
                      <span>Email</span>

                      <span>
                        {request.isNewPatient
                          ? request.email || '-'
                          : request.lookupEmail || '-'}
                      </span>
                    </div>

                    <div className="request-detail-row">
                      <span>Phone</span>
                      <span>{request.phone || '-'}</span>
                    </div>

                    <div className="request-detail-row">
                      <span>Address</span>

                      <span>
                        {request.patientAddress || '-'}
                      </span>
                    </div>

                    {request.patientNotes && (
                      <div className="request-detail-notes">
                        <strong>
                          Patient notes:
                        </strong>{' '}
                        {request.patientNotes}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="request-section-title">
                      Appointment request
                    </div>

                    <div className="request-detail-row">
                      <span>Date</span>
                      <span>{date || '-'}</span>
                    </div>

                    <div className="request-detail-row">
                      <span>Time</span>

                      <span>
                        {startTime
                          ? `${startTime} - ${endTime}`
                          : '-'}
                      </span>
                    </div>

                    <div className="request-detail-row">
                      <span>Treatment</span>

                      <span>
                        {treatment
                          ? treatment.name
                          : 'None'}
                      </span>
                    </div>

                    <div className="request-detail-row">
                      <span>Duration</span>

                      <span>
                        {duration
                          ? `${duration} mins`
                          : '-'}
                      </span>
                    </div>

                    {request.appointmentNotes && (
                      <div className="request-detail-notes">
                        <strong>
                          Appointment notes:
                        </strong>{' '}
                        {request.appointmentNotes}
                      </div>
                    )}
                  </div>
                </div>

                {!request.isNewPatient && (
                  <div className="request-match">
                    <span>Matched patient</span>

                    <span>
                      {matchedPatient
                        ? matchedPatient.name
                        : 'No match found'}
                    </span>
                  </div>
                )}

                {errors[request.id] && (
                  <div className="form-error">
                    {errors[request.id]}
                  </div>
                )}
              </div>

              <div className="card-footer request-card-footer">
                {effectiveStatus === 'pending' ? (
                  <>
                    {conflictPrompt[request.id] && (
                      <div
                        className="form-error"
                        style={{
                          marginBottom: '0.5rem',
                          width: '100%',
                        }}
                      >
                        <div>
                          This time overlaps{' '}
                          {
                            conflictPrompt[request.id]
                              .conflicts.length
                          }{' '}
                          confirmed appointment(s):{' '}
                          {conflictPrompt[
                            request.id
                          ].conflicts
                            .map(
                              (conflict) =>
                                `${conflict.startTime}-${
                                  conflict.endTime ||
                                  addMinutes(
                                    conflict.startTime,
                                    conflict.duration ||
                                      30
                                  )
                                }`
                            )
                            .join(', ')}
                          . Book anyway?
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginTop: '0.5rem',
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() =>
                              confirmOverbook(request)
                            }
                          >
                            Book anyway
                          </button>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() =>
                              cancelOverbook(request)
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {request.isNewPatient ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() =>
                          handleApproveClick(request, {
                            addPatientRecord: true,
                          })
                        }
                      >
                        Approve + Add patient
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                          busy || !matchedPatient
                        }
                        onClick={() =>
                          handleApproveClick(request)
                        }
                      >
                        Approve appointment
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        declineRequest(request)
                      }
                    >
                      Decline
                    </button>
                  </>
                ) : expired ? (
                  <div className="request-footer-expired">
                    <strong>Request expired</strong>

                    <span>
                      The requested appointment time
                      has passed. Ask the patient to
                      select a new future date.
                    </span>
                  </div>
                ) : (
                  <div className="request-footer-note">
                    Reviewed{' '}
                    {request.reviewedAt
                      ? new Date(
                          request.reviewedAt
                        ).toLocaleString()
                      : ''}
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