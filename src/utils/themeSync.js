const THEME_COOKIE_NAME = 'snabbb-theme';
const LOCAL_THEME_KEYS = ['theme', 'snabbb-theme'];
const VALID_THEME_VALUES = new Set(['light', 'dark', 'system']);
const SYNC_EVENT_NAME = 'snabbb:theme-sync';
const POST_MESSAGE_TYPE = 'SNABBB_THEME_SYNC';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const getCookieDomain = () => {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
    return '';
  }

  if (hostname === 'snabbb.com' || hostname.endsWith('.snabbb.com')) {
    return '.snabbb.com';
  }

  return '';
};

export const normalizeTheme = (value) => {
  if (!value) return null;

  let raw = String(value).trim();

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') raw = parsed;
    if (parsed?.state?.theme) raw = parsed.state.theme;
    if (parsed?.theme) raw = parsed.theme;
  } catch {
    // Raw string cookie/localStorage value.
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

export const readStoredTheme = () => {
  if (typeof window === 'undefined') return null;

  const cookieTheme = readThemeCookie();
  if (cookieTheme) return cookieTheme;

  for (const key of LOCAL_THEME_KEYS) {
    const localTheme = normalizeTheme(window.localStorage?.getItem(key));
    if (localTheme) return localTheme;
  }

  return null;
};

export const persistTheme = (theme) => {
  if (typeof window === 'undefined') return;

  const normalized = normalizeTheme(theme) || 'light';

  writeThemeCookie(normalized);

  try {
    window.localStorage.setItem('theme', normalized);
    window.localStorage.setItem('snabbb-theme', normalized);
  } catch {
    // Ignore private browsing/localStorage failures.
  }
};

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
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, '*');
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  } catch {
    // Ignore postMessage restrictions.
  }
};

export const THEME_SYNC = {
  cookieName: THEME_COOKIE_NAME,
  eventName: SYNC_EVENT_NAME,
  messageType: POST_MESSAGE_TYPE,
};
