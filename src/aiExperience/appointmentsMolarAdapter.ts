// PHASE 8D (Molar AI migration): thin host `AIAdapter` implementation for
// `@mrburdeveloperteam/molar-experience/ai`'s `<SharedMolarAI>`.
//
// Phase APPOINTMENT-MOLAR-AI-P0-SECURITY-HARDENING: this adapter no longer
// parses or dispatches any fenced ```json action block. Prompt instructions
// (geminiService.js's "No JSON Actions" rule / GUIDANCE POLICY, which
// already documents that Molar AI does NOT have permission to add or update
// appointments/patients/staff/rooms/treatments/holidays) are not a security
// boundary — the prior parser would still execute a fenced action block
// from ANY source that produced one, including an admin-configured keyword
// response (`aiboard_responses`), completely bypassing that policy with no
// user confirmation. Current product evidence (the prompt's own explicit
// "teach the user where to click" guidance policy) supports a read-only
// Molar AI here, not an AI-assisted-mutation model — so the smallest safe
// fix is removing the dispatcher entirely, not building new confirmation
// UI for a capability the product doesn't currently intend to offer.
//
// `window.__MOLAR_ACTIONS__` itself (assigned in App.jsx) is left in place —
// untouched, out of scope — but is now dead: nothing in this file (or
// anywhere else in the repo) reads it anymore.
import type { AIAdapter, AIMessage } from '@mrburdeveloperteam/molar-experience/contracts';
import { chatWithMolarAI, chatWithGroundedAppointmentFacts } from '../services/geminiService';
import { supabase } from '../lib/supabaseClient';
import { isAppointmentMutationRequest } from './dataChat/router/isAppointmentMutationRequest';
import { classifyAppointmentDataIntent } from './dataChat/router/classifyAppointmentDataIntent';
import { resolveAppointmentDataQuery } from './dataChat/resolver/resolveAppointmentDataQuery';
import {
  buildUnsupportedParameterMessage,
  buildUnsupportedScopeMessage,
  buildUnsupportedSensitiveScopeMessage,
} from './dataChat/utils/unsupportedParameterMessage';
import { formatGroundedAppointmentFallback } from './dataChat/utils/formatGroundedAppointmentFallback';
import type { AppointmentDataStatus } from './dataChat/contracts/groundedDataResult';
import type { DateRangeLike } from './utils/appointmentCoverage';

