import { APP_CONFIG } from "./config/apps.js";
import { parseJwtPayload, extractEmail } from "./auth/odooJwt.js";
import { getProfileByEmail } from "./supabase/profiles.js";
import { getInventoryMetaByUserId } from "./supabase/inventoryMeta.js";
import { supabaseBootstrapByEmail } from "./supabase/bootstrap.js";
import { inventoryFullSync } from "./supabase/inventorySync.js";
import { getAppointments, updateAppointment, deleteAppointment, createAppointment } from "./supabase/appointments.js";
import { searchPatients, createPatient, getPatients, updatePatient, deletePatient } from "./supabase/patients.js";
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

const PUBLIC_EVENT_HOST = "event.mrburstudio.com";
const ODOO_EVENT_HOST = "mrbur-sandbox.odoo.com";
const ODOO_EVENT_BASE = "/event";
const ODOO_DEV_HOST = "mrbur-staging-bur-26090883.dev.odoo.com";
const ODOO_DEV_BASE = `https://${ODOO_DEV_HOST}`;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ==============================
        // ✅ COOKIE CONFIG (SHARED ACROSS SUBDOMAINS)
        // ==============================
        const COOKIE_NAME = "mrbur_sso";
        const COOKIE_DOMAIN = ".mrburstudio.com"; // ✅ shared across all subdomains
        const DEFAULT_MAX_AGE = 60 * 60; // 1 hour

        // ==============================
        // ✅ CORS
        // ==============================
        const origin = request.headers.get("Origin");
        const allowedOrigins = new Set([
            "https://inventory.mrburstudio.com",
            "https://appointment.mrburstudio.com",
            "https://event.mrburstudio.com",
            "https://recruitment.mrburstudio.com",
            "https://todo.mrburstudio.com",
            "http://localhost:3000",
            "http://localhost:5173",
        ]);

        const isApi = url.pathname.startsWith("/api/");

        // NOTE: for cookies, Origin MUST be echoed (not "*")
        const corsHeaders = isApi
            ? {
                "Access-Control-Allow-Origin": allowedOrigins.has(origin)
                    ? origin
                    : "https://inventory.mrburstudio.com",
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

        function buildSetCookie({ value, maxAge = DEFAULT_MAX_AGE }) {
            return [
                `${COOKIE_NAME}=${encodeURIComponent(value)}`,
                "Path=/",
                `Domain=${COOKIE_DOMAIN}`, // ✅ share across subdomains
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
                if (u.hostname === ODOO_EVENT_HOST)
                    u.hostname = PUBLIC_EVENT_HOST;
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

        /* =========================================================
           ✅ ODOO DEV REVERSE PROXY
           /api/web/*  →  https://mrbur-staging-bur-26090883.dev.odoo.com/web/*
           - forwards browser cookies (session_id)
           - avoids CORS pain by keeping same-origin
        ========================================================= */
        if (url.pathname.startsWith("/api/web/")) {
            // map /api/web/... -> /web/...
            const odooPath = url.pathname.replace("/api", ""); // "/web/..."
            const targetUrl = new URL(ODOO_DEV_BASE + odooPath);

            // preserve query string
            targetUrl.search = url.search;

            // Build upstream headers (important: forward Cookie)
            const upstreamHeaders = new Headers();

            // Forward minimal headers safely
            upstreamHeaders.set("Accept", request.headers.get("Accept") || "application/json");
            upstreamHeaders.set("Content-Type", request.headers.get("Content-Type") || "application/json");

            // ✅ forward the browser cookies (this is the key)
            const cookie = request.headers.get("Cookie");
            if (cookie) upstreamHeaders.set("Cookie", cookie);

            // Optional: forward user-agent (useful for debugging)
            const ua = request.headers.get("User-Agent");
            if (ua) upstreamHeaders.set("User-Agent", ua);

            // Important: do NOT forward Origin to Odoo (can trigger odd behavior)
            // Also avoid forwarding Cloudflare-specific headers unless needed.

            const method = request.method.toUpperCase();

            // For GET/HEAD, no body
            const body =
                method === "GET" || method === "HEAD"
                    ? null
                    : await request.arrayBuffer(); // safe pass-through

            const upstreamRes = await fetch(targetUrl.toString(), {
                method,
                headers: upstreamHeaders,
                body,
                redirect: "manual",
            });

            // Return upstream response back to browser (+ CORS headers for /api/*)
            const outHeaders = new Headers(upstreamRes.headers);

            // Ensure content-type exists
            if (!outHeaders.get("Content-Type")) {
                outHeaders.set("Content-Type", "application/json");
            }

            // Add your API CORS headers (since this is /api/*)
            for (const [k, v] of Object.entries(corsHeaders)) outHeaders.set(k, v);

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
                const upstreamUrl = "https://mrbur-sandbox.odoo.com/api/v1/users"; // your real target

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
                const upstreamUrl = "https://mrbur-sandbox.odoo.com/api/v1/users";

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
                } catch (_) { }

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

            try {

                const bodyText = await request.text(); // keep raw JSON
                const upstreamUrl = "https://mrbur-sandbox.odoo.com/api/v1/sso/app_link";

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

                // pass-through response (recommended)
                return new Response(upstreamText, {
                    status: upstreamRes.status,
                    headers: {
                        "Content-Type": upstreamRes.headers.get("Content-Type") || "application/json",
                        ...corsHeaders,
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

                const ODOO_BASE = "https://mrbur-sandbox.odoo.com";
                const DB = "mrbur-staging-bur-26090883";

                const upstream = await fetch(`${ODOO_BASE}/web/session/authenticate`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "call",
                        params: {
                            db: DB,
                            login,
                            password,
                        },
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

                // ✅ Forward Odoo session cookies (important for session auth)
                const setCookie = upstream.headers.get("Set-Cookie");

                // ✅ This is the key change: return sessionInfo so frontend can do result.sessionInfo.name
                return new Response(
                    JSON.stringify({
                        ok: true,

                        // 👇 what your frontend expects
                        sessionInfo: {
                            name: result?.name ?? result?.partner_display_name ?? "",
                            email: result?.username ?? login,
                            uid: result?.uid ?? null,
                            partner_id: result?.partner_id ?? null,
                            db: result?.db ?? DB,
                        },

                        // 👇 keep raw Odoo payload too (optional but useful for debugging)
                        data,
                    }),
                    {
                        status: 200,
                        headers: {
                            "Content-Type": "application/json",
                            ...(setCookie ? { "Set-Cookie": setCookie } : {}),
                            ...corsHeaders,
                        },
                    }
                );
            } catch (err) {
                return new Response(JSON.stringify({ ok: false, error: err?.message || "Odoo login failed" }), {
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

            const upstreamUrl = "https://mrbur-sandbox.odoo.com/api/v1/users";

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

        /* =========================================================
           🌐 EVENT REVERSE PROXY
           event.mrburstudio.com → mrbur-sandbox.odoo.com/event
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

            const upstreamRes = await fetch(upstreamReq);

            const outHeaders = new Headers(upstreamRes.headers);

            const loc = outHeaders.get("Location");
            if (loc)
                outHeaders.set("Location", rewriteLocationHeader(loc));

            rewriteSetCookieDomain(outHeaders);

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
            } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
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
            } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
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
            } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
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
            console.log('type of x: ', typeof x)

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

                const finalUrl = `${config.baseUrl}/login`;

                return new Response(null, {
                    status: 302,
                    headers: {
                        "Set-Cookie": buildSetCookie({ value: token, maxAge }),
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
                        "Set-Cookie": buildSetCookie({ value: token, maxAge }),
                        Location: finalUrl,
                        "Cache-Control": "no-store",
                    },
                });
            }

            // For OAuth apps (kept, but also set cookie if you want)
            const MAIN_ODOO_URL = "https://mrbur-staging-bur-2609087.dev.odoo.com";
            const redirectUri = `${config.baseUrl}/auth_oauth/signin`;

            const oauthUrl =
                `${MAIN_ODOO_URL}/oauth2/auth` +
                `?client_id=${config.clientId}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                `&response_type=token&scope=userinfo`;

            return new Response(null, {
                status: 302,
                headers: {
                    "Set-Cookie": buildSetCookie({ value: token, maxAge }),
                    Location: oauthUrl,
                    "Cache-Control": "no-store",
                },
            });
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