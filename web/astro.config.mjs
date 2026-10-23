// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import testimonials from './src/data/testimonials.json' with { type: 'json' };
import legal from './src/data/legal.json' with { type: 'json' };

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const env = loadEnv(mode, process.cwd(), 'PUBLIC_');
const siteUrl = (env.PUBLIC_SITE_URL || 'https://www.sanarycriarve.com').replace(/\/+$/, '');

// Pages that only exist as a friendly "coming soon" state stay out of the sitemap
// until they have real content (see src/data/testimonials.json and src/content/blog).
const blogDir = fileURLToPath(new URL('./src/content/blog/', import.meta.url));
// Same rules as getPublishedPosts() (src/lib/content.ts): top-level .md files,
// no "_" templates, no drafts, no future dates.
let hasPosts = false;
try {
  hasPosts = readdirSync(blogDir).some((name) => {
    if (!name.endsWith('.md') || name.startsWith('_')) return false;
    const text = readFileSync(blogDir + name, 'utf8');
    if (/^draft:\s*true\s*$/m.test(text)) return false;
    const date = text.match(/^date:\s*["']?([^"'\r\n]+)/m)?.[1];
    return !date || !(new Date(date).getTime() > Date.now());
  });
} catch {
  hasPosts = false;
}
/** @type {Array<{ permiso?: unknown }>} */
const testimonialList = Array.isArray(testimonials) ? testimonials : [];
const hasTestimonials = testimonialList.some((t) => t && t.permiso === true);

const excluded = ['/404'];
if (!hasPosts) excluded.push('/blog');
if (!hasTestimonials) excluded.push('/testimonios');
// Legal templates stay out of the sitemap until reviewed (src/data/legal.json).
if (legal.draft === true) excluded.push('/terminos', '/privacidad', '/reembolsos');

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: siteUrl,
  output: 'static',
  // URLs without a trailing slash everywhere (links, canonical and sitemap):
  // pages are emitted as /agenda.html and served as /agenda by static hosts.
  trailingSlash: 'never',
  build: { format: 'file' },
  server: { port: 4321 },
  devToolbar: { enabled: false },
  redirects: {
    '/ebooks': '/cursos',
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/+$/, '') || '/';
        return !excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
