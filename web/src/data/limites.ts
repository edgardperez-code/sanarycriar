/**
 * «Límites sin culpa» landing page (/limites-sin-culpa), the page Google Ads
 * points to. Every line comes from the ebook (V3, 36 pages); the price is the
 * platform's (catalog), never written here. Also feeds the page's structured
 * data and llms.txt.
 */
import type { Faq } from '@/data/faqs';

export const LIMITES_PAGES = 36;

export const highlights = [
  { value: '9', label: 'partes' },
  { value: '9', label: 'actividades' },
  { value: '4', label: 'bonus imprimibles' },
];

/** «¿Te pasa esto?»: the situations the guide starts from. */
export const pains = [
  'Sabes qué límite quieres poner, pero cuando llora, protesta o te dice «¡eres mala!», algo se mueve por dentro.',
  'Terminas cediendo «por no verlo llorar» y luego te sientes mal.',
  'Gritas o amenazas, y no quieres seguir por ahí.',
  'Cuando estás cansada, aguantas, aguantas… y luego explotas.',
  'Quieres criar distinto a como te criaron, pero no sabes cómo se ve un límite respetuoso.',
  'Tu pareja o tu familia te dicen: «Dáselo, no lo hagas llorar».',
];

/** «Lo que vas a lograr» (ebook p. 5). */
export const outcomes = [
  'Entender qué es (y qué no es) un límite.',
  'Identificar por qué te cuesta ponerlos: culpa, historia, miedo o cansancio.',
  'Definir cuáles son tus límites negociables y no negociables.',
  'Aprender una fórmula de 4 pasos para límites firmes y cálidos.',
  'Saber qué hacer cuando tu hijo se enoja o se frustra.',
  'Tener frases para 10 situaciones cotidianas.',
  'Poner también límites personales: tu cuerpo, tu espacio, tu descanso.',
  'Reparar cuando tú pierdes la paciencia.',
  'Salir con tu propio plan de límites conscientes.',
];

/** The 4-step formula (ebook p. 14), shown as a preview. */
export const formula = [
  { step: 'Conexión', phrase: '«Sé que querías seguir jugando.»' },
  { step: 'Claridad', phrase: '«Ahora vamos a bañarnos.»' },
  { step: 'Firmeza', phrase: '«No voy a cambiar la decisión porque estés molesto.»' },
  { step: 'Acompañamiento', phrase: '«Puedes estar enojado. Yo me quedo contigo.»' },
];

/** Table of contents (ebook p. 2). */
export const parts = [
  'Antes de poner límites',
  '¿Por qué me cuesta tanto establecer límites?',
  'El límite que quiero poner',
  'Tu hijo puede enojarse y el límite seguir siendo válido',
  'Límites sin gritos',
  'Los límites que también son para ti',
  'Las situaciones que más nos cuestan',
  'Mamá y papá: ¿qué pasa cuando no estamos de acuerdo?',
  'Y cuando yo pierdo la paciencia…',
];

export const bonuses = [
  'Tarjeta de los 4 elementos (para el refrigerador)',
  'Hoja de frases para momentos difíciles',
  'Semáforo de la frustración',
  'Plantilla «Nuestro acuerdo de crianza»',
];

/** The 10 everyday situations of Part 7. */
export const situations = [
  'Pantallas',
  'Hora del baño',
  'Hora de dormir',
  'Dulces',
  'Supermercado',
  'Hermanos',
  'Recoger juguetes',
  'Salir de casa',
  'Cuando dice «no»',
  'Rabietas',
];

export const forWho = [
  'Mamás y papás de niños de 0 a 8 años.',
  'Quienes cedieron «por no verlo llorar» y luego se sintieron mal.',
  'Quienes gritaron o amenazaron y no quieren seguir por ahí.',
  'Quienes quieren criar distinto a como los criaron.',
];

export const notForWho = 'Quien busca fórmulas para que su hijo «se porte bien» sin mirar la relación.';

/**
 * Reviews from readers (2026-11). Extended from their own words and approved by
 * each reader, with the star rating each one gave. Marked up as Review and
 * aggregateRating on the ebook page.
 */
export interface EbookReview {
  name: string;
  detail: string;
  text: string;
  /** Stars given by the reader, 1 to 5. */
  rating: number;
  /** ISO date the review was published on the site. */
  date: string;
}

