import { supabase } from "../lib/supabaseClient";
import { api } from "../services/api";

export async function signUp({ email, password, fullName }) {
  const { data, error } = api.post("/auth/signup", { email, password, fullName }).catch(async (err) => {
    // If API call fails, fallback to Supabase sign-up
    return await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  });
  if (error) throw error;
  return data;
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
