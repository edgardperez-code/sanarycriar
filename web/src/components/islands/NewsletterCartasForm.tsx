import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { site } from '@/site.config';
import {
  MAX_NAME_LENGTH,
  NEWSLETTER_MESSAGES,
  getStorage,
  isValidEmail,
  markSubscribed,
  normalizeName,
  subscribeToNewsletter,
} from '@/lib/newsletter';

/**
 * Newsletter sign-up of the «Cartas» band on the Home page (client guide,
 * 2026-11): first name and e-mail, on the violet background.
 *
 * Like the footer form: method="post" without action and a button disabled
 * until hydration, so an early submit can never put the data in a URL.
 */
export default function NewsletterCartasForm() {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [doneName, setDoneName] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const uid = useId();
  const nameId = `${uid}-nombre`;
  const emailId = `${uid}-correo`;
  const errorId = `${uid}-error`;
  const honeypotId = `${uid}-web`;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (doneName !== null) statusRef.current?.focus({ preventScroll: true });
  }, [doneName]);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!isValidEmail(email)) {
      setError(NEWSLETTER_MESSAGES.invalidEmail);
      emailRef.current?.focus();
      return;
    }
    setError('');
    setSending(true);
    const result = await subscribeToNewsletter({
      apiBase: site.platform.apiBase,
      orgId: site.platform.orgId,
      email,
      name,
      website,
      source: 'cartas',
      page: window.location.pathname,
    });
    setSending(false);
    if (result === 'ok') {
      markSubscribed(getStorage());
      setDoneName(normalizeName(name).split(' ')[0] ?? '');
      return;
    }
    setError(NEWSLETTER_MESSAGES[result]);
    emailRef.current?.focus();
  }

  if (doneName !== null) {
    return (
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className="mx-auto mt-8 max-w-[39rem] rounded-[var(--radius-field)] border border-nube/15 bg-nube/5 px-5 py-4 font-serif text-xl font-semibold text-nube outline-none focus:outline-none"
      >
        {doneName ? `¡Listo, ${doneName}!` : '¡Listo!'} Ya estás en mi lista: pronto te llega mi primera carta.
      </p>
    );
  }

  return (
    <form method="post" noValidate onSubmit={onSubmit} className="relative mx-auto mt-8 max-w-[39rem]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={nameId} className="sr-only">
            Tu nombre
          </label>
          <input
            id={nameId}
            name="nombre"
            type="text"
            autoComplete="given-name"
            maxLength={MAX_NAME_LENGTH}
            placeholder="Tu nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-13 w-full rounded-[var(--radius-field)] border border-nube/20 bg-nube px-4 py-3 text-base text-violeta placeholder:text-violeta-400"
          />
        </div>
        <div>
          <label htmlFor={emailId} className="sr-only">
            Tu correo electrónico
          </label>
          <input
            ref={emailRef}
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="Tu correo"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError('');
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="min-h-13 w-full rounded-[var(--radius-field)] border border-nube/20 bg-nube px-4 py-3 text-base text-violeta placeholder:text-violeta-400"
          />
        </div>
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

      <button
        type="submit"
        className="btn btn-blush mt-3 w-full disabled:cursor-not-allowed disabled:opacity-80"
        disabled={!mounted || sending}
        aria-busy={sending || undefined}
      >
        {sending ? NEWSLETTER_MESSAGES.sending : 'Quiero que me escribas'}
      </button>

      <p id={errorId} role="alert" className={error ? 'mt-3 text-sm font-medium text-rosa-300' : ''}>
        {error}
      </p>
      <p className="mt-3 text-sm text-nube/70">
        Sin culpa, sin juicios y sin spam. Te das de baja cuando quieras.{' '}
        <a href="/privacidad" className="underline underline-offset-4 hover:text-nube">
          Política de privacidad
        </a>
      </p>
    </form>
  );
}
