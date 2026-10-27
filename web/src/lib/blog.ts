/**
 * Blog of the marketing site. Articles are written in the course platform's
 * panel (Blog) and read from its public API on every request:
 *   GET {apiBase}/blog/{orgId}/public/posts?page={p}&limit={l}
 *   GET {apiBase}/blog/{orgId}/public/posts/{slug}
 *   GET {apiBase}/blog/{orgId}/public/sitemap
 *
 * Sanar y Criar: no imports and erasable-only TypeScript (no enum/namespace),
 * so `node --test scripts/test-blog.mjs` can import this file as is. Parsing is
 * defensive (anything unexpected is skipped) and the client never throws: when
 * the API fails it returns the last good answer kept in memory, if any.
 * The server-side instance lives in src/lib/blog.server.ts.
 */

export const BLOG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BLOG_PAGE_SIZE = 12;
/** Description of /blog, also used by the RSS feed. */
export const BLOG_DESCRIPTION =
  'Artículos de Hilda Hernández, psicóloga infanto-juvenil, sobre crianza consciente, emociones y maternidad.';

export type BlogKind = 'informativo' | 'novedad' | 'taller';
export const BLOG_KIND_LABELS: Record<BlogKind, string> = { informativo: 'Artículo', novedad: 'Novedad', taller: 'Taller' };

/** Same keys and labels as the API (contract §0.1); used when the API sends no label. */
export const BLOG_CATEGORY_LABELS: Record<string, string> = {
  emociones: 'Emociones',
  'limites-y-conducta': 'Límites y conducta',
  'sueno-y-rutinas': 'Sueño y rutinas',
  'crianza-y-familia': 'Crianza y familia',
  'talleres-y-novedades': 'Talleres y novedades',
};

export interface BlogCard {
  slug: string;
  title: string;
  excerpt: string;
  kind: BlogKind;
  category: string;
  categoryLabel: string;
  coverUrl: string | null;
  coverAlt: string;
  publishedAt: Date;
  updatedAt: Date;
  readingMinutes: number;
}

export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogPost extends BlogCard {
  summary: string;
  keyTakeaways: string[];
  /** HTML already sanitized by the API (allow-list); rendered as is. */
  contentHtml: string;
  faq: BlogFaq[];
  /** Effective values: the API already falls back to title / excerpt. */
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  wordCount: number;
  ogImageUrl: string | null;
}

export interface BlogListPage {
  items: BlogCard[];
  total: number;
  page: number;
  limit: number;
  /** 0 when there are no articles. */
  totalPages: number;
}

export interface BlogSitemapEntry {
  slug: string;
  publishedAt: Date;
  updatedAt: Date;
}

export type BlogResult<T> = { status: 'ok'; data: T; stale: boolean } | { status: 'not_found' } | { status: 'unavailable' };

export interface BlogClientOptions {
  apiBase: string;
  orgId: number;
  /** Origin that relative cover URLs resolve against (the PUBLIC API origin). */
  assetBase?: string;
  timeoutMs?: number;
  /** Responses kept in memory (oldest dropped first). */
  maxEntries?: number;
  fetchImpl?: typeof fetch;
}

export interface BlogClient {
  list(page: number, limit: number): Promise<BlogResult<BlogListPage>>;
  post(slug: string): Promise<BlogResult<BlogPost>>;
  sitemap(): Promise<BlogResult<BlogSitemapEntry[]>>;
}

const MAX_SLUG = 80;
const MIN_SLUG = 3;
const MAX_PAGE_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ENTRIES = 200;

type RawObject = Record<string, unknown>;

function asObject(value: unknown): RawObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RawObject) : null;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Valid article address: lowercase letters without accents, digits and single hyphens, 3–80 characters. */
export function isBlogSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_SLUG && value.length <= MAX_SLUG && BLOG_SLUG_RE.test(value);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/**
 * Absolute http(s) URL or null. Relative paths (the API returns "/content/..."
 * when it has no media host configured) resolve against `base`.
 */
function safeHttpUrl(value: unknown, base?: string): string | null {
  const raw = str(value);
  if (!raw) return null;
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter((item) => item.length > 0);
}

function faqList(value: unknown): BlogFaq[] {
  if (!Array.isArray(value)) return [];
  const items: BlogFaq[] = [];
  for (const entry of value) {
    const raw = asObject(entry);
    if (!raw) continue;
    const question = str(raw.question);
    const answer = str(raw.answer);
    if (question && answer) items.push({ question, answer });
  }
  return items;
}

function parseKind(value: unknown): BlogKind {
  return value === 'novedad' || value === 'taller' ? value : 'informativo';
}

