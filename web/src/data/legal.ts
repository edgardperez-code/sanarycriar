/**
 * Legal pages are templates until a lawyer reviews them. While `draft` is true
 * they show a warning banner, carry `noindex` and stay out of the sitemap
 * (astro.config.mjs reads the same flag from legal.json).
 */
import legal from './legal.json';

export const legalDraft: boolean = legal.draft === true;
export const legalUpdated: string = legal.updated;
