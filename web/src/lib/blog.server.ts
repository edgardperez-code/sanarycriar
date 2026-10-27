import { LH_API_INTERNAL } from 'astro:env/server';
import { site } from '@/site.config';
import { BLOG_PAGE_SIZE, createBlogClient } from './blog';

/**
 * Blog client of the site's server (only on-demand routes and the "Del blog"
 * server island use it; prerendered pages never call it). One instance per
 * Node process, so its in-memory copy of the last good answers is shared by
 * every visit.
 */

// Optional internal URL (server → API), read when Node starts; when missing or
// not http(s), the public one fixed at build time (PUBLIC_LH_API).
const internal = (LH_API_INTERNAL ?? '').trim().replace(/\/+$/, '');
const apiBase = /^https?:\/\//.test(internal) ? internal : site.platform.apiBase;

// assetBase is the PUBLIC API origin, so a relative cover URL never points to an internal host.
const client = createBlogClient({ apiBase, orgId: site.platform.orgId, assetBase: new URL(site.platform.apiBase).origin, timeoutMs: 5000 });

export const getBlogPage = (page: number) => client.list(page, BLOG_PAGE_SIZE);
export const getBlogPost = (slug: string) => client.post(slug);
export const getLatestPosts = (count = 3) => client.list(1, count);
export const getBlogFeed = () => client.list(1, 30);
export const getBlogSitemap = () => client.sitemap();
