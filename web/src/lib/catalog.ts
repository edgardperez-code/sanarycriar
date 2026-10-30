/**
 * Public catalog from the course platform:
 *   GET {apiBase}/payments/{orgId}/offers/public-listing  (offers for sale)
 *   GET {apiBase}/payments/{orgId}/offers/free-listing    (free courses and ebooks)
 * Used at build time (static HTML) and in the browser (React island refresh).
 * Parsing is defensive: anything unexpected is skipped, never thrown.
 */

export type ProductType = 'course' | 'ebook';

export interface CatalogItem {
  key: string;
  offerUuid: string;
  title: string;
  description: string;
  /** Formatted price, e.g. "$35" (empty when unknown). */
  price: string;
  currency: string;
  thumbnailUrl: string | null;
  productType: ProductType;
  /** Number of courses/ebooks included in the offer. */
  resourcesCount: number;
  href: string;
  /** Free course/ebook (no offer): links to the course page, no cart. */
  free: boolean;
}

export interface CatalogData {
  courses: CatalogItem[];
  ebooks: CatalogItem[];
}

export type CatalogStatus = 'ok' | 'error';

export interface CatalogResult extends CatalogData {
  status: CatalogStatus;
}

export const emptyCatalog: CatalogResult = { status: 'error', courses: [], ebooks: [] };

interface RawResource {
  name?: unknown;
  description?: unknown;
  thumbnail_url?: unknown;
  product_type?: unknown;
  course_uuid?: unknown;
  resource_uuid?: unknown;
}

interface RawOffer {
  offer_uuid?: unknown;
  name?: unknown;
  description?: unknown;
  amount?: unknown;
  currency?: unknown;
  included_resources?: unknown;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Absolute http(s) URL or null. Relative paths (the API returns
 * "/content/..." when it has no media host configured) resolve against `base`.
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

/** Plain text only: strips tags in case a description contains HTML. */
function plainText(value: unknown): string {
  return str(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatPrice(amount: unknown, currency: unknown): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';
  const code = str(currency).toUpperCase() || 'USD';
  const integer = Number.isInteger(value);
  try {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: integer ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${code}`;
  }
}

export function normalizeCatalog(raw: unknown, offerUrl: (uuid: string) => string, assetBase?: string): CatalogData {
  const result: CatalogData = { courses: [], ebooks: [] };
  if (!Array.isArray(raw)) return result;

  for (const entry of raw as RawOffer[]) {
    if (!entry || typeof entry !== 'object') continue;
    const offerUuid = str(entry.offer_uuid);
    const title = plainText(entry.name);
    if (!offerUuid || !title) continue;

    const resources = Array.isArray(entry.included_resources)
      ? (entry.included_resources as RawResource[]).filter((r) => r && typeof r === 'object')
      : [];

    const types = resources.map((r) => (str(r.product_type) === 'ebook' ? 'ebook' : 'course'));
    // An offer is an ebook only when everything it includes is an ebook.
    const productType: ProductType = types.length > 0 && types.every((t) => t === 'ebook') ? 'ebook' : 'course';

    const first = resources[0];
    const description = plainText(entry.description) || (first ? plainText(first.description) : '');
    const thumbnailUrl = resources.map((r) => safeHttpUrl(r.thumbnail_url, assetBase)).find((u) => u) ?? null;
    const currency = str(entry.currency).toUpperCase() || 'USD';

    const item: CatalogItem = {
      key: offerUuid,
      offerUuid,
      title,
      description,
      price: formatPrice(entry.amount, currency),
      currency,
      thumbnailUrl,
      productType,
      resourcesCount: resources.length,
      href: offerUrl(offerUuid),
      free: false,
    };

    if (productType === 'ebook') result.ebooks.push(item);
    else result.courses.push(item);
  }

  return result;
}

interface RawFreeCourse {
  course_uuid?: unknown;
  name?: unknown;
  description?: unknown;
  product_type?: unknown;
  thumbnail_url?: unknown;
}

/** Free courses/ebooks (no offer) appended to `data`, after the paid ones. */
export function addFreeItems(
  data: CatalogData,
  raw: unknown,
  courseUrl: (uuid: string) => string,
  assetBase?: string,
): CatalogData {
  if (!Array.isArray(raw)) return data;
  const result: CatalogData = { courses: [...data.courses], ebooks: [...data.ebooks] };
  for (const entry of raw as RawFreeCourse[]) {
    if (!entry || typeof entry !== 'object') continue;
    const courseUuid = str(entry.course_uuid);
    const title = plainText(entry.name);
    if (!courseUuid || !title) continue;
    const productType: ProductType = str(entry.product_type) === 'ebook' ? 'ebook' : 'course';
    const item: CatalogItem = {
      key: `free-${courseUuid}`,
      offerUuid: '',
      title,
      description: plainText(entry.description),
      price: '',
      currency: '',
      thumbnailUrl: safeHttpUrl(entry.thumbnail_url, assetBase),
      productType,
      resourcesCount: 1,
      href: courseUrl(courseUuid),
      free: true,
    };
    if (productType === 'ebook') result.ebooks.push(item);
    else result.courses.push(item);
  }
  return result;
}

/** Origin of the API (serves relative "/content/..." thumbnails). */
function apiOrigin(apiBase: string): string | undefined {
  try {
    return new URL(apiBase).origin;
  } catch {
    return undefined;
  }
}

export function catalogEndpoint(apiBase: string, orgId: number): string {
  return `${apiBase.replace(/\/+$/, '')}/payments/${orgId}/offers/public-listing`;
}

export function freeCatalogEndpoint(apiBase: string, orgId: number): string {
  return `${apiBase.replace(/\/+$/, '')}/payments/${orgId}/offers/free-listing`;
}

export async function fetchCatalog(options: {
  apiBase: string;
  orgId: number;
  offerUrl: (uuid: string) => string;
  courseUrl: (uuid: string) => string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<CatalogResult> {
  const { apiBase, orgId, offerUrl, courseUrl, timeoutMs = 6000 } = options;
  // Manual timeout + linked signal (AbortSignal.any/timeout are missing in older Safari).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const get = (url: string) => fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    // The free list is optional: if it fails, the paid catalog still shows.
    const [response, freeResponse] = await Promise.all([
      get(catalogEndpoint(apiBase, orgId)),
      get(freeCatalogEndpoint(apiBase, orgId)).catch(() => null),
    ]);
    if (!response.ok) return { ...emptyCatalog };
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return { ...emptyCatalog };
    let free: unknown = [];
    if (freeResponse && freeResponse.ok) free = await freeResponse.json().catch(() => []);
    const base = apiOrigin(apiBase);
    return { status: 'ok', ...addFreeItems(normalizeCatalog(data, offerUrl, base), free, courseUrl, base) };
  } catch {
    return { ...emptyCatalog };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
