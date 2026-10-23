/**
 * Single source of truth for the marketing site: brand, contact data and the
 * links to the course platform (LearnHouse). Values that change per
 * environment can be overridden with PUBLIC_* variables (see .env.example).
 */

const env = import.meta.env;

/** Trim trailing slashes so we can safely join paths. */
function clean(url: string | undefined, fallback: string): string {
  const value = (url ?? '').trim() || fallback;
  return value.replace(/\/+$/, '');
}

function optional(url: string | undefined): string {
  return (url ?? '').trim();
}

const whatsappNumber = '+58 424 8824634';
const whatsappDigits = whatsappNumber.replace(/\D/g, '');

/** Builds a wa.me link with an optional pre-filled message. */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${whatsappDigits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

const platformUrl = clean(env.PUBLIC_LH_PLATFORM, 'https://cursos.sanarycriarve.com');

export const site = {
  name: 'Sanar y Criar',
  /** Canonical origin of the marketing site (no trailing slash). */
  url: clean(env.PUBLIC_SITE_URL, 'https://www.sanarycriarve.com'),
  domain: 'sanarycriarve.com',
  locale: 'es_VE',
  lang: 'es',
  tagline: 'Psicología infanto-juvenil y crianza consciente, 100% online.',
  description:
    'Hilda Hernández, psicóloga clínica infanto-juvenil (FPV 8.914). Consultas online, cursos y ebooks para acompañar la crianza desde la calma.',

  professional: {
    name: 'Hilda Hernández',
    title: 'Psicóloga Clínica Infanto-Juvenil',
    shortTitle: 'Psicóloga Infanto-Juvenil',
    license: 'FPV 8.914',
    licenseBody: 'Federación de Psicólogos de Venezuela',
    city: 'Lechería',
    region: 'Anzoátegui',
    country: 'Venezuela',
    countryCode: 'VE',
    /** Approximate coordinates of Lechería (used only in structured data). */
    geo: { latitude: 10.195, longitude: -64.686 },
  },

  contact: {
    whatsappNumber,
    whatsappDigits,
    whatsappUrl: whatsappLink(),
    instagramHandle: '@sanarycriarve',
    instagramUrl: 'https://www.instagram.com/sanarycriarve/',
  },

  /** Course platform (LearnHouse fork). */
  platform: {
    url: platformUrl,
    apiBase: clean(env.PUBLIC_LH_API, `${platformUrl}/api/v1`),
    orgId: Number(env.PUBLIC_LH_ORG_ID ?? 1) || 1,
    loginUrl: `${platformUrl}/login`,
    storeUrl: `${platformUrl}/store`,
    offerUrl: (offerUuid: string) => `${platformUrl}/store/offers/${encodeURIComponent(offerUuid)}`,
  },

  /** Primary call to action. Changes with each launch date (brand manual, p.3). */
  freeClass: {
    url: optional(env.PUBLIC_FREE_CLASS_URL),
    label: 'Reserva tu lugar en la clase gratuita',
    /** Fits on one line on phones (brand manual p.3 mobile mock-up). */
    mobileLabel: 'Reserva tu clase gratuita',
    shortLabel: 'Clase gratuita',
    whatsappMessage: 'Hola, Hilda. Quiero reservar mi lugar en la clase gratuita.',
  },

  /** Consultation booking. Empty URL = WhatsApp with a pre-filled message. */
  booking: {
    url: optional(env.PUBLIC_BOOKING_URL),
    whatsappMessage: 'Hola, Hilda. Quisiera agendar una consulta online.',
  },

  /** Payment methods shown in copy. Keep in sync with the platform. */
  payments: {
    now: 'PayPal o tarjeta de débito o crédito (a través de PayPal)',
    short: 'con PayPal o con tarjeta',
    soon: 'Pago Móvil',
  },
} as const;

/** Resolved link for the free-class CTA (falls back to WhatsApp). */
export const freeClassHref = site.freeClass.url || whatsappLink(site.freeClass.whatsappMessage);

/** Resolved link for booking a consultation (falls back to WhatsApp). */
export const bookingHref = site.booking.url || whatsappLink(site.booking.whatsappMessage);

/** Absolute URL on the marketing site. */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${site.url}${path.startsWith('/') ? '' : '/'}${path}`;
}

export type SiteConfig = typeof site;
