import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { site } from '@/site.config';
import { NEWSLETTER_MESSAGES, getStorage, isValidEmail, markSubscribed, subscribeToNewsletter } from '@/lib/newsletter';

/**
 * Small newsletter sign-up in the footer (every page, dark background), for
 * people who closed the pop-up. It does not read the pop-up settings: it works
 * even when the pop-up is disabled.
 *
 * Sanar y Criar: the form has method="post" and no action, and the button is
 * disabled until hydration, so an early submit can never put the e-mail in a
 * URL.
 */
export default function NewsletterFooterForm() {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const uid = useId();
  const inputId = `${uid}-correo`;
  const errorId = `${uid}-error`;
  const honeypotId = `${uid}-web`;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (done) statusRef.current?.focus({ preventScroll: true });
  }, [done]);

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
      source: 'footer',
      page: window.location.pathname,
    });
    setSending(false);
    if (result === 'ok') {
      markSubscribed(getStorage());
      setDone(true);
      return;
    }
    setError(NEWSLETTER_MESSAGES[result]);
    inputRef.current?.focus();
  }

  return (
    <div className="mt-14 grid gap-6 rounded-[var(--radius-card)] border border-nube/15 bg-nube/5 p-6 sm:p-8 md:grid-cols-[1fr_1.2fr] md:items-center">
      <div>
        <p className="eyebrow">Boletín</p>
        <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-nube/85">
          Ideas para criar desde la calma, novedades y cursos, directo en tu correo.
        </p>
      </div>

      {done ? (
        <p ref={statusRef} role="status" tabIndex={-1} className="font-serif text-xl font-semibold text-nube outline-none focus:outline-none">
          ¡Gracias! Ya estás en la lista.
        </p>
      ) : (
        <form method="post" noValidate onSubmit={onSubmit} className="relative">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
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
              className="min-h-12 w-full min-w-0 flex-1 rounded-[var(--radius-field)] border border-nube/20 bg-nube px-4 py-3 text-base text-violeta placeholder:text-violeta-400"
            />
            <button
              type="submit"
              className="btn btn-blush shrink-0 disabled:cursor-not-allowed disabled:opacity-80"
              disabled={!mounted || sending}
              aria-busy={sending || undefined}
            >
              {sending ? NEWSLETTER_MESSAGES.sending : 'Suscribirme'}
            </button>
          </div>

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

          <p id={errorId} role="alert" className={error ? 'mt-3 text-sm font-medium text-rosa-300' : ''}>
            {error}
          </p>
          <p className="mt-3 text-sm text-nube/70">
            Sin spam. Puedes darte de baja cuando quieras.{' '}
            <a href="/privacidad" className="underline underline-offset-4 hover:text-nube">
              Política de privacidad
            </a>
          </p>
        </form>
      )}
    </div>
  );
}
