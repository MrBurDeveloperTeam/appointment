import { supabase } from "../lib/supabaseClient";
import { api } from "../services/api";
import { loginOdoo } from "../services/loginOdoo";
import applink from "../services/app_link";

const API_URL = import.meta.env.VITE_API_BASE_URL || "https://sso.mrburstudio.com/api";

export async function signUp({ email, password, fullName }) {
  const payload = { email, password, name: fullName };
  const supaPayload = { email, password, options: { data: { full_name: fullName } } };

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
  const { data, error } = await api.post("/odoo/login", { email, password }).catch(async (err) => {
    return await supabase.auth.signInWithPassword({ email, password });
  });
  if (error) {
    const { data } =  await loginOdoo(email, password); 
          data && data?.result && data.result?.uid
          if (data && data.result && data.result.uid) {
            const applinkData = await applink(data.result);
            console.log('Applink response:', applinkData);
          }
          return data;
  }

  // After successful Odoo login, ensure the Supabase session is established.
  // The worker now auto-provisions the account, but we still need to hit /sso/exchange
  // to get the browser-side Supabase JWT.
  if (data?.token) {
    // Set the SSO cookie for exchange (using .snabbb.com if on that domain)
    const domain = window.location.hostname.includes('snabbb.com') ? '; domain=.snabbb.com' : '';
    document.cookie = `mrbur_sso=${data.token}; path=/${domain}; secure; samesite=lax; max-age=3600`;

    try {
      const exchangeRes = await api.get('/sso/exchange', {
        headers: {
          Authorization: `Bearer ${data.token}`
        }
      });

      if (exchangeRes.data?.access_token) {
        await supabase.auth.setSession({
          access_token: exchangeRes.data.access_token,
          refresh_token: exchangeRes.data.refresh_token,
        });
        console.log("Supabase session established via direct login exchange.");
      }
    } catch (e) {
      console.error('Failed to exchange SSO token on direct login:', e);
    }
  }

  return data;
}

export async function signOut() {
  try {
    await api.post('/logout');
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Error signing out of Supabase:', error);
  }
  //if (error && error.message !== "Auth session missing!") throw error;
}
