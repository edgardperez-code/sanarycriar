// Unit tests for src/lib/newsletter.ts (newsletter pop-up and footer form).
// Run with `npm run test:newsletter` (Node 22.18+/24 strips the TypeScript types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NEWSLETTER_DISMISSED_KEY,
  NEWSLETTER_SUBSCRIBED_KEY,
  fetchNewsletterConfig,
  isExcludedPath,
  isValidEmail,
  markDismissed,
  markSubscribed,
  normalizeEmail,
  parseNewsletterConfig,
  shouldOfferPopup,
  subscribeToNewsletter,
} from '../src/lib/newsletter.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 26, 14, 0, 0);

/** In-memory Storage double. */
function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
  };
}

test('isValidEmail accepts common addresses', () => {
  for (const email of ['ana@example.com', 'ana.perez+boletin@gmail.com', 'a_b@sub.dominio.com.ve', ' Ana@Example.com ']) {
    assert.equal(isValidEmail(email), true, email);
  }
});

test('isValidEmail rejects malformed addresses', () => {
  const longest = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
  assert.equal(longest.length, 254);
  assert.equal(isValidEmail(longest), true, '254 characters is the limit');
  const tooLong = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`;
  assert.equal(tooLong.length, 255);
  const invalid = [
    '',
    'ana',
    'ana@',
    '@example.com',
    'ana@example',
    'ana..b@example.com',
    '.ana@example.com',
    'ana.@example.com',
    'ana@-x.com',
    'ana@example.c',
    'ana perez@example.com',
    'ñandu@example.com',
    tooLong,
  ];
  for (const email of invalid) {
    assert.equal(isValidEmail(email), false, JSON.stringify(email));
  }
  assert.equal(isValidEmail(`${' '.repeat(310)}ana@example.com`), false, 'raw input over 320 characters');
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
});

test('isExcludedPath matches legal pages and the 404 only', () => {
  for (const path of ['/privacidad', '/privacidad.html', '/terminos/', '/reembolsos', '/404']) {
    assert.equal(isExcludedPath(path), true, path);
  }
  for (const path of ['/', '/cursos', '/links']) {
    assert.equal(isExcludedPath(path), false, path);
  }
});

test('shouldOfferPopup follows the stored marks', () => {
  assert.equal(shouldOfferPopup(null, NOW), false, 'no storage: never show');
  assert.equal(shouldOfferPopup(fakeStorage(), NOW), true, 'empty storage');

  const subscribed = fakeStorage({ [NEWSLETTER_SUBSCRIBED_KEY]: JSON.stringify({ at: NOW - DAY }) });
  assert.equal(shouldOfferPopup(subscribed, NOW), false, 'subscribed');

  const future = fakeStorage({ [NEWSLETTER_DISMISSED_KEY]: JSON.stringify({ until: NOW + DAY }) });
  assert.equal(shouldOfferPopup(future, NOW), false, 'dismissed until a future date');

  const past = fakeStorage({ [NEWSLETTER_DISMISSED_KEY]: JSON.stringify({ until: NOW - 1 }) });
  assert.equal(shouldOfferPopup(past, NOW), true, 'dismissal expired');

  const implausible = fakeStorage({ [NEWSLETTER_DISMISSED_KEY]: JSON.stringify({ until: NOW + 367 * DAY }) });
  assert.equal(shouldOfferPopup(implausible, NOW), true, 'more than 366 days ahead');
  assert.equal(implausible.map.has(NEWSLETTER_DISMISSED_KEY), false, 'implausible mark removed');

  const broken = fakeStorage({ [NEWSLETTER_DISMISSED_KEY]: '{not json' });
  assert.equal(shouldOfferPopup(broken, NOW), true, 'broken JSON');
  assert.equal(broken.map.has(NEWSLETTER_DISMISSED_KEY), false, 'broken mark removed');
});

test('shouldOfferPopup never throws when storage does', () => {
  const throwing = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(shouldOfferPopup(throwing, NOW), false);
  assert.doesNotThrow(() => markDismissed(throwing, 30, NOW));
  assert.doesNotThrow(() => markSubscribed(throwing, NOW));
});

test('markDismissed and markSubscribed store the expected JSON', () => {
  const storage = fakeStorage();
  markDismissed(storage, 30, NOW);
  assert.deepEqual(JSON.parse(storage.getItem(NEWSLETTER_DISMISSED_KEY)), { until: NOW + 30 * 86_400_000 });
  assert.equal(shouldOfferPopup(storage, NOW + 29 * DAY), false);
  assert.equal(shouldOfferPopup(storage, NOW + 31 * DAY), true);

  markSubscribed(storage, NOW);
  assert.deepEqual(JSON.parse(storage.getItem(NEWSLETTER_SUBSCRIBED_KEY)), { at: NOW });
  assert.equal(shouldOfferPopup(storage, NOW + 400 * DAY), false);
});

test('parseNewsletterConfig maps, trims, cuts and clamps', () => {
  const config = parseNewsletterConfig({
    enabled: true,
    title: `  ${'T'.repeat(130)}  `,
    body: '  Hola\n\nmundo  ',
    button_label: ' Quiero recibirlas ',
    dismiss_label: 'Ahora no',
    success_message: '¡Gracias!',
    privacy_note: '',
    delay_seconds: 500,
    dismiss_days: 0,
  });
  assert.ok(config);
  assert.equal(config.enabled, true);
  assert.equal(config.title, 'T'.repeat(120));
  assert.equal(config.body, 'Hola\n\nmundo');
  assert.equal(config.buttonLabel, 'Quiero recibirlas');
  assert.equal(config.dismissLabel, 'Ahora no');
  assert.equal(config.successMessage, '¡Gracias!');
  assert.equal(config.privacyNote, '');
  assert.equal(config.delaySeconds, 120);
  assert.equal(config.dismissDays, 1);

  const low = parseNewsletterConfig({ title: 'a', body: 'b', button_label: 'c', delay_seconds: -5, dismiss_days: 9999 });
  assert.equal(low.delaySeconds, 0);
  assert.equal(low.dismissDays, 365);

  const notNumbers = parseNewsletterConfig({ title: 'a', body: 'b', button_label: 'c', delay_seconds: 'x', dismiss_days: null });
  assert.equal(notNumbers.delaySeconds, 0);
  assert.equal(notNumbers.dismissDays, 30);
});

test('parseNewsletterConfig rejects unusable values', () => {
  assert.equal(parseNewsletterConfig({ title: '   ', body: 'b', button_label: 'c', enabled: true }), null);
  assert.equal(parseNewsletterConfig({ body: 'b', button_label: 'c' }), null);
  assert.equal(parseNewsletterConfig({ title: 'a', body: '', button_label: 'c' }), null);
  assert.equal(parseNewsletterConfig({ title: 'a', body: 'b', button_label: '' }), null);
  assert.equal(parseNewsletterConfig(null), null);
  assert.equal(parseNewsletterConfig('hola'), null);
  assert.equal(parseNewsletterConfig([1, 2]), null);
  assert.equal(parseNewsletterConfig({ title: 'a', body: 'b', button_label: 'c', enabled: 'true' }).enabled, false);
  assert.equal(parseNewsletterConfig({ title: 'a', body: 'b', button_label: 'c', enabled: 1 }).enabled, false);
});

test('subscribeToNewsletter maps the HTTP outcome and keeps the e-mail out of the URL', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const calls = [];
  const respondWith = (status) => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(status === 200 ? '{"ok":true}' : '{}', { status, headers: { 'Content-Type': 'application/json' } });
    };
  };
  const send = () =>
    subscribeToNewsletter({
      apiBase: 'http://localhost:1338/api/v1/',
      orgId: 1,
      email: ' Ana@Example.com ',
      website: '',
      source: 'popup',
      page: '/cursos',
    });

  const expected = { 200: 'ok', 201: 'ok', 400: 'invalid', 422: 'invalid', 429: 'rate_limited', 500: 'error', 404: 'error' };
  for (const [status, result] of Object.entries(expected)) {
    respondWith(Number(status));
    assert.equal(await send(), result, `HTTP ${status}`);
  }

  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  assert.equal(await send(), 'error', 'network failure');

  assert.ok(calls.length > 0);
  for (const { url, init } of calls) {
    assert.equal(url, 'http://localhost:1338/api/v1/newsletter/1/subscribe');
    assert.ok(!url.toLowerCase().includes('ana'), 'e-mail not in the URL');
    assert.ok(!url.includes('%40'), 'e-mail not in the URL (encoded)');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { email: 'ana@example.com', website: '', source: 'popup', page: '/cursos' });
  }
});

test('subscribeToNewsletter returns error when the caller aborts', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (_url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  const controller = new AbortController();
  const pending = subscribeToNewsletter({
    apiBase: 'http://localhost:1338/api/v1',
    orgId: 1,
    email: 'ana@example.com',
    website: '',
    source: 'footer',
    page: '/',
    signal: controller.signal,
  });
  controller.abort();
  assert.equal(await pending, 'error');
});

test('fetchNewsletterConfig returns the parsed config or null on any failure', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const opts = { apiBase: 'http://localhost:1338/api/v1', orgId: 1 };
  const payload = {
    enabled: true,
    title: 'Recibe ideas',
    body: 'Texto',
    button_label: 'Quiero',
    dismiss_label: 'Ahora no',
    success_message: 'Gracias',
    privacy_note: '',
    delay_seconds: 0,
    dismiss_days: 30,
  };

  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const config = await fetchNewsletterConfig(opts);
  assert.equal(config.enabled, true);
  assert.equal(config.buttonLabel, 'Quiero');
  assert.equal(seen.url, 'http://localhost:1338/api/v1/newsletter/1/public-config');
  assert.equal(seen.init.credentials, 'omit');
  assert.deepEqual(seen.init.headers, { Accept: 'application/json' });

  globalThis.fetch = async () => new Response('{}', { status: 500 });
  assert.equal(await fetchNewsletterConfig(opts), null, 'HTTP 500');

  globalThis.fetch = async () => new Response('not json', { status: 200 });
  assert.equal(await fetchNewsletterConfig(opts), null, 'invalid JSON');

  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  assert.equal(await fetchNewsletterConfig(opts), null, 'API down');
});
