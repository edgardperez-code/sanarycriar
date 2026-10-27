import type { APIRoute } from 'astro';
import { buildSitemap } from '@/lib/blog';
import { getBlogSitemap } from '@/lib/blog.server';
import { site } from '@/site.config';

// Sanar y Criar: sitemap of the blog (on-demand pages are not in the main one;
// astro.config.mjs lists this file in sitemap-index.xml).
export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await getBlogSitemap();
  if (result.status !== 'ok') {
    return new Response('El blog no está disponible en este momento. Vuelve a intentarlo en unos minutos.\n', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(buildSitemap(result.data, site.url), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
};
