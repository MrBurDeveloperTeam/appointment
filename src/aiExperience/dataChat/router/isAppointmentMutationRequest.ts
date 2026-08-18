// Deterministic default-deny mutation guard — the conservative pattern
// already browser-validated in the Inventory and To-Do repos, ported
// here with appointment-specific vocabulary.
//
// REQUIRED (not optional defense-in-depth): unlike To-Do's
// `window.__MOLAR_ACTIONS__` (confirmed unwired/dead there), THIS repo's
// `window.__MOLAR_ACTIONS__` is LIVE — App.jsx actually assigns real
// handlers (`addAppointment`/`updateAppointment`/`addStaff`/`addRoom`/
// `addTreatment`/`addHoliday`/`addPatient`) to it, and
// MolarAIFloat.jsx's existing fenced ```json parser will dispatch to
// them if the model ever emits a matching action block. Today that's
// prevented only by prompt instruction ("Never output JSON action
// blocks" — see geminiService.js), which is not a sufficient safety
// boundary on its own. This guard runs BEFORE any Gemini call for a
// Data Chat message, so a recognized mutation request never reaches
// Gemini (or the legacy prompt) at all — it cannot depend on model
// compliance.

const INFORMATIONAL_PATTERNS: RegExp[] = [
  /^how (do|does|can|would|could) i?\b/,
  /^what happens (if|when)\b/,
  /^what is the process (for|to)\b/,
  /^explain\b/,
  /^tell me (about|how)\b/,
];

/** Unambiguous enough to trigger alone, no context word required — these
 *  don't show up in ordinary read-request phrasing. */
const STRONG_MUTATION_VERBS = ['cancel', 'reschedule'];

/** `confirm`/`approve`/`reject`/`decline` are common CONVERSATIONAL verbs
 *  too ("can you confirm how many appointments I have today?" is a read
 *  request, not a status-change request) — unlike STRONG_MUTATION_VERBS,
 *  these only count as a mutation when they read as directly acting on
 *  an appointment/booking OBJECT (verb immediately followed by an
 *  optional determiner then "appointment(s)"/"booking(s)"), not merely
 *  co-occurring anywhere in the same sentence as that word. */
const AMBIGUOUS_STATUS_VERB_OBJECT_PATTERN =
  /\b(confirm|approve|reject|decline)\s+(this|that|my|the|an|a)?\s*(appointment|appointments|booking|bookings)\b/;

/** Generic verbs that only mean "mutate an appointment" when paired with
 *  an appointment-context word anywhere in the message — mirrors To-Do's
 *  'add'/'create'/'change'/'move'/'update' over-triggering guard. */
const CONTEXTUAL_MUTATION_VERBS = ['move', 'create', 'add', 'change', 'update', 'assign', 'book'];
const APPOINTMENT_CONTEXT_WORDS = ['appointment', 'appointments', 'booking', 'bookings', 'schedule', 'time', 'date', 'room'];

function isInformationalPhrasing(normalized: string): boolean {
  return INFORMATIONAL_PATTERNS.some((p) => p.test(normalized));
}

function containsMutationOperation(normalized: string): boolean {
  if (STRONG_MUTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(normalized))) return true;

  if (AMBIGUOUS_STATUS_VERB_OBJECT_PATTERN.test(normalized)) return true;

  const hasContextualVerb = CONTEXTUAL_MUTATION_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(normalized));
  if (!hasContextualVerb) return false;

  return APPOINTMENT_CONTEXT_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(normalized));
}

export function isAppointmentMutationRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!normalized) return false;
  if (isInformationalPhrasing(normalized)) return false;
  return containsMutationOperation(normalized);
}
