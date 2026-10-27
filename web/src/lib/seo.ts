import { absoluteUrl, site } from '@/site.config';

export const OG_IMAGE = '/og-image.png';

const businessId = `${site.url}/#consulta`;
const personId = `${site.url}/#hilda`;

/** ProfessionalService + Person graph (only verified facts). */
export function businessJsonLd() {
  const p = site.professional;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfessionalService',
        '@id': businessId,
        name: site.name,
        description: site.description,
        url: `${site.url}/`,
        image: absoluteUrl(OG_IMAGE),
        logo: absoluteUrl('/icon-512.png'),
        telephone: `+${site.contact.whatsappDigits}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: p.city,
          addressRegion: p.region,
          addressCountry: p.countryCode,
        },
        geo: { '@type': 'GeoCoordinates', latitude: p.geo.latitude, longitude: p.geo.longitude },
        areaServed: [{ '@type': 'Country', name: p.country }, 'Online'],
        availableLanguage: 'es',
        knowsAbout: [
          'Psicología infanto-juvenil',
          'Crianza consciente',
          'Primera infancia',
          'Salud mental materna',
          'Regulación emocional',
        ],
        founder: { '@id': personId },
        employee: { '@id': personId },
        sameAs: [site.contact.instagramUrl],
      },
      {
        '@type': 'Person',
        '@id': personId,
        name: p.name,
        jobTitle: p.title,
        hasCredential: {
          '@type': 'EducationalOccupationalCredential',
          credentialCategory: 'Registro profesional',
          name: p.license,
          recognizedBy: { '@type': 'Organization', name: p.licenseBody },
        },
        image: absoluteUrl('/images/hilda-nobg.png'),
        url: absoluteUrl('/sobre-mi'),
        worksFor: { '@id': businessId },
        address: {
          '@type': 'PostalAddress',
          addressLocality: p.city,
          addressRegion: p.region,
          addressCountry: p.countryCode,
        },
        sameAs: [site.contact.instagramUrl],
      },
    ],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${site.url}/#web`,
    url: `${site.url}/`,
    name: site.name,
    inLanguage: 'es',
    publisher: { '@id': businessId },
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export interface BlogPostingInput {
  url: string;
  title: string;
  description: string;
  publishedAt: Date;
  updatedAt: Date;
  image?: string | null;
  keywords: string[];
  section: string;
  wordCount: number;
}

/** BlogPosting of a blog article (author Hilda, publisher the practice). */
export function blogPostingJsonLd(p: BlogPostingInput) {
  // Google shows up to 110 characters of the headline.
  const headline = p.title.length > 110 ? `${p.title.slice(0, 109).trimEnd()}…` : p.title;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${p.url}#articulo`,
    headline,
    description: p.description,
    datePublished: p.publishedAt.toISOString(),
    dateModified: p.updatedAt.toISOString(),
    inLanguage: 'es',
    mainEntityOfPage: p.url,
    url: p.url,
    image: p.image ?? absoluteUrl(OG_IMAGE),
    ...(p.keywords.length > 0 ? { keywords: p.keywords.join(', ') } : {}),
    ...(p.section ? { articleSection: p.section } : {}),
    ...(p.wordCount > 0 ? { wordCount: p.wordCount } : {}),
    author: { '@type': 'Person', '@id': personId, name: site.professional.name, url: absoluteUrl('/sobre-mi') },
    publisher: { '@id': businessId },
  };
}

/** Safe JSON for <script type="application/ld+json">. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
