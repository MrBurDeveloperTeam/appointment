import { APP_CONFIG } from "./config/apps.js";
import { parseJwtPayload, extractEmail } from "./auth/odooJWT.js";
import { getProfileByEmail } from "./supabase/profiles.js";
import { getInventoryMetaByUserId } from "./supabase/inventoryMeta.js";
import { supabaseBootstrapByEmail } from "./supabase/bootstrap.js";
import { inventoryFullSync } from "./supabase/inventorySync.js";
import { getAppointments, updateAppointment, deleteAppointment, createAppointment } from "./supabase/appointments.js";
import {searchPatients, createPatient, getPatients, updatePatient, deletePatient} from "./supabase/patients.js";
import { getStaff, createStaff, updateStaff, deleteStaff } from "./supabase/staff.js";
import { getRooms, createRoom, updateRoom, deleteRoom } from "./supabase/rooms.js";
import { getTreatments, createTreatment, updateTreatment, deleteTreatment } from "./supabase/treatments.js";
import { getSettings, saveSettings } from "./supabase/settings.js";
import { getHolidays, addHoliday, updateHoliday, deleteHoliday } from "./supabase/holidays.js";
import { getActivity, addActivity } from "./supabase/activity.js";
import { handleWhiteboardApi } from "./supabase/whiteboard.js";
import { handleTasksApi } from "./supabase/tasks.js"; 
import { getRequests, updateRequest } from "./supabase/requests.js";
import { getClinics, getClinicById, addClinic, updateClinic, deleteClinic } from "./supabase/clinics.js";
import { getProfiles, getProfileById, updateProfile } from "./supabase/apt_profiles.js";
import { handleHiringApi } from "./supabase/hiring.js";
import { getCollaboratorsByUserId } from "./supabase/collaborators.js";
import { getLatestProfileByUserId } from "./supabase/profiles-bootstrap.js";
import { updateRoomPosition } from "./supabase/inventoryRooms.js";

/* =========================================================
   🔥 CONFIG
========================================================= */

