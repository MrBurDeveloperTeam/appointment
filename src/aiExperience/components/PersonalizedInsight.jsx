// Small, presentation-only component. Deliberately contains NO
// deterministic business logic — it only renders whatever candidate
// useAppointmentPersonalizedInsight already resolved. All eligibility/
// status-filtering/time-window/tie-break decisions live in ../providers,
// ../utils, and ../resolver, never here. `.btn`/`.btn-secondary` reuse this
// app's existing global button classes (see styles.css, already used
// elsewhere e.g. App.jsx's Logout button) rather than inventing a new
// class system; the card itself uses inline styles since this repo has no
// existing "banner"/"alert" card class to align with (only `.toast`, which
// is a floating/dismissible notification, a different UI concept from a
// persistent landing-page insight).

import React from 'react';

const wrapperStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.875rem 1rem',
  marginBottom: '1rem',
  borderRadius: '0.75rem',
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#b91c1c',
};

const messageStyle = {
  flex: 1,
  fontSize: '0.9rem',
  fontWeight: 600,
  margin: 0,
};

export default function PersonalizedInsight({ candidate, onAction }) {
  if (!candidate) return null;

  return (
    <div style={wrapperStyle}>
      <span aria-hidden="true">⏰</span>
      <p style={messageStyle}>{candidate.message}</p>
      {candidate.action && (
        <button type="button" className="btn btn-secondary" onClick={onAction}>
          {candidate.action.label}
        </button>
      )}
    </div>
  );
}
