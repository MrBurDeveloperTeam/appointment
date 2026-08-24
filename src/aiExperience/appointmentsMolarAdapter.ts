// PHASE 8D (Molar AI migration): thin host `AIAdapter` implementation for
// `@mrburdeveloperteam/molar-experience/ai`'s `<SharedMolarAI>`.
//
// This file is a MECHANICAL relocation of `MolarAIFloat.jsx`'s pre-8D
// `handleSendMessage` body — every branch, message string, query, and the
// fenced ```json action-block parser/dispatcher are preserved verbatim.
// Nothing here is a redesign.
//
// window.__MOLAR_ACTIONS__ IS LIVE IN THIS APP (unlike To-Do's confirmed-dead
// equivalent) — App.jsx's own effect assigns real handlers
// (addAppointment/updateAppointment/addStaff/addRoom/addTreatment/
// addHoliday/addPatient) to it, and this adapter's action parser dispatches
// to them exactly as MolarAIFloat.jsx used to. That effect and its handlers
// are OUT OF SCOPE for this phase and are not touched — this file only
// relocates the CONSUMER side (the parser + `window.__MOLAR_ACTIONS__[...]`
// calls), never the producer.
//
// Reachability note (see isAppointmentMutationRequest.ts's own header): the
// current Gemini system prompt (geminiService.js) instructs the model never
// to emit a JSON action block, but that is prompt compliance, not a safety
// boundary — an admin-configured keyword response (aiboard_responses) could
// still contain a fenced ```json action block, and the parser below would
// dispatch it exactly as before. This is why the parser/dispatcher is
// preserved exactly rather than removed as "unreachable in practice."
//
// SharedMolarAI's own AIResponse.hostAction field is NOT wired to anything
// in the installed 0.5.0 runtime (confirmed by reading dist/ai.js — it never
// reads `hostAction`) — so action execution must complete entirely INSIDE
// `sendMessage` before it returns, exactly as it did inline in
// `handleSendMessage` before this phase.
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
}

export function createAppointmentsMolarAdapter({
  userContext,
  appointments,
  rooms,
  appointmentDataStatus,
  loadedAppointmentRange,
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
            loadedAppointmentRange
          );

          let dataChatResponseText;
          if (result.status === 'unavailable') {
            // Unknown/unavailable appointment state is never reinterpreted
            // as a zero-result answer, and a matched grounded intent owns
            // this request even when its provider is temporarily
            // unavailable — it does not fall through to legacy chat.
            dataChatResponseText = "I couldn't check your appointment data right now.";
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

        // Parse actions from backticks if present
        let cleanResponse = response;
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/```\s*(\{[\s\S]*?\})\s*```/);

        if (jsonMatch) {
          try {
            const actionObj = JSON.parse(jsonMatch[1]);
            cleanResponse = response.replace(jsonMatch[0], '').trim();

            const molarActions = (window as any).__MOLAR_ACTIONS__;
            if (actionObj.action && molarActions) {
              const handlers = molarActions;
              const { action, data, id } = actionObj;

              console.log('[MolarAI] Executing action:', action, data);

              switch (action) {
                case 'ADD_APPOINTMENT': handlers.addAppointment?.(data); break;
                case 'UPDATE_APPOINTMENT': handlers.updateAppointment?.(id, data); break;
                case 'ADD_STAFF': handlers.addStaff?.(data); break;
                case 'ADD_ROOM': handlers.addRoom?.(data); break;
                case 'ADD_TREATMENT': handlers.addTreatment?.(data); break;
                case 'ADD_HOLIDAY': handlers.addHoliday?.(data); break;
                case 'ADD_PATIENT': handlers.addPatient?.(data); break;
                default: console.warn('[MolarAI] Unknown action:', action);
              }
            }
          } catch (e) {
            console.error('[MolarAI] Action parse failed:', e);
          }
        }

        return {
          text: cleanResponse || 'SNAI: Action executed.',
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
