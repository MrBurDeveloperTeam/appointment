/**
 * _worker.js — Cloudflare Pages Worker for appointment.snabbb.com
 *
 * WHAT IT DOES
 * ─────────────
 * For every HTML page request (navigation, not assets):
 *
 *   1. Forward the request to Pages static assets as normal.
 *   2. Read the session_id cookie from the browser request.
 *   3. Call Odoo GET /api/user/theme with that session cookie.
 *   4. Inject <script>window.__SNABBB_THEME__='dark'</script> into <head>
 *      of the HTML response BEFORE sending it to the browser.
 *   5. Also write/refresh the snabbb-theme cookie on the response
 *      so future loads are instant even without hitting Odoo.
 *
 * The index.html bootstrap script reads window.__SNABBB_THEME__ first,
 * so the correct theme is applied synchronously before React paints.
 * Zero flash. No cookie dependency on first load.
 *
 * All other requests (JS, CSS, images, /api/*) pass through untouched.
 *
 * DEPLOYMENT
 * ──────────
 * Place this file at:  appointment-repo/public/_worker.js
 * Cloudflare Pages picks it up automatically on next deploy.
 *
 * Set this environment variable in your Pages project settings:
 *   ODOO_BASE_URL = https://mrbur.odoo.com
 */

const ODOO_THEME_URL = 'https://mrbur.odoo.com/api/user/theme';
const ODOO_BASE_URL = 'https://mrbur.odoo.com';
const COOKIE_NAME = 'snabbb-theme';
const COOKIE_DOMAIN = '.snabbb.com';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const VALID_THEMES = new Set(['light', 'dark', 'system']);
const DEFAULT_THEME = 'light';

const WALLET_UPSTREAM_URL =
    'https://app.snabbb.com/api/wallet';

/**
 * Proxy the Wallet request through the Appointment
 * domain to avoid cross-origin browser restrictions.
 */
async function proxyWalletRequest(
    request
) {
    if (request.method !== 'GET') {
        return new Response(
            JSON.stringify({
                ok: false,
                error:
                    'Method not allowed',
            }),
            {
                status: 405,
                headers: {
                    'Content-Type':
                        'application/json',

                    'Cache-Control':
                        'no-store',

                    Allow:
                        'GET',
                },
            }
        );
    }

    const incomingUrl =
        new URL(request.url);

    const email =
        incomingUrl.searchParams
            .get('email')
            ?.trim();

    if (!email) {
        return new Response(
            JSON.stringify({
                ok: false,
                error:
                    'Email is required',
            }),
            {
                status: 400,
                headers: {
                    'Content-Type':
                        'application/json',

                    'Cache-Control':
                        'no-store',
                },
            }
        );
    }

    const upstreamUrl =
        new URL(
            WALLET_UPSTREAM_URL
        );

    upstreamUrl.searchParams.set(
        'email',
        email
    );

    const upstreamHeaders =
        new Headers({
            Accept:
                'application/json',
        });

    /*
     * Forward the shared Snabbb login cookie.
     */
    const cookie =
        request.headers.get(
            'Cookie'
        );

    if (cookie) {
        upstreamHeaders.set(
            'Cookie',
            cookie
        );
    }

    try {
        const upstreamResponse =
            await fetch(
                upstreamUrl.toString(),
                {
                    method: 'GET',
                    headers:
                        upstreamHeaders,

                    redirect:
                        'manual',
                }
            );

        const responseHeaders =
            new Headers(
                upstreamResponse.headers
            );

        responseHeaders.set(
            'Cache-Control',
            'no-store'
        );

        if (
            !responseHeaders.get(
                'Content-Type'
            )
        ) {
            responseHeaders.set(
                'Content-Type',
                'application/json'
            );
        }

        return new Response(
            upstreamResponse.body,
            {
                status:
                    upstreamResponse.status,

                headers:
                    responseHeaders,
            }
        );
    } catch (error) {
        console.error(
            'Wallet proxy failed:',
            error
        );

        return new Response(
            JSON.stringify({
                ok: false,
                error:
                    'Unable to load balance',
            }),
            {
                status: 502,
                headers: {
                    'Content-Type':
                        'application/json',

                    'Cache-Control':
                        'no-store',
                },
            }
        );
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTheme(value) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  return VALID_THEMES.has(s) ? s : null;
}

/**
 * Read the snabbb-theme cookie from the incoming browser request.
 * This is the fast path — no Odoo call needed if cookie already set.
 */
function readThemeCookie(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)snabbb-theme=([^;]+)/);
  return match ? parseTheme(decodeURIComponent(match[1])) : null;
}

function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';

  return cookieHeader.split(';').reduce((cookies, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (!name) return cookies;

    const rawValue = valueParts.join('=');
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
    return cookies;
  }, {});
}

