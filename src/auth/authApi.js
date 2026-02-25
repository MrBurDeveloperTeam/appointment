import { supabase } from "../lib/supabaseClient";
import { api } from "../services/api";

const API_URL = import.meta.env.VITE_API_BASE_URL || "https://sso.mrburstudio.com/api";

// Helper to mimic Axios using native fetch
const api = {
  post: async (endpoint, data) => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return { data: await res.json() };
  }
};

export async function signUp({ email, fullName }) {
  // const payload = { email, password, name: fullName };
  const payload = { email, name: fullName }; // Testing: no password
  // const supaPayload = { email, password, options: { data: { full_name: fullName } } };
  const supaPayload = { email, password: "testPassword123!", options: { data: { full_name: fullName } } }; // Testing: Supabase auth requires a password, hardcoding one for testing

  // 1. Your exact requested line (worker creation or fallback to Supabase Auth)
  const odooResponse = await api.post('/appointment/sign-up', payload).catch(async (err) => {
    console.log('err: ', err);
    return await supabase.auth.signUp(supaPayload);
  });

  // Extract odooData. (If worker succeeded, odooData is the JSON response. If fallback ran, it has .user/.session)
  const { data: odooData } = odooResponse || {};

  // 2. Your exact requested line (if worker succeeded, create in Supabase too)
  const supaResult = odooData?.data?.result?.ok && await supabase.auth.signUp(supaPayload);

  // Error handling if Supabase Auth fails (ignore already registered)
  if (supaResult?.error && !supaResult.error.message.includes("already registered")) {
    throw supaResult.error;
  }

  // Return the user data (either from the fallback result or the secondary signup result)
  return supaResult?.data || odooData;
}

export async function signIn({ email, password }) {
  const { data, error } = await api.post("/auth/login", { email, password }).catch(async (err) => {
    return await supabase.auth.signInWithPassword({ email, password });
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error && error.message !== "Auth session missing!") throw error;
}
