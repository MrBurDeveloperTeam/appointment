import { useEffect, useRef } from 'react';
import DataStore from '../data';

// Ignore blips shorter than this (accidental clicks, fast tab-throughs) so the
// activity log doesn't get spammed with noise.
const MIN_LOGGED_SECONDS = 3;

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Tracks how long the user spends on each page (`view`) inside the app and
 * writes a "page_view" entry to the appointment activity log (apt_activity_log,
 * synced to Odoo the same way every other activity entry is) whenever they
 * navigate away, hide the tab, or close it.
 *
 * Time only accrues while the tab is actually visible — switching to another
 * browser tab or minimizing pauses the clock so idle background time isn't
 * counted as "time spent" on a page.
 *
 * @param {string} view - key of the page currently shown (e.g. 'calendar', 'patients')
 * @param {string} pageLabel - human-readable label for that page (e.g. 'Calendar')
 * @param {boolean} enabled - only log while the app has an active clinic/user ready
 * @param {() => void} [onLogged] - optional callback fired after a successful log (e.g. to refresh the activity list)
 */
export default function usePageDurationTracker(view, pageLabel, enabled, onLogged) {
  // Timestamp (ms) the current visible-viewing period started, or null while paused/hidden.
  const activeSinceRef = useRef(null);
  // Seconds already accumulated for the current view before the current visible period.
  const accumulatedRef = useRef(0);
  const labelRef = useRef(null);
  const enabledRef = useRef(enabled);
  const onLoggedRef = useRef(onLogged);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onLoggedRef.current = onLogged;
  }, [onLogged]);

  const logDuration = (label, seconds) => {
    if (!enabledRef.current || !label || seconds < MIN_LOGGED_SECONDS) return;
    DataStore.logActivity('page_view', `Viewed ${label} page for ${formatDuration(seconds)}`)
      .then(() => onLoggedRef.current?.())
      .catch((err) => console.error('Failed to log page view duration:', err?.message || err));
  };

  // Stop the clock for whatever page is currently tracked and return the total
  // seconds accumulated for it (does not reset accumulatedRef itself).
  const pause = () => {
    if (activeSinceRef.current != null) {
      accumulatedRef.current += (Date.now() - activeSinceRef.current) / 1000;
      activeSinceRef.current = null;
    }
  };

  const resume = () => {
    if (labelRef.current && document.visibilityState === 'visible') {
      activeSinceRef.current = Date.now();
    }
  };

  // Fires whenever the visible page changes: flush the time spent on the
  // previous page, then start the clock for the new one.
  useEffect(() => {
    pause();
    logDuration(labelRef.current, accumulatedRef.current);
    accumulatedRef.current = 0;
    labelRef.current = pageLabel || null;
    resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pageLabel]);

  // Pause/resume the clock when the tab is hidden/shown without switching pages.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pause();
      } else {
        resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Best-effort flush when the tab/app is closed or the tracker unmounts
  // (e.g. logout, navigating away from the clinic app entirely).
  useEffect(() => {
    const flushOnExit = () => {
      pause();
      logDuration(labelRef.current, accumulatedRef.current);
      accumulatedRef.current = 0;
    };
    window.addEventListener('pagehide', flushOnExit);
    window.addEventListener('beforeunload', flushOnExit);
    return () => {
      window.removeEventListener('pagehide', flushOnExit);
      window.removeEventListener('beforeunload', flushOnExit);
      flushOnExit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
