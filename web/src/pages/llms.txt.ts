import type { APIRoute } from 'astro';
import { mainAreas, otherAreas } from '@/data/areas';
import { faqs } from '@/data/faqs';
import { getServerCatalog } from '@/lib/catalog.server';
import { site } from '@/site.config';
import { SESSION_CURRENCY, SESSION_MINUTES, modalities, sessionPrices } from '@/data/sesiones';

/** Cut at a word boundary, with an ellipsis when shortened. */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 0)).trimEnd()}…`;
}

/**
 * /llms.txt (llmstxt.org): a short Markdown summary of who Hilda is, what the
 * practice offers and which pages matter, for AI assistants (ChatGPT,
 * Perplexity, Claude, Google AI). Built with the site; products and prices
 * come from the platform catalog at build time. Only verified facts.
 */
export const GET: APIRoute = async () => {
  const p = site.professional;
  const catalog = await getServerCatalog();
  const page = (path: string) => `${site.url}${path}`;

  const products = [...catalog.ebooks, ...catalog.courses]
    .filter((item) => item.free || item.price)
    .map((item) => {
      const kind = item.productType === 'ebook' ? 'ebook en PDF' : 'curso en video';
      const price = item.free ? 'gratis con una cuenta' : `${item.price} ${item.currency}`;
      const summary = item.description ? `: ${shorten(item.description, 220)}` : '';
      // «Límites sin culpa» has its own page on the site: link there, it tells more than the store.
      const href = item.offerUuid && item.offerUuid === site.funnel.featuredOfferUuid ? page('/limites-sin-culpa') : item.href;
      return `- [${item.title}](${href}) (${kind}, ${price})${summary}`;
    });

  const areas = [...mainAreas, ...otherAreas].map((area) => `- ${area.title}: ${area.description}`);
  const answers = ['consultas-online', 'edades', 'metodos-de-pago', 'sustituye-terapia']
    .map((id) => faqs.find((faq) => faq.id === id))
    .filter((faq) => faq !== undefined)
    .map((faq) => `- [${faq.question}](${page(`/preguntas-frecuentes#${faq.id}`)}): ${faq.answer}`);

  const lines = [
    `# ${site.name}`,
    '',
    `> ${p.name}, ${p.title.toLowerCase()} (${p.license}, ${p.licenseBody}). Consultas 100% online por videollamada desde ${p.city}, ${p.region} (${p.country}), para familias de Venezuela y de otros países. Cursos, ebooks y un test de crianza para acompañar la crianza desde la calma y sin culpa.`,
    '',
    `${site.name} es la práctica de ${p.name}, psicóloga y mamá. Su enfoque: antes de corregir a un hijo, la mamá mira qué se activa en ella; muchas veces lo que más ayuda a un niño es que su mamá sane su propia historia. Trabaja sin culpa ni juicios, con herramientas basadas en evidencia.`,
    '',
    'Áreas de trabajo:',
    '',
    ...areas,
    '',
    'Los cursos, ebooks y el test son recursos de orientación y aprendizaje: no sustituyen una evaluación ni un tratamiento psicológico individual.',
    '',
    '## Servicios',
    '',
    `- [Sesiones online](${page('/sesiones-online')}): asesoría de crianza consciente o espacio terapéutico para mamás, por videollamada (Zoom), ${SESSION_MINUTES} minutos, desde ${sessionPrices[0].price} ${SESSION_CURRENCY}. Se agenda por WhatsApp.`,
    `- [Test de crianza](${page('/test-de-crianza')}): 7 preguntas para saber desde dónde estás criando; ves tu resultado al crear tu cuenta gratis (incluye un ebook de regalo). No es un diagnóstico.`,
    `- [Cursos y ebooks](${page('/cursos')}): contenidos grabados para aprender a tu ritmo, en la plataforma ${site.platform.url}.`,
    `- [Talleres](${page('/talleres')}): para colegios, empresas y grupos de familias, presenciales o virtuales.`,
    '',
    '## Sesiones online',
    '',
    ...modalities.map((m) => `- [${m.name}](${page(`/sesiones-online#${m.id}`)}): ${m.summary}`),
    `- [Valor](${page('/sesiones-online#valor')}): ${sessionPrices
      .map((p) => `${p.sessions} ${p.sessions === 1 ? 'sesión' : 'sesiones'} por ${p.price} ${SESSION_CURRENCY}`)
      .join(', ')}. ${SESSION_MINUTES} minutos por sesión; el seguimiento es unos 20 días después de la primera. Pago por Binance o Pago Móvil, al menos 24 horas antes.`,
    `- [Preguntas frecuentes de las sesiones](${page('/sesiones-online#preguntas')}): para mamás, papás, abuelos, niñeras y profesionales que acompañan a niños de 0 a 8 años; la sesión es solo con los adultos; se puede reprogramar avisando con 12 horas; horario de Caracas, ajustado a tu zona.`,
    '',
    ...(products.length ? ['## Cursos y ebooks disponibles', '', ...products, ''] : []),
    '## Preguntas frecuentes',
    '',
    ...answers,
    `- [Todas las preguntas frecuentes](${page('/preguntas-frecuentes')})`,
    '',
    '## Páginas',
    '',
    `- [Inicio](${page('/')})`,
    `- [Sobre mí](${page('/sobre-mi')}): historia y formación de ${p.name}.`,
    `- [Blog](${page('/blog')}): artículos sobre crianza y salud mental infantil.`,
    `- [Preguntas frecuentes](${page('/preguntas-frecuentes')})`,
    '',
    '## Contacto',
    '',
    `- [WhatsApp](${site.contact.whatsappUrl}): para agendar una cita o resolver dudas de una compra.`,
    `- [Instagram ${site.contact.instagramHandle}](${site.contact.instagramUrl})`,
    '',
  ];

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
