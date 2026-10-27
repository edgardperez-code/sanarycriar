/**
 * Newsletter sign-up shared by the pop-up (NewsletterPopup) and the footer
 * form (NewsletterFooterForm). The course platform stores the e-mail:
 *   GET  {apiBase}/newsletter/{orgId}/public-config
 *   POST {apiBase}/newsletter/{orgId}/subscribe
 *
 * Sanar y Criar: no imports and erasable-only TypeScript (no enum/namespace),
 * so `node --test scripts/test-newsletter.mjs` can import this file as is.
 * Storage access is always wrapped in try/catch: it can be missing or blocked
 * (private mode, previews), and nothing here may throw.
 */

/** Set when this browser subscribed. Value: JSON {"at": <ms>}. */
export const NEWSLETTER_SUBSCRIBED_KEY = 'sanarycriar:boletin:suscrito:v1';
/** Set when the pop-up was closed without subscribing. Value: JSON {"until": <ms>}. */
export const NEWSLETTER_DISMISSED_KEY = 'sanarycriar:boletin:cerrado:v1';
/** Pages where the pop-up never opens (legal pages and the 404). */
export const NEWSLETTER_EXCLUDED_PATHS = ['/privacidad', '/terminos', '/reembolsos', '/404'] as const;
/** Same expression as the API (src/services/newsletter/common.py), applied to the normalized e-mail. */
export const EMAIL_RE =
  /^(?=.{3,254}$)(?=[^@]{1,64}@)[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface NewsletterConfig {
  enabled: boolean;
  title: string;
  body: string;
  buttonLabel: string;
  dismissLabel: string;
  successMessage: string;
  privacyNote: string;
  delaySeconds: number;
  dismissDays: number;
}

export type SubscribeResult = 'ok' | 'invalid' | 'rate_limited' | 'error';
export type NewsletterSource = 'popup' | 'footer';

/** Visible messages shared by both forms (the configurable texts come from the API). */
export const NEWSLETTER_MESSAGES = {
  invalidEmail: 'Escribe un correo válido, por ejemplo nombre@gmail.com.',
  sending: 'Enviando…',
  invalid: 'Revisa tu correo: parece que falta algo.',
  rate_limited: 'Hiciste varios intentos seguidos. Espera unos minutos e inténtalo de nuevo.',
  error: 'No pudimos guardar tu correo. Inténtalo de nuevo en un momento.',
} as const;

const DAY_MS = 86_400_000;
/** A "closed" mark further away than this was not written by us: drop it. */
const MAX_DISMISS_AHEAD_MS = 366 * DAY_MS;
const PROBE_KEY = 'sanarycriar:probe';
const SUBSCRIBE_TIMEOUT_MS = 10_000;
const MAX_EMAIL_INPUT = 320;

/** Text limits of the API settings (contract B.3), in characters. */
const TEXT_LIMITS = {
  title: 120,
  body: 500,
  buttonLabel: 40,
  dismissLabel: 40,
  successMessage: 300,
  privacyNote: 300,
} as const;

/** Fallbacks for texts the API always sends; only used if a value comes back empty. */
const FALLBACK_DISMISS_LABEL = 'Ahora no';
const FALLBACK_SUCCESS_MESSAGE = '¡Listo, gracias por sumarte! Muy pronto te llegará mi primer correo.';

export function normalizeEmail(value: string): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  if (typeof value !== 'string' || value.length > MAX_EMAIL_INPUT) return false;
  return EMAIL_RE.test(normalizeEmail(value));
}

/** "/terminos/", "/privacidad.html" and "/x/index" match like their clean route (see routePath in nav.ts). */
export function isExcludedPath(pathname: string): boolean {
  const path =
    String(pathname ?? '')
      .replace(/\.html$/, '')
      .replace(/\/index$/, '')
      .replace(/\/+$/, '') || '/';
  return (NEWSLETTER_EXCLUDED_PATHS as readonly string[]).includes(path);
}

/** localStorage when it can actually be written, otherwise null. */
export function getStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

/** Parsed JSON value, or `undefined` when there is no value or it is not valid JSON. */
function parseJson(raw: string | null): { value: unknown } | undefined {
  if (raw === null) return undefined;
  try {
    return { value: JSON.parse(raw) as unknown };
  } catch {
    return undefined;
  }
}

function safeRemove(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing else to do.
  }
}

/**
 * Whether the pop-up may open in this browser. Without storage we cannot
 * remember a "no", so the pop-up stays closed.
 */
