import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ArrowRight, X } from 'lucide-react';
import { giftAuthHref, site } from '@/site.config';
import {
  fetchNewsletterConfig,
  getStorage,
  isExcludedPath,
  markDismissed,
  markSubscribed,
  shouldOfferPopup,
  type KeyValueStorage,
  type NewsletterConfig,
} from '@/lib/newsletter';

/**
 * Welcome pop-up (mounted by BaseLayout on every page except the legal pages
 * and the 404). Client guide, 2026-11: it offers the free ebook, which is read
 * with a free account on the platform, so its button goes to the sign-up and
 * the platform subscribes the mother to the letters once she is in.
 *
 * Texts, delay and "days without showing it again" come from the platform
 * (panel > Boletín). A word wrapped in asterisks in the title is shown in the
 * brand's italic accent. On a computer it opens after the delay or once a
 * third of the page has been scrolled, whichever comes first; on phones and
 * tablets (narrow or touch screens) only after the delay plus three seconds.
 * It stays closed when the API does not answer, the pop-up is disabled, or
 * this browser cannot remember a "no" (no localStorage).
 */

const CONFIG_TIMEOUT_MS = 6000;
const PHONE_QUERY = '(max-width: 640px), (pointer: coarse)';
const PHONE_EXTRA_DELAY_MS = 3000;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function NewsletterPopup() {
  const [config, setConfig] = useState<NewsletterConfig | null>(null);
  const [open, setOpen] = useState(false);

  const storageRef = useRef<KeyValueStorage | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const pointerOnBackdropRef = useRef(false);

  const uid = useId();
  const titleId = `${uid}-titulo`;
  const bodyId = `${uid}-texto`;

  // Decide whether to offer the pop-up, fetch its settings and wait for the moment.
  useEffect(() => {
    if (isExcludedPath(window.location.pathname)) return;
    const storage = getStorage();
    // Check the stored marks before asking the API, so people who already
    // answered never trigger a request.
    if (!shouldOfferPopup(storage)) return;
    storageRef.current = storage;

    const controller = new AbortController();
    const configTimer = window.setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
    let openTimer: number | undefined;
    let removeScroll: (() => void) | undefined;

    fetchNewsletterConfig({ apiBase: site.platform.apiBase, orgId: site.platform.orgId, signal: controller.signal }).then(
      (fresh) => {
        window.clearTimeout(configTimer);
        if (controller.signal.aborted || !fresh || !fresh.enabled) return;
        setConfig(fresh);

        let shown = false;
        const show = () => {
          if (shown) return;
          shown = true;
          window.clearTimeout(openTimer);
          removeScroll?.();
          // The visitor may have subscribed or answered in another tab meanwhile.
          if (!shouldOfferPopup(storage)) return;
          returnFocusRef.current = document.activeElement;
          setOpen(true);
        };

        const phone = window.matchMedia(PHONE_QUERY).matches;
        openTimer = window.setTimeout(show, fresh.delaySeconds * 1000 + (phone ? PHONE_EXTRA_DELAY_MS : 0));

        // "A third of the page" is a computer rule (client guide); on phones
        // and tablets only the longer delay counts, so tapping «Ebook gratis»
        // never opens the window on top of the section it asked for.
        if (!phone) {
          const onScroll = () => {
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            if (scrollable > 0 && window.scrollY >= scrollable / 3) show();
          };
          window.addEventListener('scroll', onScroll, { passive: true });
          removeScroll = () => window.removeEventListener('scroll', onScroll);
        }
      },
    );

    return () => {
      controller.abort();
      window.clearTimeout(configTimer);
      window.clearTimeout(openTimer);
      removeScroll?.();
    };
  }, []);

  // While open: lock page scroll, focus the panel, and give focus back on close.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      root.style.overflow = previousOverflow;
      const previous = returnFocusRef.current;
      returnFocusRef.current = null;
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open]);

  function dismiss() {
    if (config) markDismissed(storageRef.current, config.dismissDays);
    setOpen(false);
  }

  // Escape and the focus trap, at document level so they keep working even if
  // focus ends up on <body>.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.tabIndex >= 0 && !el.closest('[aria-hidden="true"]') && el.getClientRects().length > 0,
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first || active === panel) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  function onBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerOnBackdropRef.current = event.target === event.currentTarget;
  }

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    // Only a click that starts and ends on the veil closes (not a text selection dragged out of the card).
    if (pointerOnBackdropRef.current && event.target === event.currentTarget) dismiss();
    pointerOnBackdropRef.current = false;
  }

  if (!open || !config) return null;

  // Entry transition with @starting-style (`starting:`): no extra render or
  // animation frame, and older browsers simply skip it.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-violeta/30 transition-opacity duration-300 ease-out starting:opacity-0 motion-reduce:transition-none sm:items-center sm:bg-violeta/55 sm:p-6 sm:backdrop-blur-[3px]"
      onPointerDown={onBackdropPointerDown}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="relative grid max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-nube shadow-[0_40px_80px_-30px_rgba(25,9,51,0.7)] outline-none transition duration-300 ease-out focus:outline-none starting:translate-y-6 starting:opacity-0 motion-reduce:transition-none sm:max-w-[54rem] sm:grid-cols-[0.85fr_1.15fr] sm:rounded-[24px]"
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-nube/90 text-violeta transition-colors hover:bg-lavanda-100"
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>

        {/* The gift, drawn: only where there is room. */}
        <div
          className="relative hidden place-items-center bg-rosa-200 bg-[radial-gradient(70%_50%_at_20%_15%,rgb(187_187_255/0.9),transparent_70%),radial-gradient(70%_55%_at_90%_95%,rgb(240_180_223/0.95),transparent_70%)] p-7 sm:grid"
          aria-hidden="true"
        >
          <span className="absolute left-4 top-4 rounded-full bg-violeta px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-nube">
            Tu regalo
          </span>
          <div className="book !w-[min(220px,100%)] ![transform:rotateY(-14deg)_rotate(-3deg)]">
            <div className="cover cover-free">
              <span className="cover-pill">Guía gratuita</span>
              <span className="cover-question">¿Será que soy una</span>
              <span className="cover-big">
                <span>MALA</span>
                <span>MAMÁ?</span>
              </span>
              <span className="cover-who" style={{ marginTop: 'auto' }}>
                Hilda Hernández<small>Psicóloga infanto-juvenil</small>
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-6 sm:px-9 sm:pb-8 sm:pt-10">
          <div className="flex items-center gap-3 pr-12">
            <img
              src="/fotos/hilda-avatar-160.webp"
              width="44"
              height="44"
              alt=""
              className="h-11 w-11 shrink-0 rounded-full border-2 border-rosa-300 object-cover"
            />
            <p className="eyebrow">Te tengo un regalo, mamá</p>
          </div>
          <h2 id={titleId} className="mt-3 pr-10 font-serif text-[1.7rem] font-semibold leading-tight text-violeta sm:pr-0 sm:text-[2.25rem]">
            {withAccent(config.title)}
          </h2>
          <p id={bodyId} className="mt-3 whitespace-pre-line leading-relaxed text-violeta-600 max-sm:sr-only">
            {config.body}
          </p>

          <p className="mt-4 flex items-center gap-2.5 rounded-[var(--radius-field)] bg-rosa-200 px-3.5 py-3 text-[0.9rem] text-violeta-600">
            <span className="shrink-0 rounded-full bg-rosa-600 px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-nube">
              Gratis
            </span>
            <span>
              Crea tu cuenta gratis y te regalo mi guía <strong className="font-semibold text-violeta">«{site.funnel.giftTitle}»</strong>
            </span>
          </p>

          <a
            href={giftAuthHref('ventana-web')}
            onClick={() => markSubscribed(storageRef.current)}
            className="btn btn-primary mt-4 w-full"
          >
            {config.buttonLabel}
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </a>

          <button type="button" onClick={dismiss} className="text-link mx-auto mt-2 block min-h-11 px-3 text-[0.9375rem] font-medium">
            {config.dismissLabel}
          </button>

          <p className="note mt-1 text-center max-sm:hidden">
            {config.privacyNote && <>{config.privacyNote} </>}
            <a href="/privacidad" className="text-link">
              Política de privacidad
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/** "Necesito acompañarte en tu *maternidad*." → the word between asterisks in the italic accent. */
function withAccent(title: string): ReactNode {
  const parts = title.split(/\*([^*]+)\*/);
  if (parts.length === 1) return title;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <em key={index} className="title-accent">
        {part}
      </em>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
