import React from 'react';

/**
 * Full-screen loading screen shown while the mini app signs the user in and
 * loads their clinic. It is intentionally IDENTICAL (markup, sizes, colours,
 * text) to the gallery's /opening.html and to the splash inside index.html, so
 * moving from Snabbb -> mini app looks like one continuous loading screen.
 * The shared styles live in index.html (#ls-css).
 */
export default function LaunchScreen({ title = 'Opening Appointment…', status = 'Signing you in…' }) {
  return (
    <div className="ls" role="status" aria-live="polite">
      <img
        className="ls-icon"
        src="/assets/appointment.webp"
        alt=""
        width="160"
        height="160"
      />
      <div className="ls-spinner" aria-hidden="true" />
      <h1 className="ls-title">{title}</h1>
      <p className="ls-status">{status}</p>
    </div>
  );
}
