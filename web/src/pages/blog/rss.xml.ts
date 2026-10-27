import type { APIRoute } from 'astro';
import { BLOG_DESCRIPTION, buildRss } from '@/lib/blog';
import { getBlogFeed } from '@/lib/blog.server';
import { site } from '@/site.config';

// Sanar y Criar: RSS of the latest 30 articles, built on each request from the
// platform's blog API.
export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await getBlogFeed();
  if (result.status !== 'ok') {
    return new Response('El blog no está disponible en este momento. Vuelve a intentarlo en unos minutos.\n', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }
  const body = buildRss(result.data.items, {
    siteUrl: site.url,
    title: 'Blog de Sanar y Criar',
    description: BLOG_DESCRIPTION,
  });
  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
};
