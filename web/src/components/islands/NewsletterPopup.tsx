import {
  useEffect,
  useId,
  useRef,
  useState,
  type SubmitEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Check, Mail, X } from 'lucide-react';
import { site } from '@/site.config';
import {
  NEWSLETTER_MESSAGES,
  fetchNewsletterConfig,
  getStorage,
  isExcludedPath,
  isValidEmail,
  markDismissed,
  markSubscribed,
  shouldOfferPopup,
  subscribeToNewsletter,
  type KeyValueStorage,
  type NewsletterConfig,
} from '@/lib/newsletter';

/**
 * Newsletter pop-up (mounted by BaseLayout on every page except the legal
 * pages and the 404). Texts, delay and "days without showing it again" come
 * from the course platform (panel > Boletín). It stays closed when the API
 * does not answer, the pop-up is disabled, or this browser cannot remember a
 * "no" (no localStorage).
 */

const CONFIG_TIMEOUT_MS = 6000;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type View = 'form' | 'success';

export default function NewsletterPopup() {
  const [config, setConfig] = useState<NewsletterConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('form');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const storageRef = useRef<KeyValueStorage | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const pointerOnBackdropRef = useRef(false);

  const uid = useId();
  const titleId = `${uid}-titulo`;
  const bodyId = `${uid}-texto`;
  const inputId = `${uid}-correo`;
  const errorId = `${uid}-error`;
  const successId = `${uid}-gracias`;
  const honeypotId = `${uid}-web`;

  // Decide whether to offer the pop-up and fetch its settings.
  useEffect(() => {
    if (isExcludedPath(window.location.pathname)) return;
    const storage = getStorage();
    // Sanar y Criar: check the stored marks before asking the API, so people
    // who already answered never trigger a request.
    if (!shouldOfferPopup(storage)) return;
    storageRef.current = storage;

    const controller = new AbortController();
    const configTimer = window.setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
    let openTimer: number | undefined;

    fetchNewsletterConfig({ apiBase: site.platform.apiBase, orgId: site.platform.orgId, signal: controller.signal }).then(
      (fresh) => {
        window.clearTimeout(configTimer);
        if (controller.signal.aborted || !fresh || !fresh.enabled) return;
        setConfig(fresh);
        openTimer = window.setTimeout(() => {
          // The visitor may have subscribed from the footer (or another tab) meanwhile.
          if (!shouldOfferPopup(storage)) return;
          returnFocusRef.current = document.activeElement;
          setOpen(true);
        }, fresh.delaySeconds * 1000);
      },
    );

    return () => {
      controller.abort();
      window.clearTimeout(configTimer);
      if (openTimer !== undefined) window.clearTimeout(openTimer);
    };
  }, []);

  // While open: lock page scroll, focus the panel (not the field, so phones
  // do not pop up the keyboard), and give focus back on close.
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

  useEffect(() => {
    if (open && view === 'success') successRef.current?.focus({ preventScroll: true });
  }, [open, view]);

  function close() {
    // Closing the thank-you view is not a "no".
    if (view === 'form' && config) markDismissed(storageRef.current, config.dismissDays);
    setOpen(false);
  }

  // Escape and the focus trap, at document level so they keep working even if
  // focus ends up on <body> (e.g. after the submit button gets disabled).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
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

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!isValidEmail(email)) {
      setError(NEWSLETTER_MESSAGES.invalidEmail);
      inputRef.current?.focus();
      return;
    }
    setError('');
    setSending(true);
    const result = await subscribeToNewsletter({
      apiBase: site.platform.apiBase,
      orgId: site.platform.orgId,
      email,
      website,
      source: 'popup',
      page: window.location.pathname,
    });
    setSending(false);
    if (result === 'ok') {
      markSubscribed(storageRef.current);
      setView('success');
      return;
    }
    setError(NEWSLETTER_MESSAGES[result]);
    inputRef.current?.focus();
  }

  function onBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerOnBackdropRef.current = event.target === event.currentTarget;
  }

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    // Only a click that starts and ends on the veil closes (not a text selection dragged out of the card).
    if (pointerOnBackdropRef.current && event.target === event.currentTarget) close();
    pointerOnBackdropRef.current = false;
  }

  if (!open || !config) return null;

  // Entry transition with @starting-style (`starting:`): no extra render or
  // animation frame, and older browsers simply skip it.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-violeta/45 transition-opacity duration-300 ease-out starting:opacity-0 motion-reduce:transition-none sm:items-center sm:p-6"
      onPointerDown={onBackdropPointerDown}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={view === 'form' ? bodyId : successId}
        tabIndex={-1}
        className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[24px] border border-borde bg-nube px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-7 shadow-xl outline-none transition duration-300 ease-out focus:outline-none starting:translate-y-6 starting:opacity-0 motion-reduce:transition-none sm:max-w-md sm:rounded-[var(--radius-card)] sm:p-8"
      >
        <div aria-hidden="true" className="mx-auto -mt-3 mb-5 h-1.5 w-12 rounded-full bg-lavanda-300/70 sm:hidden" />

        <button
          type="button"
          aria-label="Cerrar"
          onClick={close}
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-violeta-500 transition-colors hover:bg-lavanda-100 hover:text-violeta sm:right-3 sm:top-3"
        >
          <X size={22} strokeWidth={2} aria-hidden="true" />
        </button>

        {view === 'form' ? (
          <>
            <BadgeIcon>
              <Mail size={26} strokeWidth={1.75} aria-hidden="true" />
            </BadgeIcon>
            <h2 id={titleId} className="mt-5 pr-8 font-serif text-2xl font-semibold leading-snug text-violeta">
              {config.title}
            </h2>
            <p id={bodyId} className="mt-3 whitespace-pre-line text-[0.9875rem] leading-relaxed text-violeta-600">
              {config.body}
            </p>

            <form className="relative mt-6" noValidate onSubmit={onSubmit}>
              <label htmlFor={inputId} className="block text-[0.9375rem] font-semibold text-violeta">
                Tu correo electrónico
              </label>
              <input
                ref={inputRef}
                id={inputId}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="tu@correo.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError('');
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="mt-2 block w-full rounded-[var(--radius-field)] border border-borde bg-white px-4 py-3 text-base text-violeta placeholder:text-violeta-400 focus:border-lavanda-600 aria-[invalid=true]:border-rosa-500"
              />
              <p id={errorId} role="alert" className={error ? 'mt-2 text-sm font-medium text-rosa-600' : ''}>
                {error}
              </p>

              <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
                <label htmlFor={honeypotId}>No llenes este campo</label>
                <input
                  id={honeypotId}
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary mt-4 w-full disabled:cursor-wait disabled:opacity-80"
                disabled={sending}
                aria-busy={sending || undefined}
              >
                {sending ? NEWSLETTER_MESSAGES.sending : config.buttonLabel}
              </button>
            </form>

            <button type="button" onClick={close} className="text-link mx-auto mt-2 block min-h-11 px-3 text-[0.9375rem]">
              {config.dismissLabel}
            </button>

            <p className="note mt-3 text-center">
              {config.privacyNote && <>{config.privacyNote} </>}
              <a href="/privacidad" className="text-link">
                Política de privacidad
              </a>
            </p>
          </>
        ) : (
          <>
            <h2 id={titleId} className="sr-only">
              {config.title}
            </h2>
            <BadgeIcon>
              <Check size={28} strokeWidth={2} aria-hidden="true" />
            </BadgeIcon>
            <p
              ref={successRef}
              id={successId}
              role="status"
              tabIndex={-1}
              className="mt-5 whitespace-pre-line pr-8 font-serif text-xl font-semibold leading-snug text-violeta outline-none focus:outline-none sm:text-2xl"
            >
              {config.successMessage}
            </p>
            <button type="button" onClick={close} className="btn btn-secondary mt-7 w-full">
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Lavender circle with a pink dot (brand accent). */
function BadgeIcon({ children }: { children: ReactNode }) {
  return (
    <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-lavanda-100 text-lavanda-700">
      {children}
      <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-rosa-300 ring-2 ring-nube" />
    </div>
  );
}
