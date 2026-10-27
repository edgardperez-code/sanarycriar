// Unit tests for src/lib/blog.ts (parsers, RSS, sitemap and the API client).
// Run with `npm run test:blog` (Node 22.18+/24 strips the TypeScript types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOG_KIND_LABELS,
  buildRss,
  buildSitemap,
  createBlogClient,
  escapeXml,
  isBlogSlug,
  parseBlogCard,
  parseBlogList,
  parseBlogPost,
  parseBlogSitemap,
} from '../src/lib/blog.ts';

const ASSETS = 'https://cursos.example.com';

function rawCard(overrides = {}) {
  return {
    slug: 'rabietas-primera-infancia',
    title: 'Rabietas en la primera infancia',
    excerpt: 'Cómo acompañarlas sin perder la calma.',
    kind: 'informativo',
    category: 'emociones',
    category_label: 'Emociones',
    cover_url: 'https://cursos.example.com/content/orgs/o/blog/p/cover-abc.webp',
    cover_alt: 'Una madre abraza a su hija',
    published_at: '2026-10-26T14:00:00+00:00',
    updated_at: '2026-10-26T15:30:00+00:00',
    reading_minutes: 5,
    ...overrides,
  };
}

function rawPost(overrides = {}) {
  return {
    ...rawCard(),
    summary: 'Resumen breve.',
    key_takeaways: ['Idea uno', '  ', 'Idea dos', 7],
    content_html: '<h2 id="hola">Hola</h2><p>Texto.</p>',
    faq: [{ question: '¿Pregunta?', answer: 'Respuesta.' }, { question: 'Sin respuesta', answer: '' }, 'x'],
    meta_title: '',
    meta_description: '',
    keywords: ['rabietas', 'crianza'],
    word_count: 1180,
    og_image_url: '/content/orgs/o/blog/p/og-abc.jpg',
    ...overrides,
  };
}

/** Fake fetch: answers from a queue of handlers and records the calls. */
function fakeFetch(...handlers) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const handler = handlers.length > 1 ? handlers.shift() : handlers[0];
    return handler(String(url), init);
  };
  return { impl, calls };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Silences the client's console.warn during a test. */
function quiet(t) {
  t.mock.method(console, 'warn', () => {});
}

test('isBlogSlug follows the slug rules (3–80, lowercase, single hyphens)', () => {
  for (const slug of ['abc', 'que-hago-con-las-rabietas', 'taller-15-11-lecheria', 'a'.repeat(80)]) {
    assert.equal(isBlogSlug(slug), true, slug);
  }
  for (const slug of ['', 'ab', 'a'.repeat(81), 'Mayus', 'con--doble', '-inicio', 'fin-', 'ñandu', 'a b', '../etc', 42, null]) {
    assert.equal(isBlogSlug(slug), false, String(slug));
  }
});

test('parseBlogCard converts snake_case to camelCase', () => {
  const card = parseBlogCard(rawCard(), ASSETS);
  assert.deepEqual(card, {
    slug: 'rabietas-primera-infancia',
    title: 'Rabietas en la primera infancia',
    excerpt: 'Cómo acompañarlas sin perder la calma.',
    kind: 'informativo',
    category: 'emociones',
    categoryLabel: 'Emociones',
    coverUrl: 'https://cursos.example.com/content/orgs/o/blog/p/cover-abc.webp',
    coverAlt: 'Una madre abraza a su hija',
    publishedAt: new Date('2026-10-26T14:00:00Z'),
    updatedAt: new Date('2026-10-26T15:30:00Z'),
    readingMinutes: 5,
  });
});

test('parseBlogCard discards unusable items', () => {
  assert.equal(parseBlogCard(null), null);
  assert.equal(parseBlogCard('texto'), null);
  assert.equal(parseBlogCard([]), null);
  assert.equal(parseBlogCard(rawCard({ slug: 'No Valido' })), null);
  assert.equal(parseBlogCard(rawCard({ slug: undefined })), null);
  assert.equal(parseBlogCard(rawCard({ title: '   ' })), null);
  assert.equal(parseBlogCard(rawCard({ title: 12 })), null);
  assert.equal(parseBlogCard(rawCard({ published_at: 'ayer' })), null);
  assert.equal(parseBlogCard(rawCard({ published_at: null })), null);
  assert.equal(parseBlogCard(rawCard({ updated_at: '2026-13-45' })), null);
});

