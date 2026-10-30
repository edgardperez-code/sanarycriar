import { site } from '@/site.config';
import { fetchCatalog, type CatalogResult } from './catalog';

let cached: Promise<CatalogResult> | null = null;

/**
 * Catalog fetched while rendering pages (build time in production, per request
 * in dev). Shared between pages during one build so the API is hit once.
 */
export function getServerCatalog(): Promise<CatalogResult> {
  if (cached && !import.meta.env.DEV) return cached;
  cached = fetchCatalog({
    apiBase: site.platform.apiBase,
    orgId: site.platform.orgId,
    offerUrl: site.platform.offerUrl,
    courseUrl: site.platform.courseUrl,
    timeoutMs: 8000,
  }).then((result) => {
    if (result.status === 'error' && !import.meta.env.DEV) {
      console.warn(
        `[catalogo] No se pudo leer ${site.platform.apiBase}/payments/${site.platform.orgId}/offers/public-listing; ` +
          'el HTML mostrará "Muy pronto" y el navegador volverá a intentarlo.',
      );
    }
    return result;
  });
  return cached;
}
