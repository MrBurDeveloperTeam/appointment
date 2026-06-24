/**
 * themeSync.js — Single source of truth for Snabbb theme sync.
 *
 * HYBRID STRATEGY
 * ───────────────
 * 1. On first load:
 *    a) Read .snabbb.com cookie INSTANTLY → apply theme with zero flash.
 *    b) In background, fetch /api/user/theme from Odoo (authenticated users only).
 *    c) If Odoo returns a different value → update cookie + re-apply theme.
 *
 * 2. On theme change:
 *    a) Write cookie immediately (cross-subdomain, all *.snabbb.com apps pick it up).
 *    b) Write to Odoo in background (cross-device persistence, fire and forget).
 *
 * 3. Live sync (same browser):
 *    a) `storage` event — instant, same-origin tabs only.
 *    b) 1s cookie poll — cross-subdomain fallback (catches Zustand writes from app.snabbb.com).
 *
 * IMPORTANT — localStorage key ownership:
 *   `snabbb-theme` is OWNED by Zustand on app.snabbb.com.
 *   This app must NOT write to `localStorage['snabbb-theme']` as a plain string —
 *   it would corrupt Zustand's JSON rehydration.
 *   We only write to `localStorage['theme']` (the mini-app safe key).
 */

const THEME_COOKIE_NAME = 'snabbb-theme';
const LOCAL_THEME_KEY = 'theme';           // mini-app safe key — do NOT use 'snabbb-theme'
const VALID_THEME_VALUES = new Set(['light', 'dark', 'system']);
const SYNC_EVENT_NAME = 'snabbb:theme-sync';
const POST_MESSAGE_TYPE = 'SNABBB_THEME_SYNC';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ODOO_THEME_ENDPOINT = '/api/user/theme'; // proxied by Cloudflare Worker

// ─── Cookie domain ────────────────────────────────────────────────────────────

const getCookieDomain = () => {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return '';
  if (hostname === 'snabbb.com' || hostname.endsWith('.snabbb.com')) return '.snabbb.com';
  return '';
};

// ─── Normalization ────────────────────────────────────────────────────────────

export const normalizeTheme = (value) => {
  if (!value) return null;
  let raw = String(value).trim();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') raw = parsed;
    else if (parsed?.state?.theme) raw = parsed.state.theme;
    else if (parsed?.theme) raw = parsed.theme;
  } catch {
    // Raw string — use as-is.
  }
  raw = String(raw).trim().toLowerCase();
  return VALID_THEME_VALUES.has(raw) ? raw : null;
};

export const getSystemTheme = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const resolveTheme = (theme) => {
  const normalized = normalizeTheme(theme);
  if (normalized === 'system') return getSystemTheme();
  return normalized || 'light';
};

// ─── Cookie ───────────────────────────────────────────────────────────────────

export const readThemeCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${THEME_COOKIE_NAME}=`));
  if (!match) return null;
  return normalizeTheme(decodeURIComponent(match.split('=').slice(1).join('=')));
};

export const writeThemeCookie = (theme) => {
  if (typeof document === 'undefined') return;
  const normalized = normalizeTheme(theme) || 'light';
  const domain = getCookieDomain();
  const domainPart = domain ? `; Domain=${domain}` : '';
  document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${domainPart}`;
};

// ─── Local storage (mini-app safe) ───────────────────────────────────────────

export const readStoredTheme = () => {
  if (typeof window === 'undefined') return null;

  // 1. Cookie is fastest and cross-subdomain
  const cookieTheme = readThemeCookie();
  if (cookieTheme) return cookieTheme;

  // 2. Mini-app's own localStorage key
  const localTheme = normalizeTheme(window.localStorage?.getItem(LOCAL_THEME_KEY));
  if (localTheme) return localTheme;

  // 3. Try Zustand key READ-ONLY (parse JSON — do not write back as plain string)
  const zustandTheme = normalizeTheme(window.localStorage?.getItem('snabbb-theme'));
  if (zustandTheme) return zustandTheme;

  return null;
};

export const writeStoredTheme = (theme) => {
  if (typeof window === 'undefined') return;
  const normalized = normalizeTheme(theme) || 'light';
  try {
    // Only write to 'theme' — never to 'snabbb-theme' (owned by Zustand on app.snabbb.com)
    window.localStorage.setItem(LOCAL_THEME_KEY, normalized);
  } catch {
    // Private browsing — ignore.
  }
};

// Keep old export name for backward compatibility with any code using persistTheme()
export const persistTheme = (theme) => {
  writeThemeCookie(theme);
  writeStoredTheme(theme);
};

// ─── DOM application ──────────────────────────────────────────────────────────

export const applyThemeToDocument = (theme) => {
  if (typeof document === 'undefined') return;
  const normalized = normalizeTheme(theme) || 'light';
  const resolved = resolveTheme(normalized);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.dataset.themePreference = normalized;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
};

// ─── Cross-tab broadcast ──────────────────────────────────────────────────────

export const broadcastTheme = (theme) => {
  if (typeof window === 'undefined') return;
  const normalized = normalizeTheme(theme) || 'light';
  const payload = {
    type: POST_MESSAGE_TYPE,
    theme: normalized,
    resolvedTheme: resolveTheme(normalized),
    source: 'appointment',
    timestamp: Date.now(),
  };
  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail: payload }));
  try {
    window.postMessage(payload, window.location.origin);
    if (window.opener && !window.opener.closed) window.opener.postMessage(payload, '*');
    if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
  } catch {
    // Ignore postMessage restrictions.
  }
};

// ─── Odoo REST sync ───────────────────────────────────────────────────────────

let _odooSyncInFlight = false;

/**
 * Fetch theme from Odoo in the background.
 * If Odoo returns a theme different from the current cookie, onThemeChange is called.
 * Safe to call on every app load — no-ops gracefully if unauthenticated or Odoo is down.
 *
 * @param {function} onThemeChange  Called with (theme: string) if Odoo differs from cookie.
 */
export const syncThemeFromOdoo = async (onThemeChange) => {
  if (_odooSyncInFlight) return;
  _odooSyncInFlight = true;
  try {
    const res = await fetch(ODOO_THEME_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.authenticated) return; // guest — nothing to sync

    const odooTheme = normalizeTheme(data.theme);
    if (!odooTheme) return;

    const cookieTheme = readThemeCookie();
    if (odooTheme !== cookieTheme) {
      // Odoo has a more up-to-date (cross-device) value — apply it
      writeThemeCookie(odooTheme);
      writeStoredTheme(odooTheme);
      if (onThemeChange) onThemeChange(odooTheme);
    }
  } catch {
    // Network/Odoo unavailable — cookie remains active, no disruption.
  } finally {
    _odooSyncInFlight = false;
  }
};

/**
 * Persist theme to Odoo in the background (fire and forget).
 * Call this whenever the user changes their theme.
 *
 * @param {string} theme  'light' | 'dark' | 'system'
 */
export const pushThemeToOdoo = async (theme) => {
  const normalized = normalizeTheme(theme);
  if (!normalized) return;
  try {
    await fetch(ODOO_THEME_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: normalized }),
    });
  } catch {
    // Odoo unavailable — cookie is still correct, next load will re-sync.
  }
};

// ─── Constants (exported for consumers) ──────────────────────────────────────

export const THEME_SYNC = {
  cookieName: THEME_COOKIE_NAME,
  eventName: SYNC_EVENT_NAME,
  messageType: POST_MESSAGE_TYPE,
  localStorageKey: LOCAL_THEME_KEY,
  odooEndpoint: ODOO_THEME_ENDPOINT,
};