test('parseBlogCard: unknown kind, missing label and odd numbers fall back', () => {
  const card = parseBlogCard(
    rawCard({ kind: 'podcast', category: 'sueno-y-rutinas', category_label: undefined, reading_minutes: 'cinco', cover_alt: null, excerpt: 3 }),
  );
  assert.equal(card.kind, 'informativo');
  assert.equal(card.categoryLabel, 'Sueño y rutinas');
  assert.equal(card.readingMinutes, 1);
  assert.equal(card.coverAlt, '');
  assert.equal(card.excerpt, '');
  assert.equal(parseBlogCard(rawCard({ kind: 'taller' })).kind, 'taller');
  assert.equal(parseBlogCard(rawCard({ kind: 'novedad' })).kind, 'novedad');
  assert.equal(BLOG_KIND_LABELS.informativo, 'Artículo');
});

test('cover URLs: relative paths resolve against assetBase; only http(s)', () => {
  assert.equal(
    parseBlogCard(rawCard({ cover_url: '/content/orgs/o/blog/p/c.webp' }), ASSETS).coverUrl,
    'https://cursos.example.com/content/orgs/o/blog/p/c.webp',
  );
  assert.equal(parseBlogCard(rawCard({ cover_url: '/content/c.webp' })).coverUrl, null, 'relative without base');
  assert.equal(parseBlogCard(rawCard({ cover_url: 'javascript:alert(1)' }), ASSETS).coverUrl, null);
  assert.equal(parseBlogCard(rawCard({ cover_url: 'data:image/png;base64,AAAA' }), ASSETS).coverUrl, null);
  assert.equal(parseBlogCard(rawCard({ cover_url: null }), ASSETS).coverUrl, null);
  assert.equal(parseBlogCard(rawCard({ cover_url: 'http://localhost:1338/content/c.webp' }), ASSETS).coverUrl, 'http://localhost:1338/content/c.webp');
});

test('parseBlogPost: lists are cleaned and meta fields fall back to title/excerpt', () => {
  const post = parseBlogPost(rawPost(), ASSETS);
  assert.deepEqual(post.keyTakeaways, ['Idea uno', 'Idea dos']);
  assert.deepEqual(post.faq, [{ question: '¿Pregunta?', answer: 'Respuesta.' }]);
  assert.equal(post.metaTitle, 'Rabietas en la primera infancia');
  assert.equal(post.metaDescription, 'Cómo acompañarlas sin perder la calma.');
  assert.equal(post.contentHtml, '<h2 id="hola">Hola</h2><p>Texto.</p>');
  assert.equal(post.wordCount, 1180);
  assert.equal(post.ogImageUrl, 'https://cursos.example.com/content/orgs/o/blog/p/og-abc.jpg');
  assert.deepEqual(post.keywords, ['rabietas', 'crianza']);

  const withMeta = parseBlogPost(rawPost({ meta_title: 'Meta', meta_description: 'Descripción', og_image_url: 'javascript:x', word_count: -3 }));
  assert.equal(withMeta.metaTitle, 'Meta');
  assert.equal(withMeta.metaDescription, 'Descripción');
  assert.equal(withMeta.ogImageUrl, null);
  assert.equal(withMeta.wordCount, 0);
  assert.equal(parseBlogPost(rawPost({ content_html: null })).contentHtml, '');
  assert.equal(parseBlogPost(rawPost({ slug: 'MAL' })), null);
});

test('parseBlogList keeps valid items and computes the pages', () => {
  const page = parseBlogList({ items: [rawCard(), rawCard({ slug: '!!' }), rawCard({ slug: 'otro-articulo' })], total: 25, page: 2, limit: 12 });
  assert.deepEqual(
    page.items.map((item) => item.slug),
    ['rabietas-primera-infancia', 'otro-articulo'],
  );
  assert.equal(page.total, 25);
  assert.equal(page.page, 2);
  assert.equal(page.limit, 12);
  assert.equal(page.totalPages, 3);

  const empty = parseBlogList({ items: [], total: 0, page: 1, limit: 12 });
  assert.equal(empty.totalPages, 0);
  assert.equal(parseBlogList({ items: 'nada' }), null);
  assert.equal(parseBlogList(null), null);
  assert.equal(parseBlogList({ detail: 'Not Found' }), null);
  const noTotals = parseBlogList({ items: [rawCard()] });
  assert.equal(noTotals.total, 1);
  assert.equal(noTotals.totalPages, 1);
});

