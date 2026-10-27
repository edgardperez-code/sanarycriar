// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import node from '@astrojs/node';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import testimonials from './src/data/testimonials.json' with { type: 'json' };
import legal from './src/data/legal.json' with { type: 'json' };

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const env = loadEnv(mode, process.cwd(), 'PUBLIC_');
const siteUrl = (env.PUBLIC_SITE_URL || 'https://www.sanarycriarve.com').replace(/\/+$/, '');

// Pages that only exist as a friendly "coming soon" state stay out of the sitemap
// until they have real content (see src/data/testimonials.json).
/** @type {Array<{ permiso?: unknown }>} */
const testimonialList = Array.isArray(testimonials) ? testimonials : [];
const hasTestimonials = testimonialList.some((t) => t && t.permiso === true);

// /blog is rendered on demand but the sitemap integration still lists it: it goes
// in the blog's own sitemap instead, and only when there are articles.
const excluded = ['/404', '/blog'];
if (!hasTestimonials) excluded.push('/testimonios');
// Legal templates stay out of the sitemap until reviewed (src/data/legal.json).
if (legal.draft === true) excluded.push('/terminos', '/privacidad', '/reembolsos');

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: siteUrl,
  // Sanar y Criar: every page is prerendered except the blog (/blog, /blog/*) and
  // the "Del blog" server island of the home page, rendered by Node on each request
  // from the platform's blog API (src/lib/blog.server.ts). Node runs behind Caddy
  // in the same container (Dockerfile, deploy/start.sh).
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  // URLs without a trailing slash everywhere (links, canonical and sitemap):
  // pages are emitted as /agenda.html and served as /agenda by static hosts.
  trailingSlash: 'never',
  build: { format: 'file' },
  server: { port: 4321 },
  devToolbar: { enabled: false },
  redirects: {
    '/ebooks': '/cursos',
  },
  env: {
    schema: {
      // Server-only, read when Node starts: URL the site's server uses to reach the
      // blog API (e.g. a private network address). Empty = PUBLIC_LH_API.
      LH_API_INTERNAL: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/+$/, '') || '/';
        return !excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      },
      // Articles are not known at build time: the blog serves its own sitemap
      // (src/pages/blog/sitemap.xml.ts) and the index points to it.
      customSitemaps: [`${siteUrl}/blog/sitemap.xml`],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
