// Small, presentation-only component. Deliberately contains NO
// deterministic business logic — it only renders whatever candidate
// useAppointmentPersonalizedInsight already resolved. All eligibility/
// status-filtering/time-window/tie-break/precedence decisions live in
// ../providers, ../utils, and ../resolver, never here. `.btn`/
// `.btn-secondary` reuse this app's existing global button classes (see
// styles.css, already used elsewhere e.g. App.jsx's Logout button) rather
// than inventing a new class system; the card itself uses inline styles
// since this repo has no existing "banner"/"alert" card class to align
// with (only `.toast`, which is a floating/dismissible notification, a
// different UI concept from a persistent landing-page insight).
//
// One style per `candidate.priority` (HIGH/MEDIUM/INFO) — still exactly
// ONE card ever rendered (whichever single candidate the resolver picked),
// never multiple competing cards for Daily Summary vs. No Appointments
// Today vs. Appointment Soon.

import React from 'react';

const baseWrapperStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.875rem 1rem',
  marginBottom: '1rem',
  borderRadius: '0.75rem',
};

const PRIORITY_STYLES = {
  HIGH: { border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', icon: '⏰' },
  MEDIUM: { border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', icon: '📋' },
  INFO: { border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', icon: 'ℹ️' },
};

const messageStyle = {
  flex: 1,
  fontSize: '0.9rem',
  fontWeight: 600,
  margin: 0,
};

export default function PersonalizedInsight({ candidate, onAction }) {
  if (!candidate) return null;

  const priorityStyle = PRIORITY_STYLES[candidate.priority] || PRIORITY_STYLES.INFO;
  const wrapperStyle = {
    ...baseWrapperStyle,
    border: priorityStyle.border,
    background: priorityStyle.background,
    color: priorityStyle.color,
  };

  return (
    <div style={wrapperStyle}>
      <span aria-hidden="true">{priorityStyle.icon}</span>
      <p style={messageStyle}>{candidate.message}</p>
      {candidate.action && (
        <button type="button" className="btn btn-secondary" onClick={onAction}>
          {candidate.action.label}
        </button>
      )}
    </div>
  );
}