test('parseBlogSitemap keeps entries with a valid slug and dates', () => {
  const entries = parseBlogSitemap({
    items: [
      { slug: 'uno-dos', published_at: '2026-10-01T10:00:00+00:00', updated_at: '2026-10-02T10:00:00+00:00' },
      { slug: 'Mal', published_at: '2026-10-01T10:00:00+00:00', updated_at: '2026-10-02T10:00:00+00:00' },
      { slug: 'sin-fecha', published_at: 'x', updated_at: '2026-10-02T10:00:00+00:00' },
    ],
  });
  assert.deepEqual(entries, [
    { slug: 'uno-dos', publishedAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-02T10:00:00Z') },
  ]);
  assert.equal(parseBlogSitemap({}), null);
});

test('escapeXml escapes markup and drops forbidden characters', () => {
  assert.equal(escapeXml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;');
  assert.equal(escapeXml('a\u0000b\u0008c\td\ne'), 'abc\td\ne');
  assert.equal(escapeXml('Niños, niñas y emociones'), 'Niños, niñas y emociones');
});

test('buildRss: channel, items, dates and escaping', () => {
  const items = [
    parseBlogCard(rawCard({ title: 'Límites & <amor>', excerpt: 'Uno "dos"', category_label: 'Límites y conducta' })),
    parseBlogCard(rawCard({ slug: 'sin-categoria', category: '', category_label: '' })),
  ];
  const xml = buildRss(items, {
    siteUrl: 'https://www.example.com/',
    title: 'Blog de Sanar y Criar',
    description: 'Artículos & más',
    now: new Date('2026-10-26T16:00:00Z'),
  });
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0" xmlns:atom="http:\/\/www.w3.org\/2005\/Atom">/);
  assert.match(xml, /<link>https:\/\/www.example.com\/blog<\/link>/);
  assert.match(xml, /<description>Artículos &amp; más<\/description>/);
  assert.match(xml, /<language>es-VE<\/language>/);
  assert.match(xml, /<lastBuildDate>Mon, 26 Oct 2026 16:00:00 GMT<\/lastBuildDate>/);
  assert.match(xml, /<atom:link href="https:\/\/www.example.com\/blog\/rss.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.match(xml, /<title>Límites &amp; &lt;amor&gt;<\/title>/);
  assert.match(xml, /<link>https:\/\/www.example.com\/blog\/rabietas-primera-infancia<\/link>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/www.example.com\/blog\/rabietas-primera-infancia<\/guid>/);
  assert.match(xml, /<pubDate>Mon, 26 Oct 2026 14:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<description>Uno &quot;dos&quot;<\/description>/);
  assert.match(xml, /<category>Límites y conducta<\/category>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.equal((xml.match(/<category>/g) ?? []).length, 1, 'no empty category');
  assert.doesNotMatch(xml, /<amor>/);
});

test('buildSitemap lists /blog only when there are articles', () => {
  const empty = buildSitemap([], 'https://www.example.com');
  assert.match(empty, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">\n<\/urlset>/);
  assert.doesNotMatch(empty, /<loc>/);

  const xml = buildSitemap(
    [
      { slug: 'uno', publishedAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-03T10:00:00Z') },
      { slug: 'dos-tres', publishedAt: new Date('2026-10-02T10:00:00Z'), updatedAt: new Date('2026-10-05T08:30:00Z') },
    ],
    'https://www.example.com/',
  );
  assert.match(xml, /<url><loc>https:\/\/www.example.com\/blog<\/loc><lastmod>2026-10-05T08:30:00.000Z<\/lastmod><\/url>/);
  assert.match(xml, /<url><loc>https:\/\/www.example.com\/blog\/uno<\/loc><lastmod>2026-10-03T10:00:00.000Z<\/lastmod><\/url>/);
  assert.match(xml, /<url><loc>https:\/\/www.example.com\/blog\/dos-tres<\/loc><lastmod>2026-10-05T08:30:00.000Z<\/lastmod><\/url>/);
  assert.equal((xml.match(/<url>/g) ?? []).length, 3);
});

test('client: requested URLs, options and success', async () => {
  const { impl, calls } = fakeFetch((url) => {
    if (url.includes('/public/posts/')) return json(rawPost());
    if (url.endsWith('/public/sitemap')) return json({ items: [] });
    return json({ items: [rawCard()], total: 1, page: 1, limit: 12 });
  });
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1/', orgId: 1, assetBase: ASSETS, fetchImpl: impl });

  const list = await client.list(1, 12);
  assert.equal(list.status, 'ok');
  assert.equal(list.stale, false);
  assert.equal(list.data.items[0].slug, 'rabietas-primera-infancia');
  const post = await client.post('rabietas-primera-infancia');
  assert.equal(post.status, 'ok');
  assert.equal(post.data.summary, 'Resumen breve.');
  const sitemap = await client.sitemap();
  assert.deepEqual(sitemap, { status: 'ok', data: [], stale: false });

  assert.deepEqual(
    calls.map((call) => call.url),
    [
      'http://api.test/api/v1/blog/1/public/posts?page=1&limit=12',
      'http://api.test/api/v1/blog/1/public/posts/rabietas-primera-infancia',
      'http://api.test/api/v1/blog/1/public/sitemap',
    ],
  );
  const init = calls[0].init;
  assert.equal(init.cache, 'no-store');
  assert.equal(init.headers.Accept, 'application/json');
  assert.ok(init.signal instanceof AbortSignal);
});

test('client: page and limit are clamped; invalid slugs never reach the API', async () => {
  const { impl, calls } = fakeFetch(() => json({ items: [], total: 0, page: 1, limit: 50 }));
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 3, fetchImpl: impl });
  await client.list(0, 500);
  await client.list(2.7, 0);
  assert.deepEqual(
    calls.map((call) => call.url),
    ['http://api.test/api/v1/blog/3/public/posts?page=1&limit=50', 'http://api.test/api/v1/blog/3/public/posts?page=2&limit=1'],
  );
  assert.deepEqual(await client.post('../../admin'), { status: 'not_found' });
  assert.deepEqual(await client.post('Mayusculas'), { status: 'not_found' });
  assert.equal(calls.length, 2);
});

test('client: a failure after a success returns the saved copy (stale)', async (t) => {
  quiet(t);
  const good = { items: [rawCard()], total: 1, page: 1, limit: 12 };
  const failures = [
    () => json({ detail: 'error' }, 500),
    () => json({ detail: 'Not Found' }, 404),
    () => json({ inesperado: true }),
    () => new Response('<html>proxy</html>', { status: 200 }),
    () => {
      throw new TypeError('fetch failed');
    },
  ];
  for (const failure of failures) {
    const { impl } = fakeFetch(() => json(good), failure);
    const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, fetchImpl: impl });
    assert.equal((await client.list(1, 12)).status, 'ok');
    const again = await client.list(1, 12);
    assert.equal(again.status, 'ok');
    assert.equal(again.stale, true);
    assert.equal(again.data.items[0].slug, 'rabietas-primera-infancia');
  }
});

test('client: a failure without a saved copy is unavailable', async (t) => {
  quiet(t);
  const { impl } = fakeFetch(() => json({ detail: 'error' }, 503));
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, fetchImpl: impl });
  assert.deepEqual(await client.list(1, 12), { status: 'unavailable' });
  assert.deepEqual(await client.post('algo-nuevo'), { status: 'unavailable' });
  assert.deepEqual(await client.sitemap(), { status: 'unavailable' });
  // A different page has its own copy.
  const ok = fakeFetch(() => json({ items: [rawCard()], total: 13, page: 1, limit: 12 }), () => json({}, 502));
  const other = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, fetchImpl: ok.impl });
  assert.equal((await other.list(1, 12)).status, 'ok');
  assert.deepEqual(await other.list(2, 12), { status: 'unavailable' });
});