export const reviews: EbookReview[] = [
  {
    name: 'Ana Pérez',
    detail: '41 años · mamá de 2 · Valencia, Aragua',
    text: '¡Me encantó el libro! Me sorprendió darme cuenta de cuánto no sabemos como mamás y de cuánto daño les hacemos a nuestros hijos sin querer, solo por repetir lo que aprendimos. Leerlo me ayudó a mirarme con honestidad, sin culpa, y a entender que se puede poner un límite sin herir. Para mí este libro es el comienzo de un aprendizaje: quiero seguir practicando hasta lograr corregir a mis hijos sin herirlos.',
    rating: 5,
    date: '2026-11-12',
  },
  {
    name: 'María Bermúdez',
    detail: '29 años · mamá de un varón',
    text: 'Muy buen libro. Aprendí muchísimas cosas que no sabía para poder corregir a mi hijo sin perder la calma. Me gustó que es práctico: trae frases y ejemplos que se pueden usar en el día a día. Se lo recomiendo a todas las mamás que quieren poner límites con cariño.',
    rating: 5,
    date: '2026-11-12',
  },
];

/**
 * FAQs: the seven Hilda wrote for this page (2026-11), then three about buying
 * that an ad visitor needs before clicking «Lo quiero».
 */
export const limitesFaqs: Faq[] = [
  {
    id: 'limites-paginas',
    question: '¿Cuántas páginas tiene «Límites sin culpa» y cuánto tardo en leerlo?',
    answer:
      'Tiene 36 páginas. No está pensado para leerse de corrido: cada parte trae una actividad para escribir y aplicar ese mismo día. Lo ideal es avanzar una parte cada 2 o 3 días.',
  },
  {
    id: 'limites-indice',
    question: '¿Cuál es el índice del ebook?',
    answer: 'Este es el contenido completo:',
    list: [
      'Bienvenida',
      'Parte 1 · Antes de poner límites: qué es un límite y los 5 mitos',
      'Parte 2 · ¿Por qué me cuesta tanto? Tu mapa de culpa y qué hay detrás',
      'Parte 3 · Tus límites negociables y no negociables, y los 4 elementos de un límite saludable',
      'Parte 4 · Tu hijo puede enojarse y el límite seguir siendo válido',
      'Parte 5 · Límites sin gritos: antes, durante y después',
      'Parte 6 · Los límites que también son para ti',
      'Parte 7 · Las 10 situaciones que más nos cuestan',
      'Parte 8 · Mamá y papá: cuando no están de acuerdo',
      'Parte 9 · Cuando yo pierdo la paciencia: reparar',
      'Tu plan de límites conscientes',
      '4 bonos imprimibles',
    ],
  },
  {
    id: 'limites-para-quien',
    question: '¿Para quién es este ebook?',
    answer:
      'Para mamás y papás de niños de 0 a 8 años que ceden por no verlos llorar o que gritan y no quieren seguir por ahí. No es para quien busca fórmulas para que su hijo «se porte bien» sin mirar la relación.',
  },
  {
    id: 'limites-ejercicios',
    question: '¿Trae ejercicios prácticos o es solo teoría?',
    answer:
      'Trae actividades para escribir, frases listas para 10 situaciones cotidianas y tu propio plan de límites conscientes. Ten lápiz y papel a mano.',
  },
  {
    id: 'limites-bonos',
    question: '¿Qué bonos incluye?',
    answer: 'Cuatro herramientas imprimibles para pegar donde las veas:',
    list: [
      'Tarjeta de los 4 elementos de un límite',
      'Hoja de frases para momentos difíciles',
      'Semáforo de la frustración',
      'Plantilla «Nuestro acuerdo de crianza»',
    ],
  },
  {
    id: 'limites-pareja',
    question: '¿Puedo trabajarlo con mi pareja o con otros cuidadores?',
    answer: 'Sí. La Parte 8 y la plantilla de acuerdo de crianza están pensadas para hacerlas juntos.',
  },
  {
    id: 'limites-gritar',
    question: '¿Voy a dejar de gritar para siempre?',
    answer: 'No lo prometo. Sí vas a saber qué hacer antes, durante y después, incluido cómo reparar cuando te equivocas.',
  },
  {
    id: 'limites-fisico',
    question: '¿Es un libro físico?',
    answer: 'No. Es un PDF para leer en el celular o en la computadora. Los bonos están pensados para imprimirlos.',
  },
  {
    id: 'limites-pago',
    question: '¿Cómo lo pago y cuándo lo recibo?',
    answer:
      'Tocas «Lo quiero», creas tu cuenta (o entras si ya tienes una) y pagas con el método que prefieras entre los disponibles: los ves junto al precio, al inicio de esta página. Envías el comprobante por WhatsApp y, en cuanto lo confirmamos, te avisamos por correo y el ebook queda en tu cuenta.',
  },
  {
    id: 'limites-terapia',
    question: '¿Sustituye una terapia?',
    answer:
      'No. Es una guía para aprender y practicar. Si algo de tu historia duele demasiado o necesitas acompañamiento directo, puedes agendar una sesión online con Hilda.',
    link: { href: '/sesiones-online', label: 'Conoce las sesiones online' },
  },
];
