import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, CirclePlay, MessageCircle, ShoppingCart } from 'lucide-react';
import { fetchCatalog, type CatalogItem, type CatalogResult } from '@/lib/catalog';
import { freeClassHref, site, whatsappLink } from '@/site.config';

/**
 * Catalog of courses and ebooks sold on the course platform. The HTML is
 * rendered at build time with `initial`; in the browser the list is refreshed
 * from the public API so new offers show up without rebuilding the site.
 */
interface Props {
  initial: CatalogResult;
  /** "home": compact, up to 3 per type. "full": the /cursos page. */
  variant?: 'home' | 'full';
}

export default function CatalogIsland({ initial, variant = 'full' }: Props) {
  const [catalog, setCatalog] = useState<CatalogResult>(initial);

  useEffect(() => {
    const controller = new AbortController();
    fetchCatalog({
      apiBase: site.platform.apiBase,
      orgId: site.platform.orgId,
      offerUrl: site.platform.offerUrl,
      signal: controller.signal,
    }).then((fresh) => {
      if (controller.signal.aborted) return;
      // Keep the build-time list if the live request fails.
      if (fresh.status === 'ok') setCatalog(fresh);
    });
    return () => controller.abort();
  }, []);

  const limit = variant === 'home' ? 3 : Infinity;
  const courses = catalog.courses.slice(0, limit);
  const ebooks = catalog.ebooks.slice(0, limit);
  const isEmpty = courses.length === 0 && ebooks.length === 0;

  if (isEmpty) {
    return <ComingSoon unreachable={catalog.status === 'error'} variant={variant} />;
  }

  const HeadingTag = variant === 'home' ? 'h3' : 'h2';

  return (
    <div className="space-y-14" aria-live="polite">
      <section aria-labelledby={`catalogo-cursos-${variant}`} id={variant === 'full' ? 'cursos-en-video' : undefined}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <HeadingTag id={`catalogo-cursos-${variant}`} className="font-serif text-2xl font-semibold text-violeta sm:text-[1.75rem]">
            Cursos en video
          </HeadingTag>
          {catalog.courses.length > 0 && (
            <p className="note">{countLabel(catalog.courses.length, 'curso', 'cursos')}</p>
          )}
        </div>
        {courses.length > 0 ? (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((item) => (
              <li key={item.key} className="flex">
                <ProductCard item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <SoonNote kind="cursos" />
        )}
      </section>

      <section aria-labelledby={`catalogo-ebooks-${variant}`} id={variant === 'full' ? 'ebooks' : undefined}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <HeadingTag id={`catalogo-ebooks-${variant}`} className="font-serif text-2xl font-semibold text-violeta sm:text-[1.75rem]">
            Ebooks
          </HeadingTag>
          {catalog.ebooks.length > 0 && <p className="note">{countLabel(catalog.ebooks.length, 'ebook', 'ebooks')}</p>}
        </div>
        {ebooks.length > 0 ? (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ebooks.map((item) => (
              <li key={item.key} className="flex">
                <ProductCard item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <SoonNote kind="ebooks" />
        )}
      </section>

      {variant === 'home' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a href="/cursos" className="btn btn-secondary">
            Ver todo el catálogo
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Main action: "Agregar al carrito" (opens the platform's cart with the
 * product added; paid with Pago Móvil). The product page is the secondary
 * "Ver detalles" link.
 */
function ProductCard({ item }: { item: CatalogItem }) {
  const isEbook = item.productType === 'ebook';
  const Icon = isEbook ? BookOpen : CirclePlay;
  const typeLabel = isEbook ? 'Ebook · PDF' : 'Curso en video';
  const cartHref = site.platform.cartAddUrl(item.offerUuid);

  return (
    <article className="card flex w-full flex-col overflow-hidden transition-colors hover:border-lavanda-300">
      <a
        href={item.href}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-[16/9] w-full overflow-hidden bg-[linear-gradient(150deg,var(--color-lavanda-100),var(--color-rosa-200))]"
      >
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lavanda-600">
            <Icon size={44} strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </a>
      <div className="flex flex-1 flex-col p-6">
        <p className="eyebrow text-[0.75rem]">{typeLabel}</p>
        <h3 className="mt-2 font-serif text-xl font-semibold leading-snug text-violeta">
          <a
            href={item.href}
            className="decoration-rosa-300 decoration-2 underline-offset-[0.2em] hover:text-lavanda-700 hover:underline"
          >
            {item.title}
          </a>
        </h3>
        {item.description && (
          <p className="mt-2 line-clamp-3 text-[0.9375rem] leading-relaxed text-violeta-500">{item.description}</p>
        )}
        {item.resourcesCount > 1 && (
          <p className="note mt-2">
            Incluye {item.resourcesCount} {isEbook ? 'ebooks' : 'contenidos'}
          </p>
        )}
        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between gap-3">
            {item.price ? (
              <p className="font-serif text-2xl font-semibold leading-none text-violeta">
                {item.price}
                <span className="ml-1.5 font-sans text-xs font-medium text-violeta-400">{item.currency}</span>
              </p>
            ) : (
              <span />
            )}
            <a
              href={item.href}
              aria-label={`Ver detalles: ${item.title}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-lavanda-600 hover:text-lavanda-700"
            >
              Ver detalles
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </a>
          </div>
          <a href={cartHref} aria-label={`Agregar al carrito: ${item.title}`} className="btn btn-primary mt-4 w-full">
            <ShoppingCart size={18} strokeWidth={1.75} aria-hidden="true" />
            Agregar al carrito
          </a>
        </div>
      </div>
    </article>
  );
}

function SoonNote({ kind }: { kind: 'cursos' | 'ebooks' }) {
  return (
    <p className="mt-4 max-w-[60ch] rounded-[var(--radius-field)] border border-dashed border-borde bg-blanco-calido px-5 py-4 text-[0.9375rem] text-violeta-500">
      Muy pronto habrá {kind} disponibles aquí.
    </p>
  );
}

function ComingSoon({ unreachable, variant }: { unreachable: boolean; variant: 'home' | 'full' }) {
  return (
    <div className="card grid gap-8 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-live="polite">
      <div>
        <p className="eyebrow">Muy pronto</p>
        <p className="mt-3 font-serif text-2xl font-semibold leading-snug text-violeta sm:text-[1.75rem]">
          Estamos preparando los primeros cursos y ebooks.
        </p>
        <p className="mt-3 max-w-[58ch] text-violeta-600">
          Mientras tanto, reserva tu lugar en la clase gratuita o escríbeme para saber cuándo abren las inscripciones.
          {unreachable && ' Si ya compraste, entra a la plataforma con tu cuenta.'}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
        <a href={freeClassHref} className="btn btn-primary" target="_blank" rel="noopener">
          {variant === 'home' ? (
            site.freeClass.shortLabel
          ) : (
            <>
              <span className="sm:hidden">{site.freeClass.mobileLabel}</span>
              <span className="hidden sm:inline">{site.freeClass.label}</span>
            </>
          )}
          <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
        </a>
        <a
          href={whatsappLink('Hola, Hilda. Quiero saber cuándo abren los cursos y ebooks.')}
          className="btn btn-secondary"
          target="_blank"
          rel="noopener"
        >
          <MessageCircle size={18} strokeWidth={1.75} aria-hidden="true" />
          Avísame por WhatsApp
        </a>
        {unreachable && (
          <a href={site.platform.url} className="text-link inline-flex items-center gap-1 self-start py-2 text-[0.9375rem]">
            Ir a la plataforma de cursos
            <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
