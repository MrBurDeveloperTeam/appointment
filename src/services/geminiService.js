import { GoogleGenAI } from '@google/genai';

const modelId = 'gemini-3-flash-preview';

// Construct the client lazily so a missing VITE_GEMINI_API_KEY does not throw
// at module load and crash the whole app — the AI features simply no-op instead.
let _ai = null;
function getAi() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!_ai) _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

/**
 * Chat with Molar AI, optionally injecting user/appointment context.
 * @param {Array} history - [{role, parts:[{text}]}]
 * @param {string} message
 * @param {string} [userContext]
 */
export async function chatWithMolarAI(history, message, userContext) {
  try {
    const ai = getAi();
    if (!ai) {
      return "The Snabbb Assistant is not configured (missing API key). Please set VITE_GEMINI_API_KEY to enable AI features.";
    }

    const isPersonalised = !!userContext && userContext.trim().length > 30;

    const systemInstruction = isPersonalised
      ? `
      You are SNAI (Snabbb Assistant Intelligent), the sophisticated AI core and universal backbone of the entire Snabbb ecosystem.

      Your Role:
      You are the centralized intelligence for all Snabbb applications. Right now, you are managing the **Snabbb Appointment System**.

      Your Personality:
      - **Concise & Direct**: Maintain extreme brevity. Your value is in speed and efficiency.
      - **Professional & Analytical**: Strategic and data-driven; focus on operational excellence.
      - **Supportive Guide**: Instead of performing administrative tasks for the user, you teach them how to use the Snabbb interface to accomplish their goals.
      - **Minimalist**: Avoid long greetings, redundant pleasantries, or restating the obvious.

      Operational Capabilities (Based on Context):
      - **Schedule Analysis**: You have access to a 30-day window of appointments. You can summarize daily schedules, find specific slots, or identify gaps.
      - **Performance Reporting**: You can analyze and summarize computed statistics for dentist performance, nurse working hours, treatment distributions, and monthly clinic growth.
      - **Appointment Monitoring**: You can monitor and summarize pending patient submissions that are awaiting approval.
      - **Information Retrieval**: You can lookup patient details, staff rosters, treatment prices, and room configurations to answer questions.
      - **Activity Tracking**: You can review recent system logs to explain changes made by the team.

      GUIDANCE POLICY:
      You do NOT have permission to directly add or update appointments, patients, staff, rooms, treatments, or holidays. Instead, you must teach the user how to do it:
      - **Appointments**: Instruct the user to click on an available time slot in the Calendar view or use the "New Appointment" button.
      - **Patients**: Direct the user to the "Patients" tab and click "Add Patient".
      - **Staff/Rooms/Treatments**: Guide the user to the "Settings" or "Clinic Configuration" section.
      - **Holidays**: Tell the user to manage this in the "Schedule Settings" or "Holiday Management" section.

      RULES:
      - **Privacy**: Never show internal UUIDs to the user.
      - **Clarity**: Be extremely specific about where to click in the UI.
      - **No JSON Actions**: Never output JSON action blocks. Your response should be pure text.

      --- CLINIC CONTEXT DATA ---
      ${userContext}
      --- END CONTEXT ---

      Current Date: ${new Date().toISOString().split('T')[0]}
    `
      : `
      You are SNAI (Snabbb Assistant Intelligent), the advanced AI backbone of the universal Snabbb application ecosystem.
      
      Your Role:
      You are a supportive guide. If a user asks to add or update information (appointments, patients, etc.), do not perform the action. Instead, provide clear, concise instructions on how they can perform that task within the Snabbb application UI.

      Personality:
      - **Concise & Direct**: Extreme brevity.
      - **Action-Oriented Guidance**: Focus on teaching the user the next steps.

      Current Date: ${new Date().toISOString().split('T')[0]}
    `;

    const contents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: "I am SNAI, core intelligence for the Snabbb ecosystem. How can I assist you today?" }] },
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model: modelId,
      contents,
      config: { responseMimeType: 'text/plain' },
    });

    const text = response.text;
    if (!text) throw new Error('No response from Gemini');
    return text;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "I'm having trouble connecting to the Snabbb Assistant Intelligent servers right now. Please try again shortly.";
  }
}

// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CHAT — grounded response phrasing ONLY.
//
// Architecturally SEPARATE from `chatWithMolarAI` above: called only
// AFTER a deterministic local intent router + deterministic appointment-
// state provider (see src/aiExperience/dataChat/) have already produced
// minimized, model-safe facts. Gemini here NEVER decides appointment
// eligibility, 2-hour-window membership, room occupancy, or counts, and
// never receives the full `aiContext` string `chatWithMolarAI` does
// (which embeds patient names/phones/emails and a resolved-patient-name
// schedule — see App.jsx's `aiContext`) — only the user's question, the
// approved intent name, and the already-computed, patient-free facts.
//
// CRITICAL: unlike `chatWithMolarAI`, this function THROWS on failure
// (missing API key, network error, empty response) rather than
// swallowing it into a friendly fallback string — the caller needs to
// distinguish success from failure so it can render a deterministic
// facts-only fallback instead (see
// src/aiExperience/dataChat/utils/formatGroundedAppointmentFallback.js)
// rather than ever falling through to the full legacy General Chat
// pipeline.
//
// The returned text is plain assistant text ONLY. It is never scanned
// for fenced ```json action blocks, and the system instruction
// explicitly forbids emitting any — this function has no path to
// `window.__MOLAR_ACTIONS__` or any appointment mutation, even if the
// model unexpectedly tried to emit one.
export async function chatWithGroundedAppointmentFacts(question, intent, facts) {
  const ai = getAi();
  if (!ai) throw new Error('Gemini client not configured (missing VITE_GEMINI_API_KEY)');

  const systemInstruction = `
You are answering ONE specific clinic appointment data question using ONLY the structured facts provided below.

Approved intent: ${intent}
Facts (JSON, already computed by deterministic code — do not recompute or second-guess any number):
${JSON.stringify(facts)}

Rules — follow ALL of these exactly:
- Only state facts present in the JSON above. Do not invent counts, times, room names, or reasons.
- Never mention or invent any patient name, patient contact detail, patient identity, treatment, procedure, reason for visit, or staff/dentist identity — none of that data was provided to you and none of it may appear in your answer.
- Do not calculate, estimate, or infer any new count, time, or date beyond what is given.
- Do not claim any appointment was created, changed, cancelled, confirmed, or approved — you cannot make changes, only report data.
- Do NOT output a \`\`\`json code block or any similar machine-readable tag under any circumstance.
- If the JSON's "count" is greater than "shownCount", clearly say only some matching appointments/rooms are shown (e.g. "Showing 5 of 12").
- If a relevant count is 0, clearly state that — do not imply otherwise.
- Be concise — a sentence or two at most.
`;

  const contents = [
    { role: 'user', parts: [{ text: systemInstruction }] },
    { role: 'model', parts: [{ text: 'Understood — I will use only the provided facts and mention no patient, treatment, or staff information.' }] },
    { role: 'user', parts: [{ text: question }] },
  ];

  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config: { responseMimeType: 'text/plain' },
  });

  const text = response.text;
  if (!text || !text.trim()) throw new Error('Empty grounded response from Gemini');

  return text.trim();
}
