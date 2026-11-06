/**
 * Single source of truth for the marketing site: brand, contact data and the
 * links to the course platform (LearnHouse). Values that change per
 * environment can be overridden with PUBLIC_* variables (see .env.example).
 */

import type { QuizPath } from '@/lib/quiz';

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
    /** Adds the offer to the platform's cart and opens it (Pago Móvil checkout). */
    cartAddUrl: (offerUuid: string) => `${platformUrl}/store/cart?add=${encodeURIComponent(offerUuid)}`,
    /** Course page on the platform (free courses and ebooks link straight there). */
    courseUrl: (courseUuid: string) => `${platformUrl}/course/${encodeURIComponent(courseUuid.replace(/^course_/, ''))}`,
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

  /**
   * Home funnel (client guide, 2026-11): the free ebook is the gift for
   * registering on the platform, and «Límites sin culpa» is the featured paid
   * ebook. Local stacks have other ids: override with PUBLIC_GIFT_COURSE_UUID
   * and PUBLIC_FEATURED_OFFER_UUID.
   */
  funnel: {
    giftCourseUuid: optional(env.PUBLIC_GIFT_COURSE_UUID) || 'course_2999a0ad-d98b-471c-b7df-abcf4dae2462',
    giftTitle: '¿Será que soy una mala mamá?',
    featuredOfferUuid: optional(env.PUBLIC_FEATURED_OFFER_UUID) || '90785380-5e6a-4f71-8ef3-4abafe46cafa',
    featuredTitle: 'Límites sin culpa',
  },

  /**
   * Payment methods shown in copy. Keep in sync with the platform: Pago Móvil
   * (cart + receipt by WhatsApp, access once the payment is confirmed); PayPal
   * comes later.
   */
  payments: {
    // "a la tasa del día": the rate may be the BCV's or one set by hand.
    now: 'Pago Móvil, en bolívares, a la tasa del día',
    short: 'con Pago Móvil, en bolívares',
    soon: 'PayPal',
  },
} as const;

/** Resolved link for the free-class CTA (falls back to WhatsApp). */
export const freeClassHref = site.freeClass.url || whatsappLink(site.freeClass.whatsappMessage);

/** Resolved link for booking a consultation (falls back to WhatsApp). */
export const bookingHref = site.booking.url || whatsappLink(site.booking.whatsappMessage);

/** Where a registration started: the test, the free ebook section or the welcome pop-up. */
export type GiftOrigin = 'test' | 'guia-gratis' | 'ventana-web';

/**
 * Path of the platform's gift page: the free ebook and, coming from the test,
 * its result (guía, límites or cita). Only ids and the path name travel: never
 * the answers.
 */
export function giftPath(origin: GiftOrigin, result?: QuizPath): string {
  const params = new URLSearchParams();
  if (result) params.set('resultado', result);
  params.set('origen', origin);
  params.set('guia', site.funnel.giftCourseUuid.replace(/^course_/, ''));
  params.set('oferta', site.funnel.featuredOfferUuid);
  return `/regalo?${params.toString()}`;
}

/** Sign up (or log in) on the platform and land on the gift page afterwards. */
export function giftAuthHref(origin: GiftOrigin, options: { result?: QuizPath; mode?: 'signup' | 'login' } = {}): string {
  const { result, mode = 'signup' } = options;
  return `${site.platform.url}/${mode}?redirect=${encodeURIComponent(giftPath(origin, result))}`;
}

/** Absolute URL on the marketing site. */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${site.url}${path.startsWith('/') ? '' : '/'}${path}`;
}

export type SiteConfig = typeof site;
