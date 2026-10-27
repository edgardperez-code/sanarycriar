import testimonialsData from '@/data/testimonials.json';

// Blog articles come from the course platform's API (src/lib/blog.ts).

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

/** "26 de octubre de 2026". Blog dates use timeZone 'America/Caracas'. */
export function formatDate(date: Date, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date);
}
