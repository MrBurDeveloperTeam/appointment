import { supabase } from "../lib/supabaseClient";
import { api } from "../services/api";
import { loginOdoo } from "../services/loginOdoo";
import applink from "../services/app_link";

const API_URL = import.meta.env.VITE_API_BASE_URL || "https://sso.mrburstudio.com/api";

export async function signUp({
  email,
  password,
  fullName,
  accountType = 'individual',
  companyName = '',
  phone = '',
  position = '',
  dob = '',
  country = '',
  agreedToTerms = false,
}) {
  const name = fullName.trim();
  const normalizedEmail = email.trim();
  const metadata = {
    name,
    full_name: name,
    account_type: accountType,
    phone: phone.trim() || null,
    position: position.trim() || null,
    company_name: accountType === 'company' ? companyName.trim() || null : null,
    dob: dob || null,
    country: country || null,
    agreed_to_terms: Boolean(agreedToTerms),
  };

  // Match E-learning: create the corresponding Odoo account first.
  const workerResponse = await api.post('/appointment/sign-up', {
    email: normalizedEmail,
    password,
    name,
    phone: metadata.phone,
    position: metadata.position,
    account_type: metadata.account_type,
    company_name: metadata.company_name,
    dob: metadata.dob,
    country: metadata.country,
  });
  const workerData = workerResponse?.data;
  const workerSucceeded = workerData?.ok === true || workerData?.result?.ok === true || workerData?.data?.result?.ok === true;
  if (!workerSucceeded) {
    throw new Error(workerData?.error || workerData?.data?.error?.message || 'Failed to create Appointment account');
  }

  // Then create the Supabase Auth user and persist every form field in user_metadata.
  const supabaseResult = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: metadata },
  });
  if (supabaseResult.error) throw supabaseResult.error;
  return supabaseResult.data;
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
