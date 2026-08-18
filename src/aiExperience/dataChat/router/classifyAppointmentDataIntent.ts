// Deterministic LOCAL intent router — no Gemini classification. Explicit
// phrase/pattern tables, checked in a fixed priority order (never
// arbitrary object iteration), returning a discriminated result so
// every recognized-but-unsupported question gets an explicit deterministic
// answer instead of silently falling through to legacy General Chat
// (which embeds raw patient PII — see App.jsx's `aiContext`).
//
// Priority order (most restrictive first, so a sensitive/unsupported
// question is never accidentally matched to a supported intent by a
// looser phrase overlap):
//   1. unsupported_sensitive_scope — recognized PATIENT-specific
//      questions (name/contact/notes/medical/treatment/staff identity).
//      REQUIRED because legacy General Chat contains that exact data —
//      these must never reach it via Data Chat's own no_match fallthrough
//      reasoning (a user could reasonably expect Data Chat to answer,
//      so a plain no_match->legacy fallthrough would be surprising).
//   2. unsupported_parameter — custom Soon time windows other than the
//      fixed 2-hour rule, and arbitrary date ranges outside "today".
//   3. unsupported_scope — recognized but out-of-v1-scope factual
//      questions (broad "next appointment", full today schedule list).
//   4. matched — one of the four v1 intents.
//   5. no_match — falls through to existing predefined/legacy chat.

import type { AppointmentDataIntent } from '../contracts/groundedDataResult';

export type AppointmentDataRouteResult =
  | { kind: 'matched'; intent: AppointmentDataIntent }
  | { kind: 'unsupported_parameter'; reason: 'custom_time_window' | 'date_range' }
  | { kind: 'unsupported_scope'; reason: 'broad_next_appointment' | 'today_schedule_list' }
  | {
      kind: 'unsupported_sensitive_scope';
      reason: 'patient_identity' | 'patient_contact' | 'patient_clinical' | 'treatment_reason' | 'staff_identity';
    }
  | { kind: 'no_match' };

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '') // "today's" -> "todays" (dropped, not space-split)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsAny(msg: string, phrases: string[]): boolean {
  return phrases.some((p) => msg.includes(p));
}

// ── 1. Sensitive patient/staff/treatment scope ─────────────────────────
const PATIENT_IDENTITY_PATTERNS = [
  /\bnext\s+patient\b/,
  /\bpatients?\s+name\b/,
  /\bpatients?\s+details?\b/,
  /\bwho\s+is\s+(my\s+)?next\s+patient\b/,
];
const PATIENT_CONTACT_PATTERNS = [/\bpatients?\s+(phone|email|number|contact)\b/];
const PATIENT_CLINICAL_PATTERNS = [/\bpatient\s+notes?\b/, /\bmedical\s+conditions?\b/, /\ballerg(y|ies)\b/];
const TREATMENT_REASON_PATTERNS = [
  /\bwhat\s+treatment\b/,
  /\breason\s+for\s+(the\s+)?appointment\b/,
  /\btreatment\s+is\s+the\s+(next\s+)?appointment\b/,
];
const STAFF_IDENTITY_PATTERNS = [
  // `normalize()` drops apostrophes ("who's" -> "whos") before this runs.
  /\b(whos|who\s+is)\s+seeing\s+(the\s+)?dentist\b/,
  /\bwhich\s+dentist\b/,
  /\bwho\s+is\s+the\s+dentist\b/,
];

// ── 2. Unsupported parameters ───────────────────────────────────────────
const TIME_WINDOW_PATTERN = /\b(?:next|within|in)\s+(\d+)\s*(minute|min|hour|hr)s?\b/;

function detectCustomTimeWindow(msg: string): boolean {
  const match = TIME_WINDOW_PATTERN.exec(msg);
  if (!match) return false;
  const value = Number(match[1]);
  const unit = match[2];
  const minutes = unit.startsWith('h') ? value * 60 : value;
  return minutes !== 120;
}