export function shouldOfferPopup(storage: KeyValueStorage | null, now: number = Date.now()): boolean {
  if (!storage) return false;
  try {
    if (parseJson(storage.getItem(NEWSLETTER_SUBSCRIBED_KEY))) return false;

    const dismissedRaw = storage.getItem(NEWSLETTER_DISMISSED_KEY);
    if (dismissedRaw !== null) {
      const dismissed = parseJson(dismissedRaw);
      const until =
        dismissed && dismissed.value && typeof dismissed.value === 'object'
          ? (dismissed.value as { until?: unknown }).until
          : undefined;
      if (typeof until !== 'number' || !Number.isFinite(until) || until > now + MAX_DISMISS_AHEAD_MS) {
        // Broken or implausible mark: forget it.
        safeRemove(storage, NEWSLETTER_DISMISSED_KEY);
      } else if (until > now) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function markSubscribed(storage: KeyValueStorage | null, now: number = Date.now()): void {
  if (!storage) return;
  try {
    storage.setItem(NEWSLETTER_SUBSCRIBED_KEY, JSON.stringify({ at: now }));
  } catch {
    // Storage full or blocked: the pop-up may show again, nothing breaks.
  }
}

export function markDismissed(storage: KeyValueStorage | null, days: number, now: number = Date.now()): void {
  if (!storage) return;
  const safeDays = Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 30;
  try {
    storage.setItem(NEWSLETTER_DISMISSED_KEY, JSON.stringify({ until: now + safeDays * DAY_MS }));
  } catch {
    // Storage full or blocked.
  }
}

/** Cuts by characters (code points), like the API counts them. */
function cut(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('').trim() : value;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? cut(value.trim(), max) : '';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** API public config (snake_case) to NewsletterConfig, or null when unusable. */
export function parseNewsletterConfig(raw: unknown): NewsletterConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const title = text(data.title, TEXT_LIMITS.title);
  const body = text(data.body, TEXT_LIMITS.body);
  const buttonLabel = text(data.button_label, TEXT_LIMITS.buttonLabel);
  if (!title || !body || !buttonLabel) return null;
  return {
    enabled: data.enabled === true,
    title,
    body,
    buttonLabel,
    dismissLabel: text(data.dismiss_label, TEXT_LIMITS.dismissLabel) || FALLBACK_DISMISS_LABEL,
    successMessage: text(data.success_message, TEXT_LIMITS.successMessage) || FALLBACK_SUCCESS_MESSAGE,
    privacyNote: text(data.privacy_note, TEXT_LIMITS.privacyNote),
    delaySeconds: clampInt(data.delay_seconds, 0, 120, 0),
    dismissDays: clampInt(data.dismiss_days, 1, 365, 30),
  };
}

function endpoint(apiBase: string, orgId: number, path: string): string {
  return `${String(apiBase).replace(/\/+$/, '')}/newsletter/${encodeURIComponent(String(orgId))}/${path}`;
}

/** Public pop-up settings. Any failure (network, CORS, bad JSON) gives null. */
export async function fetchNewsletterConfig(opts: {
  apiBase: string;
  orgId: number;
  signal?: AbortSignal;
}): Promise<NewsletterConfig | null> {
  try {
    // Simple request (GET + Accept only): no CORS preflight, no cookies.
    const response = await fetch(endpoint(opts.apiBase, opts.orgId, 'public-config'), {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
    if (!response.ok) return null;
    return parseNewsletterConfig(await response.json());
  } catch {
    return null;
  }
}

/**
 * Sends the sign-up. The e-mail only travels in the JSON body, never in the
 * URL. The API answers the same for new and repeated e-mails.
 */
export async function subscribeToNewsletter(opts: {
  apiBase: string;
  orgId: number;
  email: string;
  website: string;
  source: NewsletterSource;
  page: string;
  signal?: AbortSignal;
}): Promise<SubscribeResult> {
  // Own timeout linked to the caller's signal (AbortSignal.any/timeout are missing in older Safari).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUBSCRIBE_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  else opts.signal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const response = await fetch(endpoint(opts.apiBase, opts.orgId, 'subscribe'), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        email: normalizeEmail(opts.email),
        website: opts.website,
        source: opts.source,
        page: opts.page,
      }),
      signal: controller.signal,
    });
    if (response.ok) return 'ok';
    if (response.status === 400 || response.status === 422) return 'invalid';
    if (response.status === 429) return 'rate_limited';
    return 'error';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}
