// Server-only Gemini boundary for Molar AI (Appointment). This is the
// ONLY place in this project that imports @google/genai, constructs a
// Gemini client, reads the Gemini provider credential, or calls
// generateContent — see src/services/geminiService.js, which now only
// forwards requests here via supabase.functions.invoke('molar-chat', ...)
// (using the browser's already-authenticated Supabase session) and never
// touches the SDK/credential itself.
//
// Requires a real authenticated Supabase user for every request — this is
// NOT an anonymous public provider endpoint. Rejects with 401 if the
// caller's bearer token does not resolve to a valid user.
//
// Two request modes, mirroring the two pre-existing client functions
// exactly (prompts/model unchanged, only relocated):
//   - "general": free-form General Chat (chatWithMolarAI's prior body).
//   - "grounded": grounded Data-Chat phrasing over host-selected,
//     already-minimized facts (chatWithGroundedAppointmentFacts's prior
//     body). This function never queries appointment/patient/staff
//     tables, never decides eligibility/room occupancy/counts, and never
//     receives raw patient data — only language generation over facts or
//     context the client already resolved before calling here.
//
// This function does NOT execute any mutation and has no path to
// `window.__MOLAR_ACTIONS__` — that dispatcher was removed entirely from
// the client adapter (see appointmentsMolarAdapter.ts). Nothing this
// function returns is ever parsed as a machine-readable action.
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

const modelId = "gemini-3-flash-preview";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type ChatMessage = { role: "user" | "model"; parts: { text: string }[] };

function isValidHistory(history: unknown): history is ChatMessage[] {
  if (!Array.isArray(history)) return false;
  return history.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry.role === "user" || entry.role === "model") &&
      Array.isArray(entry.parts) &&
      entry.parts.every((p: unknown) => typeof (p as { text?: unknown })?.text === "string")
  );
}

// Verbatim from the pre-migration client-side geminiService.js — same
// personalized/non-personalized branching, same GUIDANCE POLICY (AI does
// NOT have permission to add/update appointments, patients, staff, rooms,
// treatments, or holidays; it teaches the user where to click instead),
// same "No JSON Actions" rule.
function buildGeneralSystemInstruction(userContext: string): string {
  const isPersonalised = !!userContext && userContext.trim().length > 30;

  if (isPersonalised) {
    return `
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

      Current Date: ${new Date().toISOString().split("T")[0]}
    `;
  }

  return `
      You are SNAI (Snabbb Assistant Intelligent), the advanced AI backbone of the universal Snabbb application ecosystem.

      Your Role:
      You are a supportive guide. If a user asks to add or update information (appointments, patients, etc.), do not perform the action. Instead, provide clear, concise instructions on how they can perform that task within the Snabbb application UI.

      Personality:
      - **Concise & Direct**: Extreme brevity.
      - **Action-Oriented Guidance**: Focus on teaching the user the next steps.

      Current Date: ${new Date().toISOString().split("T")[0]}
    `;
}

// Verbatim from the pre-migration client-side geminiService.js.
function buildGroundedSystemInstruction(intent: string, facts: unknown): string {
  return `
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
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // --- Require a real authenticated Supabase user. Never treat the mere
  // presence of an Authorization header, or the anon key alone, as proof
  // of a real user. ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[molar-chat] Missing SUPABASE_URL/SUPABASE_ANON_KEY runtime configuration.");
    return json({ ok: false, error: "Server is not configured." }, 500);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser();

  if (authError || !user) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[molar-chat] Missing server-side GEMINI_API_KEY configuration.");
    return json({ ok: false, error: "AI service is not configured." }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const { mode } = (body ?? {}) as { mode?: unknown };

  if (mode !== "general" && mode !== "grounded") {
    return json({ ok: false, error: "Invalid or missing mode." }, 400);
  }

  const ai = new GoogleGenAI({ apiKey });

  if (mode === "general") {
    const { message, history, userContext } = body as {
      message?: unknown;
      history?: unknown;
      userContext?: unknown;
    };

    if (typeof message !== "string" || !message.trim()) {
      return json({ ok: false, error: "Message is required." }, 400);
    }
    if (history !== undefined && !isValidHistory(history)) {
      return json({ ok: false, error: "Invalid history." }, 400);
    }
    if (userContext !== undefined && typeof userContext !== "string") {
      return json({ ok: false, error: "Invalid context." }, 400);
    }

    try {
      const systemInstruction = buildGeneralSystemInstruction(
        typeof userContext === "string" ? userContext : ""
      );

      const contents = [
        { role: "user", parts: [{ text: systemInstruction }] },
        { role: "model", parts: [{ text: "I am SNAI, core intelligence for the Snabbb ecosystem. How can I assist you today?" }] },
        ...((history as ChatMessage[] | undefined) ?? []),
        { role: "user", parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: { responseMimeType: "text/plain" },
      });

      const text = response.text;
      if (!text) {
        return json({ ok: false, error: "No response from AI service." }, 502);
      }

      return json({ ok: true, text });
    } catch (error) {
      console.error("[molar-chat] General chat provider error:", error);
      return json({ ok: false, error: "AI service request failed." }, 502);
    }
  }

  // mode === "grounded"
  const { question, intent, facts } = body as {
    question?: unknown;
    intent?: unknown;
    facts?: unknown;
  };

  if (typeof question !== "string" || !question.trim()) {
    return json({ ok: false, error: "Question is required." }, 400);
  }
  if (typeof intent !== "string" || !intent.trim()) {
    return json({ ok: false, error: "Intent is required." }, 400);
  }
  if (facts === undefined) {
    return json({ ok: false, error: "Facts are required." }, 400);
  }

  try {
    const systemInstruction = buildGroundedSystemInstruction(intent, facts);

    const contents = [
      { role: "user", parts: [{ text: systemInstruction }] },
      { role: "model", parts: [{ text: "Understood — I will use only the provided facts and mention no patient, treatment, or staff information." }] },
      { role: "user", parts: [{ text: question }] },
    ];

    const response = await ai.models.generateContent({
      model: modelId,
      contents,
      config: { responseMimeType: "text/plain" },
    });

    const text = response.text;
    if (!text || !text.trim()) {
      return json({ ok: false, error: "Empty response from AI service." }, 502);
    }

    return json({ ok: true, text: text.trim() });
  } catch (error) {
    console.error("[molar-chat] Grounded chat provider error:", error);
    return json({ ok: false, error: "AI service request failed." }, 502);
  }
});