test('client: 404 on an article is not_found and forgets the copy', async (t) => {
  quiet(t);
  const { impl } = fakeFetch(
    () => json(rawPost()),
    () => json({ detail: 'Artículo no encontrado.' }, 404),
    () => json({ detail: 'error' }, 500),
  );
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, fetchImpl: impl });
  assert.equal((await client.post('rabietas-primera-infancia')).status, 'ok');
  assert.deepEqual(await client.post('rabietas-primera-infancia'), { status: 'not_found' });
  // The copy is gone: a later failure is unavailable, not the old article.
  assert.deepEqual(await client.post('rabietas-primera-infancia'), { status: 'unavailable' });
});

test('client: timeout (AbortError) is unavailable and is reported', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const { impl } = fakeFetch(() => {
    throw new DOMException('This operation was aborted', 'AbortError');
  });
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, fetchImpl: impl });
  assert.deepEqual(await client.post('rabietas-primera-infancia'), { status: 'unavailable' });
  assert.equal(warn.mock.callCount(), 1);
  const message = warn.mock.calls[0].arguments[0];
  assert.match(message, /^\[blog\] \/blog\/1\/public\/posts\/rabietas-primera-infancia: tiempo agotado$/);
});

test('client: the real timeout aborts a slow API', async (t) => {
  quiet(t);
  const slow = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, timeoutMs: 20, fetchImpl: slow });
  const started = Date.now();
  assert.deepEqual(await client.list(1, 12), { status: 'unavailable' });
  assert.ok(Date.now() - started < 2000);
});

