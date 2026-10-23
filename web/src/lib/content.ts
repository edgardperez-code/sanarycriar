import { getCollection, type CollectionEntry } from 'astro:content';
import testimonialsData from '@/data/testimonials.json';

export type BlogPost = CollectionEntry<'blog'>;

// Markdown files that the collection would load (skips "_EJEMPLO" templates).
// Checked first so an empty blog does not trigger Astro's "empty collection" warning.
const postFiles = import.meta.glob('/src/content/blog/[^_]*.md');

/** Published posts (not drafts, not dated in the future), newest first. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  if (Object.keys(postFiles).length === 0) return [];
  const now = Date.now();
  const posts = await getCollection('blog', (entry) => !entry.data.draft && entry.data.date.getTime() <= now);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export interface Testimonial {
  nombre: string;
  ciudad?: string;
  frase: string;
  texto: string;
  permiso: boolean;
  fecha?: string;
}

function isTestimonial(value: unknown): value is Testimonial {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.nombre === 'string' &&
    typeof t.frase === 'string' &&
    typeof t.texto === 'string' &&
    t.permiso === true
  );
}

/** Real testimonials only: entries need explicit permission ("permiso": true). */
export function getTestimonials(): Testimonial[] {
  const list: unknown[] = Array.isArray(testimonialsData) ? testimonialsData : [];
  return list.filter(isTestimonial);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