/** One card of the listing (snake_case from the API → camelCase), or null when unusable. */
export function parseBlogCard(raw: unknown, assetBase?: string): BlogCard | null {
  const item = asObject(raw);
  if (!item) return null;
  const slug = item.slug;
  const title = str(item.title);
  const publishedAt = parseDate(item.published_at);
  const updatedAt = parseDate(item.updated_at);
  if (!isBlogSlug(slug) || !title || !publishedAt || !updatedAt) return null;
  const category = str(item.category);
  const minutes = item.reading_minutes;
  return {
    slug,
    title,
    excerpt: str(item.excerpt),
    kind: parseKind(item.kind),
    category,
    categoryLabel: str(item.category_label) || BLOG_CATEGORY_LABELS[category] || '',
    coverUrl: safeHttpUrl(item.cover_url, assetBase),
    coverAlt: str(item.cover_alt),
    publishedAt,
    updatedAt,
    readingMinutes: typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 1 ? Math.round(minutes) : 1,
  };
}

/** Full article, or null when unusable. */
export function parseBlogPost(raw: unknown, assetBase?: string): BlogPost | null {
  const card = parseBlogCard(raw, assetBase);
  const item = asObject(raw);
  if (!card || !item) return null;
  return {
    ...card,
    summary: str(item.summary),
    keyTakeaways: stringList(item.key_takeaways),
    contentHtml: typeof item.content_html === 'string' ? item.content_html : '',
    faq: faqList(item.faq),
    metaTitle: str(item.meta_title) || card.title,
    metaDescription: str(item.meta_description) || card.excerpt,
    keywords: stringList(item.keywords),
    wordCount: nonNegativeInt(item.word_count, 0),
    ogImageUrl: safeHttpUrl(item.og_image_url, assetBase),
  };
}

/** One page of the listing, or null when the shape is unexpected. */
export function parseBlogList(raw: unknown, assetBase?: string): BlogListPage | null {
  const body = asObject(raw);
  if (!body || !Array.isArray(body.items)) return null;
  const items: BlogCard[] = [];
  for (const entry of body.items) {
    const card = parseBlogCard(entry, assetBase);
    if (card) items.push(card);
  }
  const total = Math.max(nonNegativeInt(body.total, items.length), items.length);
  const page = Math.max(1, nonNegativeInt(body.page, 1));
  const limit = Math.max(1, nonNegativeInt(body.limit, BLOG_PAGE_SIZE));
  return { items, total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 };
}

/** Published articles for the sitemap, or null when the shape is unexpected. */
export function parseBlogSitemap(raw: unknown): BlogSitemapEntry[] | null {
  const body = asObject(raw);
  if (!body || !Array.isArray(body.items)) return null;
  const entries: BlogSitemapEntry[] = [];
  for (const entry of body.items) {
    const item = asObject(entry);
    if (!item) continue;
    const publishedAt = parseDate(item.published_at);
    const updatedAt = parseDate(item.updated_at);
    if (isBlogSlug(item.slug) && publishedAt && updatedAt) entries.push({ slug: item.slug, publishedAt, updatedAt });
  }
  return entries;
}