const DATE_RANGE_PATTERNS = [
  /\bnext\s+\d+\s+days?\b/,
  /\bnext\s+week\b/,
  /\bthis\s+week\b/,
  /\bthis\s+month\b/,
  /\btomorrow\b/,
  /\byesterday\b/,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
];

// ── 3. Unsupported scope ────────────────────────────────────────────────
const BROAD_NEXT_APPOINTMENT_PATTERNS = [/\bnext\s+appointment\b/, /\bwhen\s+is\s+my\s+appointment\b/];
const TODAY_LIST_PHRASES = [
  'what appointments do i have',
  'show todays appointments',
  'show my appointments today',
  'list my appointments',
  'list appointments today',
  'todays appointments',
  'whats on the schedule',
  'schedule for today',
];

// ── 4. Matched intents ──────────────────────────────────────────────────
const TODAY_COUNT_PHRASES = [
  'how many appointments',
  'how busy is today',
  'how busy am i today',
  'todays appointment count',
  'appointment count today',
  'how many bookings',
];
const DAILY_SUMMARY_PHRASES = [
  'appointment summary',
  'todays summary',
  'summarize today',
  'summary for today',
  'how is todays schedule',
  'todays schedule looking',
  'daily summary',
  'give me todays',
];
const ROOM_USAGE_PHRASES = [
  'rooms in use',
  'room in use',
  'rooms are in use',
  'room is in use',
  'rooms occupied',
  'room occupied',
  'rooms are occupied',
  'room is occupied',
  'rooms are being used',
  'how many rooms',
  'which rooms',
  'occupied rooms',
  'rooms currently in use',
  'are any rooms occupied',
  'any rooms in use',
];
const SOON_PHRASES = [
  'appointment soon',
  'appointments soon',
  'anything soon',
  'coming up',
  'appointment coming up',
  'starting soon',
  'next 2 hours',
  'next two hours',
  '2 hours',
  '120 minutes',
];

export function classifyAppointmentDataIntent(message: string): AppointmentDataRouteResult {
  const msg = normalize(message);
  if (!msg) return { kind: 'no_match' };

  if (PATIENT_IDENTITY_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_sensitive_scope', reason: 'patient_identity' };
  }
  if (PATIENT_CONTACT_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_sensitive_scope', reason: 'patient_contact' };
  }
  if (PATIENT_CLINICAL_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_sensitive_scope', reason: 'patient_clinical' };
  }
  if (TREATMENT_REASON_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_sensitive_scope', reason: 'treatment_reason' };
  }
  if (STAFF_IDENTITY_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_sensitive_scope', reason: 'staff_identity' };
  }

  if (detectCustomTimeWindow(msg)) {
    return { kind: 'unsupported_parameter', reason: 'custom_time_window' };
  }
  if (DATE_RANGE_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_parameter', reason: 'date_range' };
  }

  if (BROAD_NEXT_APPOINTMENT_PATTERNS.some((p) => p.test(msg))) {
    return { kind: 'unsupported_scope', reason: 'broad_next_appointment' };
  }

  if (mentionsAny(msg, TODAY_COUNT_PHRASES)) return { kind: 'matched', intent: 'appointment_today_count' };
  if (mentionsAny(msg, DAILY_SUMMARY_PHRASES)) return { kind: 'matched', intent: 'appointment_daily_summary' };
  if (mentionsAny(msg, ROOM_USAGE_PHRASES)) return { kind: 'matched', intent: 'appointment_room_usage' };
  if (mentionsAny(msg, SOON_PHRASES)) return { kind: 'matched', intent: 'appointment_soon' };

  if (mentionsAny(msg, TODAY_LIST_PHRASES)) {
    return { kind: 'unsupported_scope', reason: 'today_schedule_list' };
  }

  return { kind: 'no_match' };
}
