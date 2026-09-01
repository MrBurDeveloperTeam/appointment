// Client-side transport layer only. This file must NEVER import
// @google/genai, construct a GoogleGenAI client, read
// VITE_GEMINI_API_KEY, or call generateContent directly — all of that now
// lives exclusively in the server-only Supabase Edge Function at
// supabase/functions/molar-chat/index.ts, which this file calls via
// supabase.functions.invoke(). That invocation automatically carries the
// browser's current authenticated Supabase session as the Authorization
// bearer token — no token is ever placed into the request body/prompt
// here. Public function signatures are preserved so
// src/aiExperience/appointmentsMolarAdapter.ts requires no change beyond
// the mutation-dispatch removal made alongside this migration.
import { supabase } from '../lib/supabaseClient';

async function invokeMolarChat(payload) {
  const { data, error } = await supabase.functions.invoke('molar-chat', {
    body: payload,
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || 'AI service request failed');
  }

  return data.text;
}

/**
 * Chat with Molar AI, optionally injecting user/appointment context.
 * @param {Array} history - [{role, parts:[{text}]}]
 * @param {string} message
 * @param {string} [userContext]
 */
export async function chatWithMolarAI(history, message, userContext) {
  try {
    return await invokeMolarChat({ mode: 'general', history, message, userContext: userContext || '' });
  } catch (error) {
    console.error('Gemini Chat Error:', error);
    return "I'm having trouble connecting to the Snabbb Assistant Intelligent servers right now. Please try again shortly.";
  }
}

// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CHAT — grounded response phrasing ONLY.
//
// Architecturally SEPARATE from `chatWithMolarAI` above: called only
// AFTER a deterministic local intent router + deterministic appointment-
// state provider (see src/aiExperience/dataChat/) have already produced
// minimized, model-safe facts. The Edge Function this calls NEVER decides
// appointment eligibility, 2-hour-window membership, room occupancy, or
// counts, and never receives the full `aiContext` string `chatWithMolarAI`
// does (which embeds patient names/phones/emails and a resolved-patient-
// name schedule — see App.jsx's `aiContext`) — only the user's question,
// the approved intent name, and the already-computed, patient-free facts.
//
// CRITICAL: unlike `chatWithMolarAI`, this function THROWS on failure
// (invalid request, network error, empty response) rather than swallowing
// it into a friendly fallback string — the caller needs to distinguish
// success from failure so it can render a deterministic facts-only
// fallback instead (see
// src/aiExperience/dataChat/utils/formatGroundedAppointmentFallback.js)
// rather than ever falling through to the full legacy General Chat
// pipeline.
//
// The returned text is plain assistant text ONLY. It is never scanned for
// fenced ```json action blocks, and the system instruction explicitly
// forbids emitting any — this function has no path to any appointment
// mutation.
export async function chatWithGroundedAppointmentFacts(question, intent, facts) {
  return invokeMolarChat({ mode: 'grounded', question, intent, facts });
}