const PUBLIC_EVENT_HOST = "event.snabbb.com";
const ODOO_EVENT_HOST = "mrbur.odoo.com";
const ODOO_EVENT_BASE = "/event";
const ODOO_SHOP_BASE = "/shop";
const ODOO_DEV_HOST = "aht-systemadmin-mrbur-main-20994444.dev.odoo.com";
const ODOO_DEV_BASE = `https://${ODOO_DEV_HOST}`;
const PUBLIC_SHOP_HOST = "shop.snabbb.com";
const ODOO_SHOP_HOST = "mrbur.odoo.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==============================
    // ✅ COOKIE CONFIG (SHARED ACROSS SUBDOMAINS)
    // ==============================
    const COOKIE_NAME = "mrbur_sso";
    const COOKIE_ODOO_NAME = "session_id";
    const COOKIE_DOMAIN = ".snabbb.com"; // ✅ shared across all subdomains
    const DEFAULT_MAX_AGE = 60 * 60; // 1 hour

    // ==============================
    // ✅ CORS
    // ==============================
    const origin = request.headers.get("Origin");
    const allowedOrigins = new Set([
      "https://app.snabbb.com",
      "https://inventory.snabbb.com",
      "https://appointment.snabbb.com",
      "https://imageai.snabbb.com",
      "https://event.snabbb.com",
      "https://recruitment.snabbb.com",
      "https://calculator.snabbb.com",
      "https://todo.snabbb.com",
      "https://shop.snabbb.com",
      "https://mrbur.odoo.com",
      "http://localhost:3000",
      "http://localhost:5173",
    ]);

    const isApi = url.pathname.startsWith("/api/");

    // NOTE: for cookies, Origin MUST be echoed (not "*")
    const corsHeaders = isApi
      ? {
          "Access-Control-Allow-Origin": allowedOrigins.has(origin)
            ? origin
            : "https://inventory.snabbb.com",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, Accept, X-Requested-With, X-SSO-API-KEY, Cookie",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : {};

    // Preflight
    if (isApi && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ==============================
    // ✅ HELPERS
    // ==============================
    function appendRewrittenCookies(outHeaders, upstreamRes, targetDomain = ".snabbb.com") {
  const setCookies = upstreamRes.headers.getSetCookie?.() ?? [];

  for (const cookie of setCookies) {
    let rewritten = cookie;

    if (/Domain=/i.test(rewritten)) {
      rewritten = rewritten.replace(/Domain=[^;]+/i, `Domain=${targetDomain}`);
    } else {
      rewritten = `${rewritten}; Domain=${targetDomain}`;
    }

    outHeaders.append("Set-Cookie", rewritten);
  }
}

function copyResponseHeadersWithoutSetCookie(upstreamRes) {
  const outHeaders = new Headers();
  for (const [key, value] of upstreamRes.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") continue;
    outHeaders.append(key, value);
  }
  return outHeaders;
}


    function getCookieValue(req, name) {
      const cookie = req.headers.get("Cookie") || "";
      const parts = cookie.split(";").map((v) => v.trim());
      for (const part of parts) {
        if (part.startsWith(name + "=")) return part.slice(name.length + 1);
      }
      return null;
    }
    
    // extract "session_id=XXXX" from any Set-Cookie header
    function parseSessionIdFromSetCookie(setCookie) {
      if (!setCookie) return null;
      const m = setCookie.match(/(?:^|;\s*)session_id=([^;]+)/i);
      return m?.[1] || null;
    }
    
    // IMPORTANT: make Odoo session cookie shared across *.snabbb.com
    function buildSharedOdooSessionCookie(sessionId, { maxAge = 60 * 60 * 6 } = {}) {
      // You can tune maxAge; Odoo session might still expire server-side earlier/later.
      return [
        `session_id=${sessionId}`,
        "Path=/",
        `Domain=.snabbb.com`,
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        `Max-Age=${maxAge}`,
      ].join("; ");
    }
    function json(data, status = 200, extraHeaders = {}) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders, ...extraHeaders },
      });
    }
    
    function parseCookie(setCookieHeader) {
      // Odoo returns something like: "session_id=...; Expires=...; Max-Age=...; HttpOnly; Path=/; SameSite=Lax; Secure"
      // We want just: "session_id=..."
      if (!setCookieHeader) return null;
      const part = setCookieHeader.split(";")[0]?.trim();
      return part && part.startsWith("session_id=") ? part : null;
    }
    
    function getBearer(request) {
      const h = request.headers.get("Authorization") || "";
      const m = h.match(/^Bearer\s+(.+)$/i);
      return m?.[1] || null;
    }

    // Compare signatures by recomputing HS256
    async function verifyHS256({ token, secret }) {
      try {
        const parts = token.split(".");
        if (parts.length !== 3) return { ok: false, error: "bad_format" };
      
        const [h, p, sig] = parts;
        const signingInput = `${h}.${p}`;
      
        // Re-sign payload and compare signature
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          enc.encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
      
        const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
        const expected = base64UrlEncodeBytes(new Uint8Array(sigBuf)); // you already defined this earlier
      
        if (expected !== sig) return { ok: false, error: "bad_sig" };
      
        // Decode payload
        const jsonStr = atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4));
        const payload = JSON.parse(jsonStr);
      
        const now = Math.floor(Date.now() / 1000);
        if (payload?.exp && now >= payload.exp) return { ok: false, error: "expired" };
      
        return { ok: true, payload };
      } catch (e) {
        return { ok: false, error: "verify_failed" };
      }
    }

    function kvKeyForOdoo(uid) {
      return `odoo_session:${uid}`;
    }

    async function odooJsonRpc({ base, path, body, cookie = "" }) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    
      const setCookie = res.headers.get("Set-Cookie"); // may be null
      const data = await res.json().catch(() => null);
      return { res, data, setCookie };
    }

    function getCookie(req, name) {
      const cookie = req.headers.get("Cookie") || "";
      const parts = cookie.split(";").map((v) => v.trim());
      for (const part of parts) {
        if (part.startsWith(name + "=")) {
          return decodeURIComponent(part.slice(name.length + 1));
        }
      }
      return null;
    }

    function base64url(input) {
      return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
    }

    async function signJWT(payload, secret) {
      const enc = new TextEncoder()
        
      const header = {
        alg: "HS256",
        typ: "JWT"
      }
    
      const headerBase64 = base64url(enc.encode(JSON.stringify(header)))
      const payloadBase64 = base64url(enc.encode(JSON.stringify(payload)))
    
      const data = `${headerBase64}.${payloadBase64}`
    
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      )
    
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(data)
      )
    
      const signatureBase64 = base64url(signature)
    
      return `${data}.${signatureBase64}`
    }

    function buildSetCookie({ name = COOKIE_NAME, value, domain = COOKIE_DOMAIN, maxAge = DEFAULT_MAX_AGE }) {
      return [
        `${name}=${encodeURIComponent(value)}`,
        "Path=/",
        `Domain=${domain}`, // ✅ share across subdomains
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        `Max-Age=${maxAge}`,
      ].join("; ");
    }

    function buildClearCookie() {
      return [
        `${COOKIE_NAME}=`,
        "Path=/",
        `Domain=${COOKIE_DOMAIN}`,
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=0",
      ].join("; ");
    }

    // Prefer cookie, but temporarily allow Authorization header for migration
    function getTokenFromRequest(req) {
      const cookieToken = getCookie(req, COOKIE_NAME);
      if (cookieToken) return cookieToken;

      const auth = req.headers.get("Authorization");
      if (auth?.startsWith("Bearer ")) return auth.slice(7);

      return null;
    }

    function decodeAndValidateToken(token) {
      let payload;
      try {
        payload = parseJwtPayload(token);
      } catch {
        return { ok: false, error: "invalid_token", payload: null };
      }

      // optional exp check
      if (payload?.exp && payload.exp * 1000 < Date.now()) {
        return { ok: false, error: "expired", payload: null };
      }

      const email = extractEmail(payload);
      if (!email) return { ok: false, error: "missing_email", payload: null };

      return { ok: true, payload, email };
    }

    function rewriteLocationHeader(locationValue) {
      try {
        const u = new URL(locationValue);
        
        // ✅ SHOP
        if (u.hostname === ODOO_SHOP_HOST) {
          u.hostname = PUBLIC_SHOP_HOST;          // shop.snabbb.com
          u.protocol = "https:";
          return u.toString();
        }

        if (u.hostname.endsWith(".mrbur.shop")) {
          return u.toString(); // pass through as-is to the browser
        }
      
        // ✅ EVENT
        if (u.hostname === ODOO_EVENT_HOST) {
          u.hostname = PUBLIC_EVENT_HOST;         // event.snabbb.com
          u.protocol = "https:";
          return u.toString();
        }
        return u.toString();
      } catch {
        return locationValue;
      }
    }

    function rewriteSetCookieDomain(headers) {
      if (typeof headers.getSetCookie !== "function") return;
      const cookies = headers.getSetCookie();
      if (!cookies?.length) return;

      headers.delete("Set-Cookie");

      for (const c of cookies) {
        const updated = c
          .replace(/Domain=\.odoo\.com/gi, `Domain=${COOKIE_DOMAIN}`)
          .replace(
            new RegExp(`Domain=${ODOO_EVENT_HOST}`, "gi"),
            `Domain=${COOKIE_DOMAIN}`
          );
        headers.append("Set-Cookie", updated);
      }
    }

    async function getSupabaseUserByEmail(env, email) {
      const res = await fetch(
        `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        {
          headers: {
            "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      )
      
    
      const data = await res.json()
      console.log("user: ",JSON.stringify(data.users))
      const user = data?.users?.find(u => u.email === email) ?? null;
      console.log('the data email: ',JSON.stringify(user))
      return user;
    }

    // ==============================
    // ✅ SUPABASE JWT SIGNING (HS256)
    // ==============================
    
    // base64url from bytes (safe for unicode)
    function base64UrlEncodeBytes(bytes) {
      let binary = "";
      const len = bytes.length;
      for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    
    function base64UrlEncodeJson(obj) {
      const json = JSON.stringify(obj);
      const bytes = new TextEncoder().encode(json);
      return base64UrlEncodeBytes(bytes);
    }
    
    async function signHS256({ header, payload, secret }) {
      const enc = new TextEncoder();
    
      const encodedHeader = base64UrlEncodeJson(header);
      const encodedPayload = base64UrlEncodeJson(payload);
      const signingInput = `${encodedHeader}.${encodedPayload}`;
    
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
    
      const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
      const sig = base64UrlEncodeBytes(new Uint8Array(sigBuf));
    
      return `${signingInput}.${sig}`;
    }
    
    // Build Supabase-compatible JWT payload
    function buildSupabaseJwtPayload({ sub, email, expSeconds = 3600, extra = {} }) {
      const now = Math.floor(Date.now() / 1000);
      return {
        aud: "authenticated",
        role: "authenticated",
        sub: String(sub),
        email: String(email),
        iat: now,
        exp: now + expSeconds,
        ...extra,
      };
    }

    /* =======================================
      ⭐ SSO → SUPABASE JWT EXCHANGE
    ======================================= */
    async function handleSSO(request, env) {
      try {
      const token = getTokenFromRequest(request)
    
      if (!token) {
        return new Response(JSON.stringify({ ok:false, error:"missing_sso" }), {
          status: 401,
          headers: { "Content-Type":"application/json", ...corsHeaders, "Set-Cookie": buildClearCookie()},
          
        })
      }
    
      const decoded = decodeAndValidateToken(token)
      console.log('decoded: ',JSON.stringify(decoded))
    
      if (!decoded.ok) {
        return new Response(JSON.stringify({ ok:false, error:decoded.error }), {
          status: 401,
          headers: { "Content-Type":"application/json", ...corsHeaders }
        })
      }
    
      let sbUser = await getSupabaseUserByEmail(env, decoded.email)
      console.log('decoded.payload.name: ',decoded.payload.name)
      console.log('sbUser: ',sbUser)

      if(!sbUser) {
        const createRes = await fetch(
          `${env.SUPABASE_URL}/auth/v1/admin/users`,
          {
            method: "POST",
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: decoded.email,
              email_confirm: true,
              password: crypto.randomUUID() + crypto.randomUUID(), // random strong password
              user_metadata: {
                sso: "odoo",
                name: decoded.payload.name,
                odoo_sub: decoded.payload?.sub ?? null,
              },
            }),
          }
        );
      
        const created = await createRes.json().catch(() => null);
      
        if (!createRes.ok) {
          return new Response(JSON.stringify({
            ok: false,
            error: "supabase_create_failed",
            details: created
          }), { status: 500 });
        }
      
        sbUser = created?.user ?? created;
      }

      console.log('sb: ',sbUser,' email: ',decoded.email)

      if (!sbUser) {
        return new Response(JSON.stringify({
          ok: false,
          error: "User not found in Supabase"
        }), { status: 404 })
      }

      const now = Math.floor(Date.now()/1000)

      const payload = {
        aud: "authenticated",
        role: "authenticated",
        sub: sbUser.id,   // ✅ CORRECT UUID
        email: sbUser.email,
        iat: now,
        exp: now + 3600
      }
    
      const supabaseToken = await signHS256({
        header: { alg: "HS256", typ: "JWT" },
        payload,
        secret: env.SUPABASE_JWT_SECRET
      })
    
      return new Response(JSON.stringify({
        access_token: supabaseToken,
        refresh_token: supabaseToken,
        token_type: "bearer",
        expires_in: 3600
      }), {
        status: 200,
        headers: { "Content-Type":"application/json", ...corsHeaders }
      })
      } catch (err) {
        // This will reveal the real error
        console.error('handleSSO crashed:', err)
        return new Response(JSON.stringify({
          ok: false,
          error: "internal_error",
          message: err.message,
          stack: err.stack
        }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        })
      }
    }

    // ==============================
    // ✅ ODOO UI PROXY under your domain
    // https://app.snabbb.com/odoo/*  ->  https://mrbur.odoo.com/*
    // Goal: make Odoo session_id shared on Domain=.snabbb.com (NOT host-only)
    // ==============================
    if (url.pathname.startsWith("/odoo/")) {
      const UPSTREAM_ORIGIN = "https://mrbur.odoo.com";
      const COOKIE_NAME = "session_id";
    
      // Read cookies from browser
      const cookieHeader = request.headers.get("Cookie") || "";
      const cookies = Object.fromEntries(
        cookieHeader
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => {
            const i = v.indexOf("=");
            return i >= 0 ? [v.slice(0, i), v.slice(i + 1)] : [v, ""];
          })
      );
    
      const storedSession = cookies[COOKIE_NAME];
    
      // Map /odoo/* -> upstream /*
      const upstreamPath = url.pathname.replace("/odoo", ""); // keeps leading slash
      const upstreamUrl = new URL(UPSTREAM_ORIGIN + upstreamPath);
      upstreamUrl.search = url.search;
    
      // Build upstream headers (do NOT leak your domain cookies)
      const upstreamHeaders = new Headers(request.headers);
      upstreamHeaders.delete("Cookie");
    
      // Inject Odoo session if we already have it
      if (storedSession) {
        upstreamHeaders.set("Cookie", `session_id=${storedSession}`);
      }
    
      // Optional but helps some upstream setups
      upstreamHeaders.set("Host", new URL(UPSTREAM_ORIGIN).host);
    
      const upstreamRes = await fetch(upstreamUrl.toString(), {
        method: request.method,
        headers: upstreamHeaders,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });
    
      const resHeaders = new Headers(upstreamRes.headers);
    
      // Rewrite redirects back to our /odoo/*
      const loc = resHeaders.get("Location");
      if (loc) {
        try {
          const locUrl = new URL(loc, UPSTREAM_ORIGIN);
          if (locUrl.origin === UPSTREAM_ORIGIN) {
            resHeaders.set("Location", "/odoo" + locUrl.pathname + locUrl.search);
          }
        } catch {}
      }
    
      // ---- Capture upstream session_id from Set-Cookie (may be null) ----
      const setCookie = upstreamRes.headers.get("Set-Cookie");
      const m = setCookie?.match(/(?:^|;\s*)session_id=([^;]+)/i);
      const newSessionId = m?.[1];
    
      // IMPORTANT:
      // 1) Remove upstream Set-Cookie so the browser DOES NOT store host-only cookies for app.snabbb.com
      resHeaders.delete("Set-Cookie");   // correct case
      resHeaders.delete("set-cookie");   // extra safety
    
      // 2) If we got a session_id, RE-ISSUE it as a shared cookie on .snabbb.com
      if (newSessionId) {
        // Clear any host-only cookie previously set on app.snabbb.com (cleanup)
        resHeaders.append(
          "Set-Cookie",
          `session_id=${newSessionId}; Path=/; Domain=.snabbb.com; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
        );
      
        // Set shared cookie across all subdomains
        resHeaders.append("Set-Cookie", buildSharedOdooSessionCookie(newSessionId));
      }
    
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: resHeaders,
      });
    }

    /*=======================================
      ✅ SUPABASE JWT SIGNING
    =========================================*/
    if (url.pathname === "/api/sso/exchange" && request.method === "GET") {
      return handleSSO(request, env)
    }

    /* ==============================
      authenticate web session
    ================================= */
    if (url.pathname === "/api/web/session/authenticate") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }
    
      try {
        const body = await request.json();
      
        const login = body?.params?.login;
        const password = body?.params?.password;
      
        if (!login || !password) {
          return new Response(JSON.stringify({ ok: false, error: "Missing email or password" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      
        const ODOO_BASE = "https://mrbur.odoo.com";
        const DB = "aht-systemadmin-mrbur-main-20994444";
      
        // ✅ ODOO AUTH (fixed: prevent host-only session_id + re-issue Domain=.snabbb.com)
        const upstream = await fetch(`${ODOO_BASE}/web/session/authenticate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: { db: DB, login, password },
            id: body?.id ?? 1,
          }),
        });
        
        const data = await upstream.json().catch(() => null);

        if (!upstream.ok) {
          return new Response(
            JSON.stringify({ ok: false, error: "Upstream Odoo error", status: upstream.status, data }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        if (data?.error) {
          return new Response(
            JSON.stringify({ ok: false, error: data.error.message || "Odoo login failed", data }),
            { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        // ✅ Odoo success payload is in data.result
        const result = data?.result;

        // ✅ Read upstream cookie, extract session_id
        const upstreamSetCookie = upstream.headers.get("Set-Cookie");
        const newSessionId = parseSessionIdFromSetCookie(upstreamSetCookie);

        // ✅ Build response headers (DO NOT forward upstream Set-Cookie)
        const out = new Headers({
          "Content-Type": "application/json",
          ...corsHeaders,
        });

        // ✅ If we got a session_id, re-issue as shared cookie
        if (newSessionId) {
          // (optional cleanup) delete host-only cookie on gallery
          out.append(
            "Set-Cookie",
            `session_id=; Path=/; Domain=app.snabbb.com; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
          );
        
          // ✅ re-issue as shared cookie for ALL subdomains
          out.append("Set-Cookie", buildSharedOdooSessionCookie(newSessionId));
        }

        // ✅ Return response (no upstream Set-Cookie leakage)
        return new Response(
          JSON.stringify({
            ok: true,
            sessionInfo: {
              name: result?.name ?? result?.partner_display_name ?? "",
              email: result?.username ?? login,
              uid: result?.uid ?? null,
              partner_id: result?.partner_id ?? null,
              db: result?.db ?? DB,
            },
            data,
          }),
          {
            status: 200,
            headers: out,
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err?.message || "Odoo login failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    /* =========================================================
       ✅ ODOO DEV REVERSE PROXY
       /api/web/*  →  https://mrbur-staging-bur-26090883.dev.odoo.com/web/*
       - forwards browser cookies (session_id)
       - avoids CORS pain by keeping same-origin
    ========================================================= */
    if (url.pathname.startsWith("/api/web/")) {
      const odooPath = url.pathname.replace("/api", ""); // "/web/..."
      const targetUrl = new URL(ODOO_DEV_BASE + odooPath);
      targetUrl.search = url.search;
        
      // Copy incoming headers, but remove/override risky ones
      const upstreamHeaders = new Headers(request.headers);
      upstreamHeaders.delete("Origin");
      upstreamHeaders.delete("Referer");
      upstreamHeaders.delete("X-SSO-API-KEY");
      upstreamHeaders.delete("X-Requested-With");
        
      // Ensure Host is correct (optional, but can help)
      upstreamHeaders.set("Host", ODOO_DEV_HOST);
        
      // For GET/HEAD: do NOT send Content-Type
      const method = request.method.toUpperCase();
      if (method === "GET" || method === "HEAD") {
        upstreamHeaders.delete("Content-Type");
      }
    
      // Timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s
    
      let upstreamRes;
      try {
        upstreamRes = await fetch(targetUrl.toString(), {
          method,
          headers: upstreamHeaders,
          body: method === "GET" || method === "HEAD" ? null : request.body, // ✅ stream
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timeout);
        return new Response(JSON.stringify({ ok: false, error: "odoo_upstream_timeout_or_network", details: String(e) }), {
          status: 504,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } finally {
        clearTimeout(timeout);
      }
    
      const outHeaders = new Headers(upstreamRes.headers);
      // If upstream forgot content-type, set a safe default (don't force JSON always)
      if (!outHeaders.get("Content-Type")) {
        outHeaders.set("Content-Type", "text/plain");
      }

      // Add API CORS headers
      for (const [k, v] of Object.entries(corsHeaders)) outHeaders.set(k, v);

      // ✅ Rewrite session_id cookie domain to .snabbb.com
      const upstreamSetCookie = upstreamRes.headers.get("Set-Cookie");
      if (upstreamSetCookie) {
        const sessionIdMatch = upstreamSetCookie.match(/session_id=([^;]+)/i);
        if (sessionIdMatch) {
          const sessionId = sessionIdMatch[1];
          // Remove original Set-Cookie
          outHeaders.delete("Set-Cookie");
          // Re-issue with .snabbb.com domain
          outHeaders.set(
            "Set-Cookie",
            `session_id=${sessionId}; Path=/; Domain=.snabbb.com; HttpOnly; Secure; SameSite=Lax; Max-Age=21600`
          );
        }
      }
    
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: outHeaders,
      });
    }

    // ==============================
    // ✅ API: POST /api/logout (clear cookie)
    // ==============================
    if (url.pathname === "/api/logout" && request.method === "POST") {
      try {
        await fetch(`${ODOO_DEV_BASE}/web/session/destroy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            // forward browser cookies (session_id)
            Cookie: request.headers.get("Cookie") || "",
          },
          body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: 1 }),
        });
      } catch (e) {
        // ignore - we still clear our cookie below
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildClearCookie(),
          ...corsHeaders,
        },
      });
    }

    /* ==============================
       ✅ API: POST /api/register
       - creates user in Odoo AND Supabase
       - accepts payload like:
         {
           email, password,
           options: { data: { name, phone, position, account_type, company_name } }
         }
    ============================== */
    if (url.pathname === "/api/inventory/register") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }
    
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    
      // ✅ Normalize payload (your current shape)
      const payload = body?.data ?? body?.options?.data ?? body ?? {};
    
      const email = body?.email ?? payload?.email ?? payload?.login;
      const password = body?.password ?? payload?.password;
      const name = payload?.name ?? body?.name;
    
      const phone = payload?.phone ?? body?.phone;
      const accountType = payload?.account_type ?? payload?.accountType;
      const companyName = payload?.company_name ?? payload?.companyName;
    
      // you use "position" in frontend
      const jobPosition = payload?.position ?? payload?.jobPosition ?? payload?.job_position;
    
      if (!email || !name || !password) {
        return new Response(JSON.stringify({ ok: false, error: "email, name, and password are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    
      // ✅ Guards
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    
      const adminHeaders = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
    
      // Small helper to parse upstream json
      async function safeJson(res) {
        const text = await res.text();
        try { return { json: JSON.parse(text), text }; } catch { return { json: null, text }; }
      }
    
      try {
        // =====================================================
        // 1) ✅ Create user in ODOO (source of truth)
        // =====================================================
        const odooRequestData = {
          jsonrpc: "2.0",
          method: "call",
          params: {
            email,
            name,
            password,
            company_id: 2,
            ...(phone ? { phone } : {}),
            ...(jobPosition ? { job_position: jobPosition } : {}),
            ...(accountType ? { account_type: accountType } : {}),
            ...(companyName ? { company_name: companyName } : {}),
          },
          id: 1,
        };
      
        const odooRes = await fetch("https://mrbur.odoo.com/api/v1/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-SSO-API-KEY": env.ODOO_SSO_API_KEY,
          },
          body: JSON.stringify(odooRequestData),
        });
      
        const { json: odooJson, text: odooText } = await safeJson(odooRes);
      
        // Odoo can respond ok:200 but with result.ok=false
        if (!odooRes.ok || odooJson?.error || odooJson?.result?.ok === false) {
          const errMsg =
            odooJson?.error?.message ||
            odooJson?.result?.error ||
            `Odoo create user failed (HTTP ${odooRes.status})`;
        
          // if Odoo says user already exists, we still proceed to create Supabase user
          const maybeExists = String(errMsg).toLowerCase().includes("exist");
          if (!maybeExists) {
            return new Response(
              JSON.stringify({ ok: false, error: errMsg, details: odooJson || odooText }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        }
      
        // Try extract Odoo user id if your endpoint returns it
        const odooUserId = odooJson?.result?.user_id ?? odooJson?.result?.id ?? null;
      
        // =====================================================
        // 2) ✅ Ensure user exists in SUPABASE Auth (admin)
        // =====================================================
        // First attempt: create user
        const sbCreateRes = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`, {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({
            email,
            password,         // ⚠️ if you want SSO-only, replace with random password
            email_confirm: true,
            user_metadata: {
              name,
              phone: phone || null,
              account_type: accountType || null,
              position: jobPosition || null,
              company_name: companyName || null,
              odoo_user_id: odooUserId,
              sso: "odoo",
            },
          }),
        });
      
        const { json: sbJson, text: sbText } = await safeJson(sbCreateRes);
      
        // If already exists, lookup user id (fallback listing)
        let supabaseUserId = sbJson?.id || sbJson?.user?.id || null;
      
        if (!sbCreateRes.ok) {
          const msg = (sbJson?.message || sbJson?.error_description || sbJson?.error || sbText || "").toString();
          const alreadyExists =
            msg.toLowerCase().includes("already") ||
            msg.toLowerCase().includes("exists") ||
            msg.toLowerCase().includes("registered") ||
            msg.toLowerCase().includes("duplicate");
        
          if (!alreadyExists) {
            return new Response(
              JSON.stringify({ ok: false, error: "Supabase create user failed", details: sbJson || sbText }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        
          // Lookup user by scanning admin list pages (same technique you use elsewhere)
          let page = 1;
          while (page <= 5 && !supabaseUserId) {
            const listRes = await fetch(
              `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users?page=${page}&per_page=200`,
              { headers: adminHeaders }
            );
          
            const { json: listJson } = await safeJson(listRes);
            const users = Array.isArray(listJson) ? listJson : (listJson?.users || []);
            const match = users?.find((u) => (u?.email || "").toLowerCase() === email.toLowerCase());
            if (match?.id) supabaseUserId = match.id;
            page++;
          }
        
          if (!supabaseUserId) {
            return new Response(
              JSON.stringify({ ok: false, error: "Supabase user exists but lookup failed", details: sbJson || sbText }),
              { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        
          // Optional: update metadata on existing user
          await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${supabaseUserId}`, {
            method: "PUT",
            headers: adminHeaders,
            body: JSON.stringify({
              user_metadata: {
                name,
                phone: phone || null,
                account_type: accountType || null,
                position: jobPosition || null,
                company_name: companyName || null,
                odoo_user_id: odooUserId,
                sso: "odoo",
              },
            }),
          }).catch(() => {});
        }
      
        return new Response(
          JSON.stringify({
            ok: true,
            odoo: { user_id: odooUserId, raw: odooJson?.result ?? odooJson ?? null },
            supabase: { user_id: supabaseUserId },
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e?.message || "register_failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }
    



    /* ==============================
       ✅ API: POST /api/inventory/sign-up
       - forwards JSON-RPC payload to Odoo /api/v1/users
       - same as authOdoo() in frontend
    ============================== */
    if (url.pathname === "/api/inventory/sign-up") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }
    
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    
      // Accept either direct fields or already-built JSON-RPC body
      const payload = body?.data ?? body?.options?.data ?? body?.params ?? body ?? {};

      const email = body?.email ?? payload?.email ?? payload?.login;
      const name = payload?.name ?? body?.name; // keep fallback if you sometimes send body.name
      const password = payload?.password ?? body?.password;
      const phone = payload?.phone ?? body?.phone;
          
      // your field is "position", but your Worker expects jobPosition/job_position
      const jobPosition = payload?.position ?? payload?.jobPosition ?? body?.jobPosition ?? payload?.job_position;
          
      if (!email || !name) {
        return new Response(JSON.stringify({ ok: false, error: "email and name are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const requestData = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          email,
          name,
          ...(password ? { password } : {}),
          company_id: 2,
          ...(jobPosition ? { job_position: jobPosition } : {}),
          ...(phone ? { phone } : {}),
        },
        id: 1,
      };
    
      try {
        const upstreamUrl = "https://mrbur.odoo.com/api/v1/users"; // your real target
      
        const upstreamRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-SSO-API-KEY": env.ODOO_SSO_API_KEY, // keep if Odoo requires it
          },
          body: JSON.stringify(requestData),
        });
      
        const text = await upstreamRes.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      
        // Mirror your frontend: if response.data.error -> throw
        if (data?.error) {
          return new Response(
            JSON.stringify({ ok: false, error: data.error?.message || "Odoo error", details: data.error }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      
        if (!upstreamRes.ok) {
          return new Response(
            JSON.stringify({ ok: false, error: "Upstream Odoo error", status: upstreamRes.status, data }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      
        return new Response(JSON.stringify({ ok: true, data }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err?.message || "Odoo login failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

     /* ==============================
          ✅ APPOINTMENT SIGNUP
        ============================== */
        if (url.pathname === "/api/appointment/sign-up") {
            if (request.method !== "POST") {
                return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
            }

            let body;
            try {
                body = await request.json();
            } catch {
                return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            // Accept either direct fields or already-built JSON-RPC body
            const payload = body?.data ?? body?.options?.data ?? body?.params ?? body ?? {};

            const email = body?.email ?? payload?.email ?? payload?.login;
            const name = payload?.name ?? body?.name; // keep fallback if you sometimes send body.name
            const password = payload?.password ?? body?.password;
            const phone = payload?.phone ?? body?.phone;

            if (!email || !name) {
                return new Response(JSON.stringify({ ok: false, error: "email and name are required" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            // Map fields for the Appointment App (use realistic company_id if needed)
            const requestData = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    email,
                    name,
                    ...(password ? { password } : {}),
                    company_id: 2, // Make sure this is correct for appointments
                    ...(phone ? { phone } : {}),
                },
                id: 1,
            };

            try {
                const upstreamUrl = "https://mrbur.odoo.com/api/v1/users";

                const upstreamRes = await fetch(upstreamUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        "X-SSO-API-KEY": env.ODOO_SSO_API_KEY,
                    },
                    body: JSON.stringify(requestData),
                });

                const text = await upstreamRes.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { raw: text };
                }

                if (data?.error) {
                    return new Response(
                        JSON.stringify({ ok: false, error: data.error?.message || "Odoo error", details: data.error }),
                        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
                    );
                }

                if (!upstreamRes.ok) {
                    return new Response(
                        JSON.stringify({ ok: false, error: "Upstream Odoo error", status: upstreamRes.status, data }),
                        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
                    );
                }

                return new Response(JSON.stringify({ ok: true, data }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (err) {
                return new Response(JSON.stringify({ ok: false, error: err?.message || "Odoo login failed" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

    /* ==============================
          ✅ IMAGEAI SIGNUP
        ============================== */
    if (url.pathname === "/api/imageai/sign-up") {
      const imageAiCorsHeaders = {
        ...corsHeaders,
        "Access-Control-Allow-Origin": allowedOrigins.has(origin)
          ? origin
          : "https://imageai.snabbb.com",
      };

      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: imageAiCorsHeaders });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...imageAiCorsHeaders },
        });
      }

      const payload = body?.data ?? body?.options?.data ?? body?.params ?? body ?? {};

      const email = body?.email ?? payload?.email ?? payload?.login;
      const name = payload?.name ?? body?.name;
      const password = payload?.password ?? body?.password;
      const phone = payload?.phone ?? body?.phone;
      const company_name = payload?.company_name ?? payload?.companyName ?? body?.company_name;
      const company_id = payload?.company_id ?? body?.company_id ?? 2;
      const jobPosition =
        payload?.position ??
        payload?.jobPosition ??
        body?.jobPosition ??
        payload?.job_position;

      if (!email || !name) {
        return new Response(JSON.stringify({ ok: false, error: "email and name are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...imageAiCorsHeaders },
        });
      }

      const requestData = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          email,
          name,
          ...(password ? { password } : {}),
          ...(phone ? { phone } : {}),
          ...(jobPosition ? { job_position: jobPosition } : {}),
          ...(company_name ? { company_name } : {}),
          ...(company_id ? { company_id } : {}),
        },
        id: body?.id ?? 1,
      };

      try {
        const upstreamUrl = "https://mrbur.odoo.com/api/v1/users";

        const upstreamRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-SSO-API-KEY": env.ODOO_SSO_API_KEY,
          },
          body: JSON.stringify(requestData),
        });

        const text = await upstreamRes.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }

        if (data?.error) {
          const errMsg = data.error.data?.message || data.error.message || "Odoo error";
          return new Response(
            JSON.stringify({ ok: false, error: errMsg, details: data.error }),
            { status: 400, headers: { "Content-Type": "application/json", ...imageAiCorsHeaders } }
          );
        }

        if (!upstreamRes.ok) {
          return new Response(
            JSON.stringify({ ok: false, error: "Upstream Odoo error", status: upstreamRes.status, data }),
            { status: 502, headers: { "Content-Type": "application/json", ...imageAiCorsHeaders } }
          );
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...imageAiCorsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err?.message || "Odoo sign-up failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...imageAiCorsHeaders },
        });
      }
    }    

    /* ==============================
          ✅ HIRING SIGNUP
        ============================== */
    if (url.pathname === "/api/hiring/sign-up") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Accept either direct fields or already-built JSON-RPC body
      const payload = body?.data ?? body?.options?.data ?? body?.params ?? body ?? {};

      const email = body?.email ?? payload?.email ?? payload?.login;
      const name = payload?.name ?? body?.name;
      const password = payload?.password ?? body?.password;
      const phone = payload?.phone ?? body?.phone;
      const company_name = payload?.company_name ?? body?.company_name;
      const company_id = payload?.company_id ?? body?.company_id;

      if (!email || !name) {
        return new Response(JSON.stringify({ ok: false, error: "email and name are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Map fields for the Hiring App
      const requestData = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          email,
          name,
          ...(password ? { password } : {}),
          ...(phone ? { phone } : {}),
          ...(company_name ? { company_name } : {}),
          ...(company_id ? { company_id } : {}),
        },
        id: body?.id ?? 1,
      };

      try {
        const upstreamUrl = "https://mrbur.odoo.com/api/v1/users";

        const upstreamRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-SSO-API-KEY": env.ODOO_SSO_API_KEY,
          },
          body: JSON.stringify(requestData),
        });

        const text = await upstreamRes.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }

        if (data?.error) {
          const errMsg = data.error.data?.message || data.error.message || "Odoo error";
          return new Response(
            JSON.stringify({ ok: false, error: errMsg, details: data.error }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        if (!upstreamRes.ok) {
          return new Response(
            JSON.stringify({ ok: false, error: "Upstream Odoo error", status: upstreamRes.status, data }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        return new Response(JSON.stringify({ ok: true, data }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err?.message || "Odoo sign-up failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // ==============================
    // ✅ API: GET /api/me (check login quick)
    // ==============================
    if (url.pathname === "/api/me" && request.method === "GET") {
      const token = getTokenFromRequest(request);
      if (!token) {
        return new Response(JSON.stringify({ loggedIn: false, user: null }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const decoded = decodeAndValidateToken(token);
      if (!decoded.ok) {
        return new Response(JSON.stringify({ loggedIn: false, user: null }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            // optional: clear cookie if expired/invalid
            ...(decoded.error === "expired" || decoded.error === "invalid_token"
              ? { "Set-Cookie": buildClearCookie() }
              : {}),
            ...corsHeaders,
          },
        });
      }

      // You can return minimal identity info
      return new Response(
        JSON.stringify({
          loggedIn: true,
          user: { email: decoded.email, aud: decoded.payload?.aud || null },
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

  // ==============================
  // ✅ API: GET /api/supabase-session
  // - reads mrbur_sso cookie (HttpOnly)
  // - ensures a Supabase Auth user exists
  // - rotates password (no storage needed)
  // - uses password grant to mint access/refresh tokens
  // ==============================
    if (url.pathname === "/api/supabase-session" && request.method === "GET") {
      const debug = (step, extra = {}) =>
    console.log(JSON.stringify({ tag: "supabase-session", step, ...extra }));

    const readJson = async (res) => {
      const txt = await res.text();
      try { return { json: JSON.parse(txt), text: txt }; }
      catch { return { json: null, text: txt }; }
    };

    debug("keys_check", {
      hasUrl: !!env.SUPABASE_URL,
      anonKeyPrefix: (env.SUPABASE_ANON_KEY || "").slice(0, 14),
      serviceKeyPrefix: (env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 9),
    });


    const token = getTokenFromRequest(request); // reads mrbur_sso cookie
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "missing_sso_cookie" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  
    const decoded = decodeAndValidateToken(token);
    if (!decoded.ok) {
      return new Response(JSON.stringify({ ok: false, error: decoded.error }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
          ...corsHeaders,
        },
      });
    }
    
    const email = decoded.email;
    const newPassword = crypto.randomUUID() + crypto.randomUUID();
    console.log("[supabase-session] keys check", {
      hasUrl: !!env.SUPABASE_URL,
      anonKeyPrefix: (env.SUPABASE_ANON_KEY || "").slice(0, 14),
      serviceKeyPrefix: (env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 10),
    });
  
    try {
      const adminHeaders = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
    
      // ---- 1) Find user (best-effort) ----
      let userId = null;
    
      // Try the email filter (may or may not work)
      try {
        const findUrl = `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
        const findRes = await fetch(findUrl, { headers: adminHeaders });
        if (findRes.ok) {
          const found = await findRes.json().catch(() => null);
          const users = Array.isArray(found) ? found : (found?.users || []);
          userId = users?.[0]?.id || null;
        }
      } catch (_) {}
    
      // ---- 2) Create user if missing ----
      if (!userId) {
        const createRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({
            email,
            password: newPassword,
            email_confirm: true,
            user_metadata: {
              sso: "odoo",
              odoo_sub: decoded.payload?.sub ?? null,
            },
          }),
        });
      
        const created = await createRes.json().catch(() => null);
      
        if (!createRes.ok) {
          // If user already exists, Supabase can return 400 in some setups
          // Fall back to listing users and finding by email
          const msg = JSON.stringify(created || {});
          const alreadyExists =
            msg.includes("already") ||
            msg.includes("exists") ||
            msg.includes("User already registered") ||
            msg.includes("email");
        
          if (!alreadyExists) {
            return new Response(
              JSON.stringify({ ok: false, error: "create_user_failed", details: created }),
              { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        
          // fallback list + search (pagination)
          let page = 1;
          while (page <= 5 && !userId) {
            const listRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
              headers: adminHeaders,
            });
            const list = await listRes.json().catch(() => null);
            const users = Array.isArray(list) ? list : (list?.users || []);
            const match = users?.find((u) => (u?.email || "").toLowerCase() === email.toLowerCase());
            if (match?.id) userId = match.id;
            page++;
          }
        
          if (!userId) {
            return new Response(
              JSON.stringify({ ok: false, error: "user_lookup_failed_after_exists", details: created }),
              { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        } else {
          userId = created?.id || created?.user?.id || null;
          if (!userId) {
            return new Response(
              JSON.stringify({ ok: false, error: "create_user_missing_id", details: created }),
              { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        }
      }
    
      // ---- 3) Rotate password (PUT update) ----
      const updRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          password: newPassword,
          email_confirm: true,
        }),
      });
    
      if (!updRes.ok) {
        const upd = await updRes.json().catch(() => null);
        return new Response(
          JSON.stringify({ ok: false, error: "update_user_failed", details: upd }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    
      // ---- 4) Password grant to mint real session ----
      let tokenRes;
      let rawText = null;
      let session = null;

      try {
        const supaJwt = await signHS256({
          header: { alg: "HS256", typ: "JWT" },
          payload: buildSupabaseJwtPayload({
            sub: userId || decoded.payload?.sub || email,
            email,
            expSeconds: 3600,
            extra: { user_id: userId, provider: "odoo_sso" },
          }),
          secret: env.SUPABASE_JWT_SECRET,
        });

        return new Response(JSON.stringify({ ok: true, access_token: supaJwt, token_type: "bearer", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders },
        });
      } catch (networkError) {
        console.log("[supabase] token_fetch_network_error", networkError);
        return new Response(
          JSON.stringify({ ok: false, error: "network_error", details: networkError?.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Read raw response first
      try {
        rawText = await tokenRes.text();
      } catch (e) {
        rawText = null;
      }

      // Try parse JSON
      try {
        session = rawText ? JSON.parse(rawText) : null;
      } catch {
        session = null;
      }

      console.log("[supabase] token_exchange_result", {
        status: tokenRes.status,
        ok: tokenRes.ok,
        raw: rawText?.slice(0, 300), // safe truncate
      });

      if (!tokenRes.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "token_exchange_failed",
            status: tokenRes.status,
            details: session || rawText,
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    
      return new Response(
        JSON.stringify({
          ok: true,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...corsHeaders,
          },
        }
      );
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e?.message || "unknown_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

    /* ==============================
       SSO: Get app launch link (proxy to Odoo)
       POST /api/v1/sso/app_link
    ================================= */
    if (url.pathname === "/api/v1/sso/app_link") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }

      const sessionId = getCookie(request, "session_id")
    
      try {
        const bodyText = await request.text(); // keep raw JSON
        const upstreamUrl = "https://mrbur.odoo.com/api/v1/sso/app_link";
        const upstreamRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-SSO-API-KEY": env.ODOO_SSO_API_KEY, // forward to Odoo
          },
          body: bodyText,
        });
        
        const upstreamText = await upstreamRes.text();
        // Rewrite Odoo's hardcoded SSO domain to your app domain
        const rewrittenText = upstreamText.replace(
          /https:\/\/sso\.mrburstudio\.com/g,
          "https://sso.snabbb.com"  // or whatever your target domain is
        );

        const resHeaders = new Headers(corsHeaders);
        resHeaders.set(
          "Content-Type",
          upstreamRes.headers.get("Content-Type") || "application/json"
        );

        // ===== Set session_id cookie in response =====
        if (sessionId) {
          resHeaders.append(
            "Set-Cookie",
            buildSetCookie({
              name: "session_id",
              value: sessionId,
              domain: '.snabbb.com'
            })
          );
        }
      
        // pass-through response (recommended)
        return new Response(rewrittenText, {
          status: upstreamRes.status,
          headers: {
            "Content-Type": upstreamRes.headers.get("Content-Type") || "application/json",
            ...resHeaders
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err?.message || "SSO app_link failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    


    /* ==============================
      Create user in Odoo
    =================================*/
    // ✅ API: POST /api/v1/users -> forward to Odoo sandbox
    if (url.pathname === "/api/v1/users") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }
    
      const upstreamUrl = "https://mrbur.odoo.com/api/v1/users";
    
      const upstreamRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SSO-API-KEY": env.ODOO_SSO_API_KEY,
        },
        body: await request.text(),
      });
    
      return new Response(await upstreamRes.text(), {
        status: upstreamRes.status,
        headers: {
          "Content-Type": upstreamRes.headers.get("Content-Type") || "application/json",
          ...corsHeaders,
        },
      });
    }

    if (url.pathname === "/api/debug/country") {
  return new Response(JSON.stringify({
    country: request.headers.get("CF-IPCountry"),
    ip: request.headers.get("CF-Connecting-IP"),
  }), {
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

/* =========================================================
   🏠 HOME REVERSE PROXY
   app.snabbb.com/home → my.mrbur.shop
========================================================= */

const isHomeRequest =
  url.hostname === "app.snabbb.com" &&
  (url.pathname === "/home" || url.pathname.startsWith("/home/"));

if (isHomeRequest && !isApi) {
  const upstreamUrl = new URL(request.url);
  upstreamUrl.hostname = "my.mrbur.shop";
  upstreamUrl.protocol = "https:";
  upstreamUrl.pathname = url.pathname.replace(/^\/home/, "") || "/";

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("Host", "my.mrbur.shop");

  const upstreamReq = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers: reqHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
    redirect: "manual",
  });

  const upstreamRes = await fetch(upstreamReq);
  const contentType = upstreamRes.headers.get("content-type") || "";

  const outHeaders = new Headers();
  for (const [key, value] of upstreamRes.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") continue;
    outHeaders.append(key, value);
  }

  if (contentType.includes("text/html")) {
    let html = await upstreamRes.text();

    // Make relative URLs resolve against the upstream site
    if (html.includes("<head>")) {
      html = html.replace(
        "<head>",
        `<head><base href="https://app.snabbb.com/">`
      );
    }

    // Optional but safer: rewrite common root-relative URLs
    html = html
  .replace(/src="\/(?!\/)/g, 'src="https://app.snabbb.com/')
  .replace(/action="\/(?!\/)/g, 'action="https://app.snabbb.com/');

    const script = `
<script>
document.addEventListener('DOMContentLoaded', function() {
  const homeTarget = 'https://app.snabbb.com/home';

  // logo
  const navbarBrand = document.querySelector('a.navbar-brand');
  if (navbarBrand) {
    navbarBrand.setAttribute('href', homeTarget);
    navbarBrand.onclick = function(e) {
      e.preventDefault();
      window.location.href = homeTarget;
    };
  }

  // home menu links
  const allMenuLinks = Array.from(document.querySelectorAll('#top_menu a, a.nav-link, header a'));

  allMenuLinks.forEach(link => {
    const href = (link.getAttribute('href') || '').trim();
    const text = (link.textContent || '').trim().toLowerCase();

    if (href === '/' || href === '/home' || text === 'home') {
      link.setAttribute('href', homeTarget);
      link.onclick = function(e) {
        e.preventDefault();
        window.location.href = homeTarget;
      };
    }
  });
});
</script>`;

    html = html.replace("</body>", script + "</body>");

    return new Response(html, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}

/* =========================================================
   🌐 EVENT REVERSE PROXY
   app.snabbb.com/event → mrbur.odoo.com/event
========================================================= */

const isEventRequest =
  url.hostname === "event.snabbb.com" ||
  (url.hostname === "app.snabbb.com" && url.pathname.startsWith("/event"));

if (isEventRequest && !isApi) {

  const upstreamUrl = new URL(request.url);

  upstreamUrl.protocol = "https:";
  upstreamUrl.hostname = ODOO_EVENT_HOST; // mrbur.odoo.com

  const reqHeaders = new Headers(request.headers);

  reqHeaders.set("Host", ODOO_EVENT_HOST);
  reqHeaders.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
  reqHeaders.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");

  const incomingCookie = request.headers.get("Cookie") || "";
  if (incomingCookie) {
    reqHeaders.set("Cookie", incomingCookie);
  }

  const upstreamReq = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers: reqHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
    redirect: "manual",
  });

  const upstreamRes = await fetch(upstreamReq);

  const outHeaders = copyResponseHeadersWithoutSetCookie(upstreamRes);

  appendRewrittenCookies(outHeaders, upstreamRes, ".snabbb.com");

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}

    /* =========================================================
   🌐 SHOP REVERSE PROXY
   app.snabbb.com/shop* OR shop.snabbb.com/* → country shop
========================================================= */
const isShopRequest =
  (url.hostname === "app.snabbb.com" &&
    (
      url.pathname.startsWith("/shop") ||
      url.pathname.startsWith("/website_sale") ||
      url.pathname.startsWith("/web/") ||
      url.pathname.startsWith("/website/") ||
      url.pathname.startsWith("/products") ||
      url.pathname.startsWith("/product") ||
      url.pathname.startsWith("/home") ||
      url.pathname.startsWith("/payment/") ||
      url.pathname.startsWith("/category_grid/") ||
      url.pathname.startsWith("/banner") ||
      url.pathname.startsWith("/web/image") ||
      url.pathname.startsWith("/web/content") ||
      url.pathname.startsWith("/web/assets") ||
      url.pathname.startsWith("/my/home") ||
      url.pathname.startsWith("/im_livechat") ||
      url.pathname.startsWith("/my/counters") ||
      url.pathname.startsWith("/loyalty") ||
      url.pathname.startsWith("/user_inventory") ||
      url.pathname.startsWith("/sale") ||
      url.pathname.startsWith("/portal") ||
      url.pathname.startsWith("/my") ||
      url.pathname.startsWith("/account") ||
      url.pathname.startsWith("/shop/cart")

    )) ||
  (url.hostname === "shop.snabbb.com");

if (isShopRequest && !isApi && !url.pathname.startsWith("/sso/")) {
  const country = request.headers.get("CF-IPCountry") || "";
  const countryRedirects = {
    TH: "https://th.mrbur.shop",
    ID: "https://id.mrbur.shop",
    MY: "https://my.mrbur.shop",
    US: "https://us.mrbur.shop",
    UK: "https://uk.mrbur.shop",
    AU: "https://au.mrbur.shop",
    SG: "https://sg.mrbur.shop",
    AE: "https://ae.mrbur.shop",
    VN: "https://vn.mrbur.shop",
    PH: "https://ph.mrbur.shop",
    KR: "https://kr.mrbur.shop",
    CA: "https://ca.mrbur.shop",
    SA: "https://sa.mrbur.shop",
    NZ: "https://nz.mrbur.shop",
    BE: "https://eu.mrbur.shop",
    BG: "https://eu.mrbur.shop",
    CZ: "https://eu.mrbur.shop",
    DK: "https://eu.mrbur.shop",
    DE: "https://eu.mrbur.shop",
    EE: "https://eu.mrbur.shop",
    IE: "https://eu.mrbur.shop",
    EL: "https://eu.mrbur.shop",
    ES: "https://eu.mrbur.shop",
    FR: "https://eu.mrbur.shop",
    HR: "https://eu.mrbur.shop",
    IT: "https://eu.mrbur.shop",
    CY: "https://eu.mrbur.shop",
    LV: "https://eu.mrbur.shop",
    LT: "https://eu.mrbur.shop",
    LU: "https://eu.mrbur.shop",
    HU: "https://eu.mrbur.shop",
    MT: "https://eu.mrbur.shop",
    NL: "https://eu.mrbur.shop",
    AT: "https://eu.mrbur.shop",
    PL: "https://eu.mrbur.shop",
    PT: "https://eu.mrbur.shop",
    RO: "https://eu.mrbur.shop",
    SI: "https://eu.mrbur.shop",
    SK: "https://eu.mrbur.shop",
    FI: "https://eu.mrbur.shop",
    SE: "https://eu.mrbur.shop",
    IS: "https://eu.mrbur.shop",
    NO: "https://eu.mrbur.shop",
    LI: "https://eu.mrbur.shop",
    CH: "https://eu.mrbur.shop",
    BA: "https://eu.mrbur.shop",
    ME: "https://eu.mrbur.shop",
    MD: "https://eu.mrbur.shop",
    MK: "https://eu.mrbur.shop",
    GE: "https://eu.mrbur.shop",
    AL: "https://eu.mrbur.shop",
    RS: "https://eu.mrbur.shop",
    TR: "https://eu.mrbur.shop",
    UA: "https://eu.mrbur.shop",
  };

  const targetOrigin = countryRedirects[country] || `https://${ODOO_SHOP_HOST}`;
  const targetUrl = new URL(request.url);

  targetUrl.protocol = "https:";
  targetUrl.hostname = new URL(targetOrigin).hostname;

  if (url.hostname === "shop.snabbb.com" && (targetUrl.pathname === "/" || targetUrl.pathname === "")) {
    targetUrl.pathname = "/shop";
  }

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("Host", targetUrl.hostname);
  reqHeaders.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
  reqHeaders.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");
  reqHeaders.delete("Origin");
  reqHeaders.delete("Referer");

  // Forward all browser cookies upstream so cart/session works
  const incomingCookie = request.headers.get("Cookie") || "";
  if (incomingCookie) {
    reqHeaders.set("Cookie", incomingCookie);
  } else {
    reqHeaders.delete("Cookie");
  }

  const upstreamReq = new Request(targetUrl.toString(), {
    method: request.method,
    headers: reqHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
    redirect: "manual",
  });

  const upstreamRes = await fetch(upstreamReq, {
    cf: {
      cacheTtl: 300,
      cacheEverything: false,
    },
  });

  const contentType = upstreamRes.headers.get("Content-Type") || "";
  const outHeaders = copyResponseHeadersWithoutSetCookie(upstreamRes);

  const loc = outHeaders.get("Location");
  if (loc) {
    outHeaders.set("Location", rewriteLocationHeader(loc));
  }

  // Reissue cookies for app.snabbb.com/shop flow
  appendRewrittenCookies(outHeaders, upstreamRes, ".snabbb.com");

  if (contentType.includes("text/html")) {
  let html = await upstreamRes.text();

  const script = `
<script>
document.addEventListener('DOMContentLoaded', function() {
  const homeTarget = 'https://app.snabbb.com/home';

  // logo
  const logoLink = document.querySelector('#top_menu a[role="menuitem"][href="/home"]')
  if (logoLink) {
    logoLink.setAttribute('href', homeTarget);
    logoLink.onclick = function(e) {
      e.preventDefault();
      window.location.href = homeTarget;
    };
  }

  // home menu links
  const allMenuLinks = Array.from(document.querySelectorAll('#top_menu a, a.nav-link, header a'));

  allMenuLinks.forEach(link => {
    const href = (link.getAttribute('href') || '').trim();
    const text = (link.textContent || '').trim().toLowerCase();

    if (href === '/' || href === '/home' || text === 'home') {
      link.setAttribute('href', homeTarget);
      link.onclick = function(e) {
        e.preventDefault();
        window.location.href = homeTarget;
      };
    }
  });
});
</script>`;

  html = html.replace("</body>", script + "</body>");

  return new Response(html, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}



  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}

    /* =========================================================
       🌐 EVENT REVERSE PROXY
       event.snabbb.com → mrbur.odoo.com/event
    ========================================================= */

    const isEventHost = url.hostname === PUBLIC_EVENT_HOST;

    if (isEventHost && !isApi && !url.pathname.startsWith("/sso/")) {
      const upstreamUrl = new URL(request.url);

      upstreamUrl.hostname = ODOO_EVENT_HOST;

      if (upstreamUrl.pathname === "/" || upstreamUrl.pathname === "") {
        upstreamUrl.pathname = ODOO_EVENT_BASE;
      }

      const reqHeaders = new Headers(request.headers);
      reqHeaders.set("Host", ODOO_EVENT_HOST);

      const upstreamReq = new Request(upstreamUrl.toString(), {
        method: request.method,
        headers: reqHeaders,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? null
            : request.body,
        redirect: "manual",
      });

      console.log('upstreamReq: ',upstreamReq.toString())

      const upstreamRes = await fetch(upstreamReq);

      // ✅ Build outHeaders WITHOUT copying Set-Cookie
      const outHeaders = new Headers();
      for (const [key, value] of upstreamRes.headers.entries()) {
        if (key.toLowerCase() === "set-cookie") continue;
        outHeaders.append(key, value);
      }
      
      const loc = outHeaders.get("Location");
      if (loc) outHeaders.set("Location", rewriteLocationHeader(loc));
      
      // ✅ Re-issue all Set-Cookie headers with .snabbb.com domain
      const setCookies = upstreamRes.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookies) {
        if (!cookie.match(/Domain=/i)) {
          outHeaders.append("Set-Cookie", `${cookie}; Domain=.snabbb.com`);
        } else {
          outHeaders.append("Set-Cookie", cookie.replace(/Domain=[^;]+/i, "Domain=.snabbb.com"));
        }
      }
      
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: outHeaders,
      });
    }

    /* ==============================
       API: /api/appointments
       ============================== */
       if (url.pathname === "/api/appointments") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
        // Security: Validate Token
        const token = auth.slice(7);
        let payload;
        try {
          payload = parseJwtPayload(token);
          if (payload?.exp && payload.exp * 1000 < Date.now()) throw new Error("expired");
        } catch {
          return new Response("Invalid Token", { status: 401, headers: corsHeaders });
        }
        try {
          // GET (List)
          if (request.method === "GET") {
            const clinicId = url.searchParams.get("clinicId");
            if (!clinicId) throw new Error("Missing clinicId");
            
            const data = await getAppointments(env, clinicId);
            return new Response(JSON.stringify(data), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
          // POST (Create)
          if (request.method === "POST") {
            const body = await request.json();
            const data = await createAppointment(env, body);
            return new Response(JSON.stringify(data), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
          // PATCH (Update)
          if (request.method === "PATCH") {
            const id = url.searchParams.get("id");
            if (!id) throw new Error("Missing ID for update");
            const body = await request.json();
            const data = await updateAppointment(env, id, body);
            return new Response(JSON.stringify(data), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
          // DELETE
          if (request.method === "DELETE") {
            const id = url.searchParams.get("id");
            if (!id) throw new Error("Missing ID for delete");
            await deleteAppointment(env, id);
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

    /* ==============================
       API: /api/patients
       ============================== */
       if (url.pathname === "/api/patients") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
        // Security Check
        const token = auth.slice(7);
        try {
          const payload = parseJwtPayload(token);
          if (payload?.exp && payload.exp * 1000 < Date.now()) throw new Error("expired");
        } catch {
          return new Response("Invalid Token", { status: 401, headers: corsHeaders });
        }
        const clinicId = url.searchParams.get("clinicId");
        
        try {
          // GET (List or Search)
          if (request.method === "GET") {
              if (!clinicId) throw new Error("Missing clinicId");
              const query = url.searchParams.get("query");
              
              let data;
              if (query) {
                  data = await searchPatients(env, clinicId, query);
              } else {
                  const limit = parseInt(url.searchParams.get("limit") ?? "50");
                  const offset = parseInt(url.searchParams.get("offset") ?? "0");
                  data = await getPatients(env, clinicId, limit, offset);
              }
              return new Response(JSON.stringify(data), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
          // POST (Create)
          if (request.method === "POST") {
              const body = await request.json();
              const data = await createPatient(env, body);
              return new Response(JSON.stringify(data), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
          // PATCH (Update)
          if (request.method === "PATCH") {
              const id = url.searchParams.get("id");
              if (!id) throw new Error("Missing ID");
              const body = await request.json();
              const data = await updatePatient(env, id, body);
              return new Response(JSON.stringify(data), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
          // DELETE
          if (request.method === "DELETE") {
              const id = url.searchParams.get("id");
              if (!id) throw new Error("Missing ID");
              await deletePatient(env, id);
              return new Response(JSON.stringify({ ok: true }), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

    /* ==============================
       API: /api/staff
       ============================== */
       if (url.pathname === "/api/staff") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
        const token = auth.slice(7);
        try {
          const payload = parseJwtPayload(token);
          if (payload?.exp && payload.exp * 1000 < Date.now()) throw new Error("expired");
        } catch {
          return new Response("Invalid Token", { status: 401, headers: corsHeaders });
        }
        const clinicId = url.searchParams.get("clinicId");
        try {
          // GET (List)
          if (request.method === "GET") {
              if (!clinicId) throw new Error("Missing clinicId");
              const data = await getStaff(env, clinicId);
              return new Response(JSON.stringify(data), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
          // POST (Create)
          if (request.method === "POST") {
              const body = await request.json();
              const data = await createStaff(env, body);
              return new Response(JSON.stringify(data), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
          // PATCH (Update)
          if (request.method === "PATCH") {
              const id = url.searchParams.get("id");
              if (!id) throw new Error("Missing ID");
              const body = await request.json();
              const data = await updateStaff(env, id, body);
              return new Response(JSON.stringify(data), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
          // DELETE
          if (request.method === "DELETE") {
              const id = url.searchParams.get("id");
              if (!id) throw new Error("Missing ID");
              await deleteStaff(env, id);
              return new Response(JSON.stringify({ ok: true }), {
                  headers: { "Content-Type": "application/json", ...corsHeaders },
              });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

    /* ==============================
       API: /api/rooms
       ============================== */
       if (url.pathname === "/api/rooms") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        
        const token = auth.slice(7);
        try {
          const p = parseJwtPayload(token);
          if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
        } catch {
          return new Response("Invalid Token", { status: 401, headers: corsHeaders });
        }
        const clinicId = url.searchParams.get("clinicId");
        try {
          if (request.method === "GET") {
              const data = await getRooms(env, clinicId);
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "POST") {
              const data = await createRoom(env, await request.json());
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "PATCH") {
              const id = url.searchParams.get("id");
              const data = await updateRoom(env, id, await request.json());
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "DELETE") {
              const id = url.searchParams.get("id");
              await deleteRoom(env, id);
              return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }

    /* ==============================
        API: /api/treatments
        ============================== */
    if (url.pathname === "/api/treatments") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  
        const token = auth.slice(7);
        try {
          const p = parseJwtPayload(token);
          if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
        } catch {
          return new Response("Invalid Token", { status: 401, headers: corsHeaders });
        }
  
        const clinicId = url.searchParams.get("clinicId");
  
        try {
          if (request.method === "GET") {
              const data = await getTreatments(env, clinicId);
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "POST") {
              const data = await createTreatment(env, await request.json());
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "PATCH") {
              const id = url.searchParams.get("id");
              const data = await updateTreatment(env, id, await request.json());
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "DELETE") {
              const id = url.searchParams.get("id");
              await deleteTreatment(env, id);
              return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }

    /* ==============================
       API: /api/settings
       ============================== */
       if (url.pathname === "/api/settings") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const token = auth.slice(7);
        try {
           const p = parseJwtPayload(token);
           if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
        } catch { return new Response("Invalid Token", { status: 401, headers: corsHeaders }); }
        const clinicId = url.searchParams.get("clinicId");
        try {
           if (request.method === "GET") {
               const data = await getSettings(env, clinicId);
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
           if (request.method === "POST") { // Save/Upsert
               const data = await saveSettings(env, await request.json());
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
        } catch(e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
      }
      /* ==============================
         API: /api/holidays
         ============================== */
      if (url.pathname === "/api/holidays") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const token = auth.slice(7);
        try {
           const p = parseJwtPayload(token);
           if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
        } catch { return new Response("Invalid Token", { status: 401, headers: corsHeaders }); }
        const clinicId = url.searchParams.get("clinicId");
        try {
           if (request.method === "GET") {
               const data = await getHolidays(env, clinicId);
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
           if (request.method === "POST") {
               const data = await addHoliday(env, await request.json());
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
           if (request.method === "PATCH") {
               const id = url.searchParams.get("id");
               const data = await updateHoliday(env, id, await request.json());
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
           if (request.method === "DELETE") {
               const id = url.searchParams.get("id");
               await deleteHoliday(env, id);
               return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
        } catch(e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
      }
      /* ==============================
         API: /api/activity
         ============================== */
      if (url.pathname === "/api/activity") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const token = auth.slice(7);
        try {
           const p = parseJwtPayload(token);
           if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
        } catch { return new Response("Invalid Token", { status: 401, headers: corsHeaders }); }
        const clinicId = url.searchParams.get("clinicId");
        try {
           if (request.method === "GET") {
               // For admin, clinicId might be missing or special flag. The helper handles it.
               const data = await getActivity(env, clinicId); 
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
           if (request.method === "POST") {
               const data = await addActivity(env, await request.json());
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
           }
        } catch(e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
      }

    /* ==============================
       API: /api/requests
       ============================== */
       if (url.pathname === "/api/requests") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const token = auth.slice(7);
        try {
           const p = parseJwtPayload(token);
           if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
        } catch { return new Response("Invalid Token", { status: 401, headers: corsHeaders }); }
        const clinicId = url.searchParams.get("clinicId");
        try {
          if (request.method === "GET") {
              const data = await getRequests(env, clinicId);
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "PATCH") {
              const id = url.searchParams.get("id");
              if (!id) throw new Error("Missing ID");
              const data = await updateRequest(env, id, await request.json());
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }

      /* ==============================
       API: /api/clinics
       ============================== */
      if (url.pathname === "/api/clinics") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const token = auth.slice(7);
        try {
          const p = parseJwtPayload(token);
          if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
        } catch { return new Response("Invalid Token", { status: 401, headers: corsHeaders }); }

        try {
          if (request.method === "GET") {
              const id = url.searchParams.get("id");
              if (id) {
                  const data = await getClinicById(env, id);
                  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
              }
              const data = await getClinics(env);
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "POST") {
              const data = await addClinic(env, await request.json());
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "PATCH") {
              const id = url.searchParams.get("id");
              const data = await updateClinic(env, id, await request.json());
              return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          if (request.method === "DELETE") {
              const id = url.searchParams.get("id");
              await deleteClinic(env, id);
              return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }

      /* ==============================
       API: /api/apt_profiles
       ============================== */
    if (url.pathname === "/api/profiles") {
      const auth = request.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      const token = auth.slice(7);
      try {
         const p = parseJwtPayload(token);
         if (p?.exp && p.exp * 1000 < Date.now()) throw new Error("expired");
      } catch { return new Response("Invalid Token", { status: 401, headers: corsHeaders }); }

      try {
        if (request.method === "GET") {
            const id = url.searchParams.get("id");
            const email = url.searchParams.get("email");

            if (id) {
               const data = await getProfileById(env, id);
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            }
            if (email) {
               const data = await getProfileByEmail(env, email);
               return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            }

            // Default: List all
            const data = await getProfiles(env);
            return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        if (request.method === "PATCH") {
            const id = url.searchParams.get("id");
            if (!id) throw new Error("Missing ID");
            const data = await updateProfile(env, id, await request.json());
            return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }


    /* ==============================
       API: POST /api/inventory/sync
       ============================== */
    if (url.pathname === "/api/inventory/sync" && request.method === "POST") {
      // ✅ Cookie-based auth
      const token = getTokenFromRequest(request);
      if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const decoded = decodeAndValidateToken(token);
      if (!decoded.ok) {
        return new Response("Unauthorized", {
          status: 401,
          headers: {
            ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
            ...corsHeaders,
          },
        });
      }

      const body = await request.json();
      await inventoryFullSync(env, body);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    /* ==============================
       API: POST /api/inventory/profiles
       ============================== */
    if (url.pathname === "/api/inventory/profile/latest" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    
      try {
        const profile = await getLatestProfileByUserId(env, userId);
        return new Response(JSON.stringify({ data: profile, error: null }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(JSON.stringify({ data: null, error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    /* ==============================
       API: GET /api/bootstrap
       ============================== */
    if (url.pathname === "/api/bootstrap") {
      // ✅ Cookie-based auth
      const token = getTokenFromRequest(request);
      if (!token) {
        return new Response(JSON.stringify({ loggedIn: false }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const decoded = decodeAndValidateToken(token);
      if (!decoded.ok) {
        return new Response(JSON.stringify({ loggedIn: false, error: decoded.error }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
            ...corsHeaders,
          },
        });
      }

      try {
        const result = await supabaseBootstrapByEmail(env, decoded.email);

        return new Response(
          JSON.stringify({
            loggedIn: true,
            user: result,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (e) {
        return new Response(JSON.stringify({ loggedIn: false, error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    /* ==============================
      API: GET /api/verify-token
      (kept same shape, but reads cookie)
    ============================== */
    if (url.pathname === "/api/verify-token") {
      const token = getTokenFromRequest(request);
      if (!token) {
        return new Response(JSON.stringify({ loggedIn: false }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const decoded = decodeAndValidateToken(token);
      if (!decoded.ok) {
        return new Response(JSON.stringify({ loggedIn: false }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
            ...corsHeaders,
          },
        });
      }

      // fetch profile
      let profile;
      try {
        profile = await getProfileByEmail(env, decoded.email);
      } catch (e) {
        return new Response(JSON.stringify({ loggedIn: false, error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!profile) {
        return new Response(JSON.stringify({ loggedIn: false }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // fetch meta
      let meta = [];
      try {
        meta = await getInventoryMetaByUserId(env, profile.user_id);
      } catch {
        meta = [];
      }

      return new Response(
        JSON.stringify({
          loggedIn: true,
          user: {
            profiles: {
              user: {
                user_id: profile.user_id,
                email: profile.email,
                user_metadata: {
                  name: profile.name,
                  account_type: profile.account_type,
                  phone: profile.phone,
                  position: profile.position,
                  company_name: profile.company_name,
                },
              },
            },
            meta,
            rooms: [],
            rooms_error: null,
            items_data: [],
            history_data: [],
            log_data: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    /* ==============================
       API: GET /api/collaborators
       ============================== */
      if (url.pathname === "/api/collaborators" && request.method === "GET") {
        const uid = url.searchParams.get("uid");
        if (!uid) {
          return new Response(JSON.stringify({ error: "Missing uid" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      
        try {
          const shared = await getCollaboratorsByUserId(env, uid);
          return new Response(JSON.stringify({ data: shared, error: null }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (e) {
          return new Response(JSON.stringify({ data: null, error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

    /* ==============================
       API: GET /api/inventory/meta
       ============================== */
    if (url.pathname === "/api/inventory/meta") {
      const token = getTokenFromRequest(request);
      if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const decoded = decodeAndValidateToken(token);
      if (!decoded.ok) {
        return new Response("Unauthorized", {
          status: 401,
          headers: {
            ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
            ...corsHeaders,
          },
        });
      }

      let profile;
      try {
        profile = await getProfileByEmail(env, decoded.email);
      } catch (e) {
        return new Response(e.message, { status: 500, headers: corsHeaders });
      }

      if (!profile) {
        return new Response("User not found", { status: 403, headers: corsHeaders });
      }

      try {
        const meta = await getInventoryMetaByUserId(env, profile.user_id);
        return new Response(JSON.stringify(meta), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(e.message, { status: 500, headers: corsHeaders });
      }
    }

      /* ==============================
       API: PATCH /api/inventory/rooms/position
       Body: { id, x, y }
       ============================== */
      if (url.pathname === "/api/inventory/rooms/position") {
        // (Preflight already handled globally above, but safe to keep if you want)
        if (request.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: corsHeaders });
        }
      
        if (request.method !== "PATCH") {
          return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
        }
      
        // ✅ Cookie-based auth (same pattern as /api/inventory/meta)
        const token = getTokenFromRequest(request);
        if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      
        const decoded = decodeAndValidateToken(token);
        if (!decoded.ok) {
          return new Response("Unauthorized", {
            status: 401,
            headers: {
              ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
              ...corsHeaders,
            },
          });
        }
      
        let profile;
        try {
          profile = await getProfileByEmail(env, decoded.email);
        } catch (e) {
          return new Response(e.message, { status: 500, headers: corsHeaders });
        }
      
        if (!profile) {
          return new Response("User not found", { status: 403, headers: corsHeaders });
        }
      
        // ✅ Parse body
        let body;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400, headers: corsHeaders });
        }
      
        const id = body?.id;
        const x = body?.x;
        const y = body?.y;
      
        if (!id) return new Response("Missing id", { status: 400, headers: corsHeaders });
        console.log('type of x: ',typeof x)
      
        // ✅ (Optional) ownership enforcement hook:
        // If your inventory_rooms has a meta_id / user_id field,
        // you can validate here using getInventoryMetaByUserId(env, profile.user_id).
        // Leaving it permissive for now, consistent with your current style.
      
        try {
          await updateRoomPosition(env, id, x, y);
        
          return new Response(JSON.stringify({ ok: true, id, pos_x: x, pos_y: y }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

       
        /* ==============================
       API: GET /api/inventory/rooms
       ============================== */
    if (url.pathname === "/api/inventory/rooms") {
      const token = getTokenFromRequest(request);
      if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const decoded = decodeAndValidateToken(token);
      if (!decoded.ok) {
        return new Response("Unauthorized", {
          status: 401,
          headers: {
            ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
            ...corsHeaders,
          },
        });
      }

      let profile;
      try {
        profile = await getProfileByEmail(env, decoded.email);
      } catch (e) {
        return new Response(e.message, { status: 500, headers: corsHeaders });
      }

      if (!profile) {
        return new Response("User not found", { status: 403, headers: corsHeaders });
      }

      try {
        const meta = await getInventoryMetaByUserId(env, profile.user_id);
        return new Response(JSON.stringify(meta), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(e.message, { status: 500, headers: corsHeaders });
      }
    }

    /* ==============================
      ✅ API: GET /api/token
      Server-to-server only.
      Odoo calls this with ?sid=<session_id>
      Returns a signed JWT as JSON (no cookies)
    ============================== */
    if (url.pathname === "/api/token" && request.method === "GET") {
      const sid = url.searchParams.get("sid");
    
      if (!sid) {
        return new Response(JSON.stringify({ ok: false, error: "Missing sid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    
      // Validate the Odoo session
      let sessionInfo;
      try {
        const odooRes = await fetch("https://app.snabbb.com/api/web/session/get_session_info", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Cookie: `session_id=${sid}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: {},
            id: 1,
          }),
        });
      
        const odooData = await odooRes.json().catch(() => null);
      
        // Odoo returns uid: false if the session is invalid/expired
        if (!odooData?.result?.uid) {
          return new Response(JSON.stringify({ ok: false, error: "Invalid or expired Odoo session" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
      
        sessionInfo = odooData.result;
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: `Odoo validation failed: ${e.message}` }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    
      // Sign the JWT
      const now = Math.floor(Date.now() / 1000);
      let token;
      try {
        token = await signHS256({
          header: { alg: "HS256", typ: "JWT" },
          payload: {
            iss: "mrbur-worker",
            aud: "gallery",
            sub: String(sessionInfo.uid),
            email: sessionInfo.username ?? "",
            name: sessionInfo.name ?? "",
            odoo_sid: sid,
            iat: now,
            exp: now + DEFAULT_MAX_AGE,
          },
          secret: env.APP_JWT_SECRET ?? env.SUPABASE_JWT_SECRET,
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: `JWT signing failed: ${e.message}` }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    
      return new Response(JSON.stringify({ ok: true, token }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    /* ==============================
       ✅ API: GET /api/redirect
       Browser hits this endpoint.
       Verifies the token, sets cookies on
       the user's browser, redirects to gallery.
    ============================== */
    if (url.pathname === "/api/redirect" && request.method === "GET") {
      console.log('the redirect')
      const sid = url.searchParams.get("sid");
      
      if (!sid) {
        return new Response("Missing sid", { status: 400 });
      }
      
      const outHeaders = new Headers({
        "Location": "https://app.snabbb.com",
        "Cache-Control": "no-store",
        ...corsHeaders,
      });
      
      // Set session_id cookie directly with sid value
      outHeaders.append("Set-Cookie", buildSharedOdooSessionCookie(sid));
      console.log('the redirect almost finished')
    
      return new Response(null, {
        status: 302,
        headers: outHeaders,
      });
    }

    /* ==============================
       ✅ SSO LOGIN (UPDATED: SET COOKIE + REDIRECT)
       ============================== */
    if (url.pathname === "/sso/login") {
      const token = url.searchParams.get("token");
      if (!token) return new Response("Missing token", { status: 400 });
      const decoded = decodeAndValidateToken(token);
      if (!decoded.ok) {
        return new Response("Invalid Token", { status: 400 });
      }

      // Use aud to route app (same as your current)
      const appCode = decoded.payload.aud;
      const config = APP_CONFIG[appCode];
      if (!config) {
        return new Response(`Unknown App Code: ${appCode}`, { status: 400 });
      }

      // ✅ set cookie shared across subdomains
      // If you want max-age to follow token exp exactly:
      // const now = Math.floor(Date.now() / 1000);
      // const maxAge = decoded.payload?.exp ? Math.max(0, decoded.payload.exp - now) : DEFAULT_MAX_AGE;
      const maxAge = DEFAULT_MAX_AGE;

      // OPTIONAL: ensure user exists (your existing check)
      if (config.type === "supabase") {
        try {
          const profile = await getProfileByEmail(env, decoded.email);
        } catch (e) {
          return new Response(e.message, { status: 500 });
        }

        const finalUrl = `${config.baseUrl}`;

        return new Response(null, {
          status: 302,
          headers: {
            "Set-Cookie": buildSetCookie({ value: token,domain: '.snabbb.com', maxAge }),
            Location: finalUrl,
            "Cache-Control": "no-store",
          },
        });
      } else if (config.type === "odoo") {
         try {
          const profile = await getProfileByEmail(env, decoded.email);
        } catch (e) {
          return new Response(e.message, { status: 500 });
        }

        const finalUrl = `${config.baseUrl}`;

        return new Response(null, {
          status: 302,
          headers: {
            "Set-Cookie": buildSetCookie({ value: token,domain: '.snabbb.com', maxAge }),
            Location: finalUrl,
            "Cache-Control": "no-store",
          },
        });
      }

      // For OAuth apps (kept, but also set cookie if you want)
      const MAIN_ODOO_URL = "https://aht-systemadmin-mrbur-main-20994444.dev.odoo.com";
      const redirectUri = `${config.baseUrl}/auth_oauth/signin`;

      const oauthUrl =
        `${MAIN_ODOO_URL}/oauth2/auth` +
        `?client_id=${config.clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token&scope=userinfo`;

      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": buildSetCookie({ value: token,domain: '.snabbb.com', maxAge }),
          Location: oauthUrl,
          "Cache-Control": "no-store",
        },
      });
    }

    /**
     * Headless Odoo session auth (server-side only)
     * - POST /api/odoo/login  { email, password } -> stores session_id in KV, returns app JWT
     * - GET  /api/odoo/me     -> returns cached sessionInfo (requires Bearer token)
     * - POST /api/odoo/rpc    -> proxies /web/dataset/call_kw using stored session_id (requires Bearer token)
     * - POST /api/odoo/logout -> deletes KV session (requires Bearer token)
     */
      
    // POST /api/odoo/login
    if (url.pathname === "/api/odoo/login") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }
    
      const email = (body?.email || "").trim();
      const password = body?.password;
    
      if (!email || !password) return json({ ok: false, error: "Missing email or password" }, 400);
      if (!env.ODOO_BASE || !env.ODOO_DB) return json({ ok: false, error: "Missing ODOO_BASE or ODOO_DB" }, 500);
      if (!env.APP_JWT_SECRET) return json({ ok: false, error: "Missing APP_JWT_SECRET" }, 500);
      if (!env.ODOO_SESSIONS) return json({ ok: false, error: "Missing KV binding ODOO_SESSIONS" }, 500);
    
      const rpcBody = {
        jsonrpc: "2.0",
        method: "call",
        params: { db: env.ODOO_DB, login: email, password },
        id: body?.id ?? 1,
      };
    
      const { res, data, setCookie } = await odooJsonRpc({
        base: env.ODOO_BASE,
        path: "/web/session/authenticate",
        body: rpcBody,
      });
    
      if (!res.ok) return json({ ok: false, error: "Upstream Odoo error", status: res.status, data }, 502);
      if (data?.error) return json({ ok: false, error: data?.error?.message || "Odoo login failed", data }, 401);
    
      const result = data?.result || {};
      const uid = result?.uid;
      if (!uid) return json({ ok: false, error: "No uid returned from Odoo", data }, 502);
    
      const sessionCookie = parseCookie(setCookie); // expects "session_id=...."
      if (!sessionCookie) return json({ ok: false, error: "Missing session_id from Odoo Set-Cookie" }, 502);
    
      const sessionInfo = {
        uid,
        name: result?.name ?? result?.partner_display_name ?? "",
        email: result?.username ?? email,
        partner_id: result?.partner_id ?? null,
        db: result?.db ?? env.ODOO_DB,
      };
    
      // Cache session_id server-side (6h example TTL)
      await env.ODOO_SESSIONS.put(
        kvKeyForOdoo(String(uid)),
        JSON.stringify({ cookie: sessionCookie, sessionInfo, updated_at: Date.now() }),
        { expirationTtl: 60 * 60 * 6 }
      );
    
      // Issue app JWT (HS256) using your existing signHS256()
      const now = Math.floor(Date.now() / 1000);
      const appToken = await signHS256({
        header: { alg: "HS256", typ: "JWT" },
        payload: {
          iss: "mrbur-worker",
          aud: "react",
          sub: String(uid),
          email: sessionInfo.email,
          name: sessionInfo.name,
          iat: now,
          exp: now + 60 * 60,
        },
        secret: env.APP_JWT_SECRET,
      });

      // ✅ AUTO-PROVISION SUPABASE USER (Self-healing for Odoo-only accounts)
      try {
        let sbUser = await getSupabaseUserByEmail(env, sessionInfo.email);
        if (!sbUser) {
          const createRes = await fetch(
            `${env.SUPABASE_URL}/auth/v1/admin/users`,
            {
              method: "POST",
              headers: {
                "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: sessionInfo.email,
                email_confirm: true,
                password: crypto.randomUUID() + crypto.randomUUID(),
                user_metadata: {
                  sso: "odoo",
                  name: sessionInfo.name,
                  odoo_sub: String(uid),
                },
              }),
            }
          );
          if (!createRes.ok) {
            console.error("Supabase auto-provision failed during direct login:", await createRes.text());
          } else {
            const created = await createRes.json();
            console.log("Auto-provisioned Supabase user:", sessionInfo.email);
          }
        }
      } catch (err) {
        console.error("Supabase check/create failed during direct login:", err);
      }
    
      return json({ ok: true, token: appToken, sessionInfo }, 200);
    }
    
    // GET /api/odoo/me
    if (url.pathname === "/api/odoo/me") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    
      const token = getBearer(request);
      if (!token) return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    
      const v = await verifyHS256({ token, secret: env.APP_JWT_SECRET });
      if (!v.ok) return json({ ok: false, error: v.error || "Invalid token" }, 401);
    
      const uid = v.payload.sub;
      const stored = await env.ODOO_SESSIONS.get(kvKeyForOdoo(String(uid)));
      if (!stored) return json({ ok: false, error: "No cached Odoo session" }, 401);
    
      const parsed = JSON.parse(stored);
      return json({ ok: true, sessionInfo: parsed.sessionInfo }, 200);
    }
    
    // POST /api/odoo/rpc
    if (url.pathname === "/api/odoo/rpc") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    
      const token = getBearer(request);
      if (!token) return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    
      const v = await verifyHS256({ token, secret: env.APP_JWT_SECRET });
      if (!v.ok) return json({ ok: false, error: v.error || "Invalid token" }, 401);
    
      const uid = v.payload.sub;
      const stored = await env.ODOO_SESSIONS.get(kvKeyForOdoo(String(uid)));
      if (!stored) return json({ ok: false, error: "No cached Odoo session" }, 401);
    
      const parsed = JSON.parse(stored);
      const cookie = parsed?.cookie; // "session_id=...."
      if (!cookie) return json({ ok: false, error: "Cached session missing cookie" }, 401);
    
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }
    
      const model = body?.model;
      const method = body?.method;
      const args = body?.args ?? [];
      const kwargs = body?.kwargs ?? {};
    
      if (!model || !method) return json({ ok: false, error: "Missing model or method" }, 400);
    
      const rpcBody = {
        jsonrpc: "2.0",
        method: "call",
        params: { model, method, args, kwargs },
        id: body?.id ?? 1,
      };
    
      const { res, data, setCookie } = await odooJsonRpc({
        base: env.ODOO_BASE,
        path: "/web/dataset/call_kw",
        body: rpcBody,
        cookie,
      });
    
      // If Odoo rotates session cookie, update KV
      const newCookie = parseCookie(setCookie);
      if (newCookie && newCookie !== cookie) {
        parsed.cookie = newCookie;
        parsed.updated_at = Date.now();
        await env.ODOO_SESSIONS.put(kvKeyForOdoo(String(uid)), JSON.stringify(parsed), {
          expirationTtl: 60 * 60 * 6,
        });
      }
    
      if (!res.ok) return json({ ok: false, error: "Upstream Odoo error", status: res.status, data }, 502);
      if (data?.error) return json({ ok: false, error: data?.error?.message || "Odoo RPC error", data }, 400);
    
      return json({ ok: true, result: data?.result }, 200);
    }
    
    // POST /api/odoo/logout
    if (url.pathname === "/api/odoo/logout") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    
      const token = getBearer(request);
      if (!token) return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    
      const v = await verifyHS256({ token, secret: env.APP_JWT_SECRET });
      if (!v.ok) return json({ ok: false, error: v.error || "Invalid token" }, 401);
    
      await env.ODOO_SESSIONS.delete(kvKeyForOdoo(String(v.payload.sub)));
      return json({ ok: true }, 200);
    }

    /* ==============================
      Whiteboard API (notes/drawings/shares)
    =================================*/
    const whiteboardResponse = await handleWhiteboardApi({
      request,
      env,
      corsHeaders,
      getTokenFromRequest,
      decodeAndValidateToken,
      getProfileByEmail,
    });
    if (whiteboardResponse) return whiteboardResponse;

    /* ==============================
      Tasks API
    =================================*/
    const tasksResponse = await handleTasksApi({
      request,
      env,
      corsHeaders,
      getTokenFromRequest,
      decodeAndValidateToken,
      getProfileByEmail,
    });
    if (tasksResponse) return tasksResponse;

    /* ==============================
      Hiring API
    =================================*/
    const hiringResponse = await handleHiringApi({
      request,
      env,
      corsHeaders,
      getTokenFromRequest,
      decodeAndValidateToken,
      getProfileByEmail,
    });
    if (hiringResponse) return hiringResponse;
    

    return new Response("SSO Gateway Active", {
      status: 200,
      headers: corsHeaders,
    });
  },
};