// Maps the shared package's normalized `{role, text}` history entries back
// to the `{role, parts:[{text}]}` shape `chatWithMolarAI` (and the Gemini
// SDK) expects — this mapping stays local to the adapter, never leaking a
// Gemini-shaped type into the shared package (see AIRequest/AIMessage in
// @mrburdeveloperteam/molar-experience/contracts).
function toGeminiHistory(history: AIMessage[]) {
  return history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

interface AppointmentsMolarAdapterDeps {
  userContext: string;
  appointments: unknown[];
  rooms: unknown[];
  appointmentDataStatus: AppointmentDataStatus;
  loadedAppointmentRange: DateRangeLike | null | undefined;
  // Only read by `appointment_today_list` (see
  // dataChat/providers/todayScheduleDataProvider.ts) to resolve
  // patient/dentist/treatment display names for that one intent's
  // response. Defaulted so every other call site is unaffected.
  patients?: unknown[];
  staff?: unknown[];
  treatments?: unknown[];
}

export function createAppointmentsMolarAdapter({
  userContext,
  appointments,
  rooms,
  appointmentDataStatus,
  loadedAppointmentRange,
  patients = [],
  staff = [],
  treatments = [],
}: AppointmentsMolarAdapterDeps): AIAdapter {
  return {
    async sendMessage({ text, history }) {
      const msg = text.trim();

      try {
        // ── Phase-3 Data-Driven Chat (read-only pilot) ──────────────────
        // Runs BEFORE the existing predefined-response/legacy General Chat
        // pipeline below, and is fully separate from it: a matched request
        // here never calls the DB-backed predefined-keyword lookup or
        // `chatWithMolarAI`, and its output is never scanned for the
        // fenced ```json action block / never reaches
        // `window.__MOLAR_ACTIONS__`. See src/aiExperience/dataChat/ for
        // the deterministic router/provider/resolver pipeline this uses.

        // 1. Explicit appointment MUTATION requests are intercepted with a
        // deterministic refusal — zero Gemini calls, zero mutation. This
        // is REQUIRED (not optional) here: unlike the To-Do repo,
        // `window.__MOLAR_ACTIONS__` in THIS app is live-wired (see
        // App.jsx's own effect assigning real handlers to it) — see
        // isAppointmentMutationRequest.ts's file header.
        if (isAppointmentMutationRequest(msg)) {
          return {
            text: "This data chat can check appointment information, but it can't make appointment changes.",
            meta: { source: 'data-chat' },
          };
        }

        // 2. Deterministic LOCAL intent classification (no Gemini call).
        const dataRoute = classifyAppointmentDataIntent(msg);

        if (dataRoute.kind === 'unsupported_sensitive_scope') {
          // Recognized PATIENT-specific questions must never fall through
          // to legacy General Chat, which embeds raw patient PII in its
          // own `userContext` — see buildUnsupportedSensitiveScopeMessage's
          // file header.
          return {
            text: buildUnsupportedSensitiveScopeMessage(dataRoute.reason),
            meta: { source: 'data-chat' },
          };
        }

        if (dataRoute.kind === 'unsupported_parameter') {
          return {
            text: buildUnsupportedParameterMessage(dataRoute.reason),
            meta: { source: 'data-chat' },
          };
        }

        if (dataRoute.kind === 'unsupported_scope') {
          return {
            text: buildUnsupportedScopeMessage(dataRoute.reason),
            meta: { source: 'data-chat' },
          };
        }

        if (dataRoute.kind === 'matched') {
          const result = resolveAppointmentDataQuery(
            dataRoute.intent,
            appointments,
            rooms,
            appointmentDataStatus,
            loadedAppointmentRange,
            patients,
            staff,
            treatments
          );

          let dataChatResponseText;
          if (result.status === 'unavailable') {
            // Unknown/unavailable appointment state is never reinterpreted
            // as a zero-result answer, and a matched grounded intent owns
            // this request even when its provider is temporarily
            // unavailable — it does not fall through to legacy chat.
            dataChatResponseText = "I couldn't check your appointment data right now.";
          } else if (result.intent === 'appointment_today_list') {
            // `appointment_today_list`'s facts resolve real patient/
            // dentist/treatment names (see todayScheduleDataProvider.ts's
            // own "NOT MODEL-SAFE FACTS" header) — this intent NEVER
            // calls chatWithGroundedAppointmentFacts/Gemini. The same
            // deterministic formatter every other intent only uses as a
            // Gemini-failure fallback is this intent's ONLY renderer.
            dataChatResponseText = formatGroundedAppointmentFallback(result.intent, result.facts);
          } else {
            try {
              // 3. Grounded Gemini phrasing — receives ONLY the question,
              // the approved intent, and the already-minimized, patient-
              // free facts. Plain text only; never scanned for action
              // blocks.
              dataChatResponseText = await chatWithGroundedAppointmentFacts(msg, result.intent, result.facts);
            } catch (groundedErr) {
              // Mandatory deterministic fallback — never falls through to
              // legacy General Chat on a Gemini failure at this stage.
              console.error('Grounded appointment response failed:', groundedErr);
              dataChatResponseText = formatGroundedAppointmentFallback(result.intent, result.facts);
            }
          }

          return { text: dataChatResponseText, meta: { source: 'data-chat' } };
        }
        // ── End Phase-3 Data-Driven Chat (dataRoute.kind === 'no_match') ─

        let response = null;

        // 1. Check custom responses first
        const { data: apps } = await supabase
          .from('aiboard_response_target_apps')
          .select('response_id')
          .in('app_name', ['Appointment', 'All']);

        if (apps && apps.length > 0) {
          const responseIds = apps.map((a) => a.response_id);
          const { data: keywords } = await supabase
            .from('aiboard_response_keywords')
            .select('keyword, response_id')
            .in('response_id', responseIds);

          if (keywords && keywords.length > 0) {
            const matchedKeyword = keywords.find((k) => msg.toLowerCase().includes(k.keyword.toLowerCase()));

            if (matchedKeyword) {
              const { data: respData } = await supabase
                .from('aiboard_responses')
                .select('response')
                .eq('id', matchedKeyword.response_id)
                .single();

              if (respData) {
                response = respData.response;
              }
            }
          }
        }

        // 2. Fallback to Gemini
        if (!response) {
          response = await chatWithMolarAI(toGeminiHistory(history), msg, userContext || '');
        }

        // Strip any stray fenced code block from display only — never
        // parsed, never executed, never dispatched. The system prompt
        // (geminiService.js) explicitly forbids the model from emitting
        // one; this is defensive cosmetic cleanup only, in case a legacy
        // admin-configured keyword response (`aiboard_responses`) still
        // contains one, so it doesn't render as a confusing raw code
        // block in the chat UI.
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/```\s*(\{[\s\S]*?\})\s*```/);
        const cleanResponse = jsonMatch ? response.replace(jsonMatch[0], '').trim() : response;

        return {
          text: cleanResponse || 'SNAI: Unable to process request.',
          meta: { source: 'general' },
        };
      } catch (error) {
        // Matches SharedMolarAI's own generic catch string exactly (see
        // dist/ai.js's `ERROR_TEXT`) — returned here rather than thrown so
        // this adapter's behavior stays identical regardless of the shared
        // package's own catch handling.
        return { text: 'SNAI Error: Unable to process request.', meta: { source: 'fallback' } };
      }
    },
  };
}