test('client: the in-memory copy keeps at most maxEntries URLs', async (t) => {
  quiet(t);
  let fail = false;
  const impl = async (url) => {
    if (fail) throw new TypeError('fetch failed');
    const slug = String(url).split('/').pop();
    return json(rawPost({ slug }));
  };
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, maxEntries: 2, fetchImpl: impl });
  for (const slug of ['uno-a', 'dos-b', 'tres-c']) assert.equal((await client.post(slug)).status, 'ok');
  fail = true;
  assert.deepEqual(await client.post('uno-a'), { status: 'unavailable' }, 'oldest copy was dropped');
  assert.equal((await client.post('dos-b')).stale, true);
  assert.equal((await client.post('tres-c')).stale, true);
});

/** Fake API: page 1 and article pages answer; any other page is past the end (empty). */
function blogApi() {
  const state = { fail: false };
  const impl = async (url) => {
    if (state.fail) throw new TypeError('fetch failed');
    const u = new URL(String(url));
    if (u.pathname.endsWith('/public/sitemap')) return json({ items: [{ slug: 'uno-a', published_at: '2026-10-01T00:00:00+00:00', updated_at: '2026-10-02T00:00:00+00:00' }] });
    if (u.pathname.endsWith('/public/posts')) {
      const page = Number(u.searchParams.get('page'));
      return json({ items: page === 1 ? [rawCard()] : [], total: 1, page, limit: Number(u.searchParams.get('limit')) });
    }
    return json(rawPost({ slug: u.pathname.split('/').pop() }));
  };
  return { state, impl };
}

test('client: empty listings are not kept, so made-up pages cannot push real copies out', async (t) => {
  quiet(t);
  const api = blogApi();
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, maxEntries: 2, fetchImpl: api.impl });
  assert.equal((await client.post('uno-a')).status, 'ok');
  assert.equal((await client.post('dos-b')).status, 'ok');
  for (let page = 2; page <= 300; page += 1) {
    const result = await client.list(page, 12);
    assert.equal(result.status, 'ok');
    assert.equal(result.data.items.length, 0);
  }
  api.state.fail = true;
  assert.equal((await client.post('uno-a')).stale, true);
  assert.equal((await client.post('dos-b')).stale, true);
  assert.deepEqual(await client.list(5, 12), { status: 'unavailable' });
});

test('client: a listing that became empty drops its old copy', async (t) => {
  quiet(t);
  const { impl } = fakeFetch(
    () => json({ items: [rawCard()], total: 13, page: 2, limit: 12 }),
    () => json({ items: [], total: 12, page: 2, limit: 12 }),
    () => json({ detail: 'error' }, 500),
  );
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, fetchImpl: impl });
  assert.equal((await client.list(2, 12)).data.items.length, 1);
  assert.equal((await client.list(2, 12)).data.items.length, 0);
  assert.deepEqual(await client.list(2, 12), { status: 'unavailable' });
});

test('client: serving a saved copy counts as a use (LRU)', async (t) => {
  quiet(t);
  const api = blogApi();
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, maxEntries: 2, fetchImpl: api.impl });
  await client.post('uno-a');
  await client.post('dos-b');
  api.state.fail = true;
  assert.equal((await client.post('uno-a')).stale, true); // uno-a is now the most recent use
  api.state.fail = false;
  await client.post('tres-c'); // pushes out dos-b, not uno-a
  api.state.fail = true;
  assert.equal((await client.post('uno-a')).stale, true);
  assert.deepEqual(await client.post('dos-b'), { status: 'unavailable' });
  assert.equal((await client.post('tres-c')).stale, true);
});

test('client: the first page of each listing and the sitemap are never pushed out', async (t) => {
  quiet(t);
  const api = blogApi();
  const client = createBlogClient({ apiBase: 'http://api.test/api/v1', orgId: 1, maxEntries: 2, fetchImpl: api.impl });
  await client.list(1, 12);
  await client.list(1, 3);
  await client.sitemap();
  for (const slug of ['uno-a', 'dos-b', 'tres-c', 'cuatro-d']) await client.post(slug);
  api.state.fail = true;
  assert.equal((await client.list(1, 12)).stale, true);
  assert.equal((await client.list(1, 3)).stale, true);
  assert.equal((await client.sitemap()).stale, true);
  assert.equal((await client.post('cuatro-d')).stale, true);
  assert.deepEqual(await client.post('uno-a'), { status: 'unavailable' });
});