/** Text safe inside XML elements and attributes (also drops characters XML 1.0 forbids). */
export function escapeXml(text: string): string {
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

/** RSS 2.0 feed of the latest articles. */
export function buildRss(
  items: BlogCard[],
  options: { siteUrl: string; title: string; description: string; now?: Date },
): string {
  const site = trimSlash(options.siteUrl);
  const now = options.now ?? new Date();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(options.title)}</title>`,
    `<link>${escapeXml(`${site}/blog`)}</link>`,
    `<description>${escapeXml(options.description)}</description>`,
    '<language>es-VE</language>',
    `<lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    `<atom:link href="${escapeXml(`${site}/blog/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
  ];
  for (const item of items) {
    const link = escapeXml(`${site}/blog/${item.slug}`);
    lines.push(
      '<item>',
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${link}</link>`,
      `<guid isPermaLink="true">${link}</guid>`,
      `<pubDate>${item.publishedAt.toUTCString()}</pubDate>`,
      `<description>${escapeXml(item.excerpt)}</description>`,
    );
    if (item.categoryLabel) lines.push(`<category>${escapeXml(item.categoryLabel)}</category>`);
    lines.push('</item>');
  }
  lines.push('</channel>', '</rss>', '');
  return lines.join('\n');
}

/** Sitemap of the blog: /blog (only when there are articles) and every article. */
export function buildSitemap(entries: BlogSitemapEntry[], siteUrl: string): string {
  const site = trimSlash(siteUrl);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  if (entries.length > 0) {
    const latest = entries.reduce((max, entry) => (entry.updatedAt.getTime() > max.getTime() ? entry.updatedAt : max), entries[0].updatedAt);
    lines.push(`<url><loc>${escapeXml(`${site}/blog`)}</loc><lastmod>${latest.toISOString()}</lastmod></url>`);
  }
  for (const entry of entries) {
    lines.push(`<url><loc>${escapeXml(`${site}/blog/${entry.slug}`)}</loc><lastmod>${entry.updatedAt.toISOString()}</lastmod></url>`);
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}

function errorName(error: unknown): string {
  return error !== null && typeof error === 'object' && 'name' in error ? String(error.name) : '';
}

/** AbortSignal.timeout() rejects with TimeoutError; older runtimes and fakes use AbortError. */
function isAbortError(error: unknown): boolean {
  const name = errorName(error);
  return name === 'TimeoutError' || name === 'AbortError';
}

function describeError(error: unknown): string {
  if (isAbortError(error)) return 'tiempo agotado';
  const name = errorName(error);
  return name ? `error de red (${name})` : 'error de red';
}

/**
 * Client with an in-memory copy of every good answer (per URL). When the API
 * fails (network, timeout, 5xx, unexpected JSON, 404 on the listing) the last
 * good copy is returned with `stale: true`; without a copy, `unavailable`.
 * A 404 on an article means it is gone (deleted or unpublished): its copy is
 * dropped and the result is `not_found`.
 *
 * The copy is a real LRU (saving or serving a copy counts as a use) of at
 * most `maxEntries` URLs, plus the first page of each listing and the sitemap,
 * which are never pushed out. Empty listings are not kept (and drop an older
 * copy), so visits to made-up pages (`?pagina=999`) cannot push the real
 * copies out.
 */
export function createBlogClient(options: BlogClientOptions): BlogClient {
  const apiBase = trimSlash(options.apiBase);
  const root = `/blog/${encodeURIComponent(String(options.orgId))}/public`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const cache = new Map<string, unknown>();
  const pinned = (key: string) => key.endsWith(`${root}/sitemap`) || key.includes(`${root}/posts?page=1&`);

  function touch(key: string, data: unknown): void {
    cache.delete(key);
    cache.set(key, data);
  }

  function remember(key: string, data: unknown): void {
    touch(key, data);
    for (const candidate of cache.keys()) {
      if (cache.size <= maxEntries) break;
      if (candidate !== key && !pinned(candidate)) cache.delete(candidate);
    }
  }

  async function request<T>(
    path: string,
    parse: (raw: unknown) => T | null,
    isDetail: boolean,
    keep: (data: T) => boolean = () => true,
  ): Promise<BlogResult<T>> {
    const url = `${apiBase}${path}`;
    let cause: string;
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        let body: unknown = null;
        let readable = true;
        try {
          body = await response.json();
        } catch (error) {
          // The timeout also covers reading the body.
          if (isAbortError(error)) throw error;
          readable = false;
        }
        const data = readable ? parse(body) : null;
        if (data !== null) {
          if (keep(data)) remember(url, data);
          else cache.delete(url);
          return { status: 'ok', data, stale: false };
        }
        cause = 'respuesta inesperada';
      } else if (response.status === 404 && isDetail) {
        cache.delete(url);
        return { status: 'not_found' };
      } else {
        cause = `HTTP ${response.status}`;
      }
    } catch (error) {
      cause = describeError(error);
    }
    const saved = cache.get(url) as T | undefined;
    console.warn(`[blog] ${path}: ${cause}${saved !== undefined ? '; se usa la última copia guardada' : ''}`);
    if (saved !== undefined) {
      touch(url, saved);
      return { status: 'ok', data: saved, stale: true };
    }
    return { status: 'unavailable' };
  }

  return {
    list(page: number, limit: number) {
      const p = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
      const l = Number.isFinite(limit) ? Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(limit))) : BLOG_PAGE_SIZE;
      return request(
        `${root}/posts?page=${p}&limit=${l}`,
        (raw) => parseBlogList(raw, options.assetBase),
        false,
        (list) => list.items.length > 0,
      );
    },
    post(slug: string) {
      if (!isBlogSlug(slug)) return Promise.resolve<BlogResult<BlogPost>>({ status: 'not_found' });
      return request(`${root}/posts/${slug}`, (raw) => parseBlogPost(raw, options.assetBase), true);
    },
    sitemap() {
      return request(`${root}/sitemap`, parseBlogSitemap, false);
    },
  };
}