function getOdooCookie(request) {
  const cookies = parseCookies(request);
  const sessionId = cookies.session_id || cookies.mrbur_sso;
  if (!sessionId) return null;
  return `session_id=${encodeURIComponent(sessionId)}`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function base64UrlEncode(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function handleTicketingSso(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  if (!env.TICKETING_SSO_SECRET) {
    return jsonResponse({ ok: false, error: 'Ticketing SSO is not configured.' }, 503);
  }

  const odooCookie = getOdooCookie(request);
  if (!odooCookie) {
    return jsonResponse({ ok: false, error: 'Please sign in again.' }, 401);
  }

  try {
    const sessionResponse = await fetch(`${ODOO_BASE_URL}/web/session/get_session_info`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: odooCookie },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {}, id: Date.now() }),
    });
    const sessionData = await sessionResponse.json().catch(() => null);
    const session = sessionData?.result;

    if (!sessionResponse.ok || !session?.uid || !session?.partner_id) {
      return jsonResponse({ ok: false, error: 'Unable to verify your Snabbb account.' }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64UrlEncode(JSON.stringify({
      sub: String(session.uid),
      partner_id: session.partner_id,
      aud: 'snabbb-ticketing-portal',
      iat: now,
      exp: now + 60,
      jti: crypto.randomUUID(),
    }));
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.TICKETING_SSO_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
    const token = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;

    return jsonResponse({
      ok: true,
      url: `${ODOO_BASE_URL}/snabbb/ticketing/sso?token=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    console.error('Ticketing SSO error:', error);
    return jsonResponse({ ok: false, error: 'Ticketing sign-in is unavailable.' }, 502);
  }
}

/**
 * Call Odoo to get the authenticated user's saved theme.
 * Forwards the browser's session_id cookie.
 * Returns the theme string, or null if guest / error.
 */
async function fetchThemeFromOdoo(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  if (!cookieHeader.includes('session_id=')) return null;

  try {
    const res = await fetch(ODOO_THEME_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !data?.authenticated) return null;
    return parseTheme(data.theme);
  } catch {
    return null; // Odoo unreachable — fall back to cookie / default
  }
}

/**
 * Build a Set-Cookie header value for the snabbb-theme cookie.
 * Domain=.snabbb.com so it's readable by all subdomains.
 */
function buildThemeCookie(theme) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(theme)}`,
    'Path=/',
    `Domain=${COOKIE_DOMAIN}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'SameSite=Lax',
    'Secure',
  ].join('; ');
}

/**
 * Determine if a request is a browser navigation (HTML page load).
 * We only inject theme into HTML responses, not JS/CSS/image assets.
 */
function isHtmlRequest(request) {
  const accept = request.headers.get('Accept') || '';
  if (!accept.includes('text/html')) return false;
  const url = new URL(request.url);
  const path = url.pathname;
  // Skip API routes and static asset extensions
  if (path.startsWith('/api/')) return false;
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json|webp|avif)$/i.test(path)) return false;
  return true;
}

/**
 * Inject the theme script tag into the HTML <head>, right before
 * the existing bootstrap script so it can read window.__SNABBB_THEME__.
 *
 * Uses HTMLRewriter for streaming — no need to buffer the whole response.
 */
class ThemeInjector {
  constructor(theme) {
    this.theme = theme;
    this.injected = false;
  }

  element(element) {
    if (this.injected) return;
    this.injected = true;
    // Inject as the very first child of <head> so it runs before everything else
    element.prepend(
      `<script>window.__SNABBB_THEME__=${JSON.stringify(this.theme)};</script>`,
      { html: true }
    );
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url =
        new URL(request.url);

    /*
     * Handle Wallet before the generic static
     * asset forwarding logic.
     */
    if (
        url.pathname ===
        '/api/wallet'
    ) {
        return proxyWalletRequest(
            request
        );
    }

    if (url.pathname === '/ticketing/sso') {
      return handleTicketingSso(request, env);
    }

    // Non-HTML requests pass straight through to Pages static assets
    if (!isHtmlRequest(request)) {
      return env.ASSETS.fetch(request);
    }

    // ── Step 1: Fast path — check if we already have a cookie ──────────────
    const cookieTheme = readThemeCookie(request);

    // ── Step 2: Slow path — fetch from Odoo if user has a session ──────────
    // Run both in parallel: fetch the static HTML AND call Odoo simultaneously.
    // We only wait for Odoo if there's a session_id cookie (authenticated user).
    const hasSession = (request.headers.get('Cookie') || '').includes('session_id=');

    let odooTheme = null;

    if (!cookieTheme && hasSession) {
      // No cookie yet — ask Odoo (first load after login from another device, etc.)
      odooTheme = await fetchThemeFromOdoo(request);
    } else if (hasSession) {
      // We have a cookie but also have a session — validate in background
      // (don't await — use ctx.waitUntil so it doesn't block the response)
      ctx.waitUntil(
        fetchThemeFromOdoo(request).then((serverTheme) => {
          // Nothing to do here — we already responded with cookieTheme.
          // On the NEXT request the cookie will be refreshed if they differ.
          // This background fetch is just for telemetry / future use.
        })
      );
    }

    // ── Step 3: Resolve final theme ──────────────────────────────────────────
    // Priority: Odoo (cross-device truth) > cookie > default
    const theme = odooTheme || cookieTheme || DEFAULT_THEME;

    // ── Step 4: Fetch the static HTML from Pages ──────────────────────────────
    const pageResponse = await env.ASSETS.fetch(request);

    if (!pageResponse.ok || !pageResponse.headers.get('Content-Type')?.includes('text/html')) {
      return pageResponse;
    }

    // ── Step 5: Inject theme + refresh cookie ────────────────────────────────
    const newHeaders = new Headers(pageResponse.headers);

    // Refresh / set the snabbb-theme cookie on every HTML response.
    // This keeps the cookie alive even if the user never visits gallery.
    newHeaders.append('Set-Cookie', buildThemeCookie(theme));

    // Use HTMLRewriter to stream-inject the theme script into <head>
    const injectedResponse = new HTMLRewriter()
      .on('head', new ThemeInjector(theme))
      .transform(
        new Response(pageResponse.body, {
          status: pageResponse.status,
          headers: newHeaders,
        })
      );

    return injectedResponse;
  },
};
