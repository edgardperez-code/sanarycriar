/**
 * «Sesiones online» page (client document «Sesiones online · Sanar y Criar»,
 * 2026-11). Prices, modalities, testimonials and FAQs as Hilda wrote them;
 * the last three FAQs of «Sobre la asesoría» are ours (marked below) and go to
 * Hilda for review. Also the source of the page's structured data and llms.txt.
 */
import type { Faq } from '@/data/faqs';

export const SESSION_MINUTES = 60;
export const SESSION_CURRENCY = 'USD';

/** Packages: sessions × price (USD). */
export const sessionPrices = [
  { sessions: 1, price: 80 },
  { sessions: 2, price: 140 },
  { sessions: 3, price: 215 },
] as const;

export const sessionWhatsappMessage = 'Hola, Hilda. Quisiera agendar una sesión online.';

export const modalities = [
  {
    id: 'asesoria-de-crianza',
    name: 'Asesoría de crianza',
    summary: 'Orientación práctica para entender a tu hijo y sostener límites y rutinas. Es una asesoría, no una terapia.',
    forWho: 'Si quieres herramientas para entender y acompañar mejor a tu hijo.',
  },
  {
    id: 'espacio-terapeutico-para-mamas',
    name: 'Espacio terapéutico para mamás',
    summary: 'Un proceso personal para trabajar tu salud emocional, tu historia, la culpa y el cansancio de la maternidad.',
    forWho: 'Si sientes que necesitas un espacio para ti, para soltar la carga y cuidarte.',
  },
] as const;

export const includes = [
  'Exploración del motivo de consulta',
  'Análisis de las causas',
  'Herramientas prácticas',
  'Recomendaciones personalizadas por escrito',
];

export interface SessionTestimonial {
  name: string;
  detail: string;
  /** Paragraphs, as the family wrote them. */
  text: string[];
  time: string;
}

export const sessionTestimonials: SessionTestimonial[] = [
  {
    name: 'Verónica',
    detail: 'mamá de dos niños',
    text: [
      'Soy Verónica, mamá de dos niños de 8 y 2 años, y desde hace aproximadamente cinco años he contado con el acompañamiento de la doctora Hilda Hernández. Su orientación ha sido invaluable para mí y para mi familia.',
      'Comencé a acudir a ella durante la crianza de mi primer hijo, Mathías, y ahora que soy mamá de dos, sigue siendo un gran apoyo en esta nueva etapa. Siempre que he necesitado ayuda ante alguna situación específica, he encontrado en ella una guía clara y herramientas muy útiles para afrontar los retos de la maternidad con mayor confianza.',
      'Como psicóloga especialista en niños y crianza, me ha ayudado muchísimo a comprender mejor a mis hijos y a crecer también como mamá. Valoro profundamente su profesionalismo, su calidez y la tranquilidad que me brinda contar con su orientación.',
    ],
    time: '6:12 p. m.',
  },
  {
    name: 'Vanessa',
    detail: 'mamá de dos niños de 2 y 4 años',
    text: [
      'Hola Hilda! Buenos días ☺️🙏🏻 que te puedo decir, para mí tu acompañamiento ha sido muy valioso, comencé en tu consulta para papás con mi esposo porque a veces la carga se hace pesada sin ayuda.',
      'Eso nos ayudó muchísimo a identificar situaciones que quizá no estábamos llevando de la mejor forma y de allí también a observarnos mejor nosotros antes de poner el ojo en mi hijo. Tu guía me ha servido muchísimo para darme palmaditas de aliento, bajarle dos a las expectativas y también aceptar muchas cosas que no puedo cambiar.',
      'Gracias por tu compañía, por tu profesionalismo y porque siempre sin saberlo, tienes palabras que me caen como anillo al dedo. 😂🙏🏻 Gracias por tanta información bonita 🥰🙏🏻',
    ],
    time: '8:48 a. m.',
  },
];

export interface FaqGroup {
  id: string;
  title: string;
  items: Faq[];
}

export const sessionFaqGroups: FaqGroup[] = [
  {
    id: 'sobre-la-asesoria',
    title: 'Sobre la asesoría',
    items: [
      {
        id: 'en-que-consiste',
        question: '¿En qué consiste la asesoría online?',
        answer:
          'Es una asesoría de crianza consciente por videollamada. Exploramos el motivo de consulta, analizamos las causas y te llevas herramientas prácticas para aplicar desde ese mismo día.',
      },
      {
        id: 'para-quien',
        question: '¿Para quién es?',
        answer: 'Para mamás, papás, abuelos, niñeras y profesionales que acompañan a niños de 0 a 8 años.',
      },
      { id: 'duracion', question: '¿Cuánto dura una sesión?', answer: '60 minutos.' },
      {
        id: 'que-incluye',
        question: '¿Qué incluye?',
        answer:
          'Exploración del motivo de consulta, análisis de las causas, herramientas prácticas y recomendaciones personalizadas por escrito. Los ebooks no están incluidos.',
      },
      {
        id: 'es-terapia',
        question: '¿Es una terapia?',
        answer:
          'Depende de la modalidad que elijas. Tengo dos. Asesoría de crianza: orientación práctica para entender a tu hijo y sostener límites y rutinas; es una asesoría, no una terapia. Espacio terapéutico para mamás: un proceso personal para trabajar tu salud emocional, tu historia, la culpa y el cansancio de la maternidad.',
      },
      {
        id: 'que-modalidad',
        question: '¿Cómo sé cuál modalidad elegir?',
        answer:
          'Si quieres herramientas para entender y acompañar mejor a tu hijo, empieza por la asesoría. Si sientes que necesitas un espacio para ti, para soltar la carga y cuidarte, el espacio para mamás es para ti. Si no estás segura, escríbeme por WhatsApp y te oriento.',
      },
      { id: 'hijo-en-sesion', question: '¿Mi hijo tiene que estar en la sesión?', answer: 'No. La sesión es solo con los adultos.' },
      // Ours (not in Hilda's document): for review.
      {
        id: 'en-pareja',
        question: '¿Puedo ir a la sesión con mi pareja?',
        answer:
          'Sí. Pueden conectarse juntos a la misma videollamada. Muchas familias vienen en pareja, porque la crianza se comparte y ayuda que los dos escuchen lo mismo.',
      },
      {
        id: 'presencial',
        question: '¿Las sesiones son presenciales?',
        answer: 'No. Todas las sesiones son online, por videollamada, para que te conectes desde tu casa, estés donde estés.',
      },
      {
        id: 'diagnostico-previo',
        question: '¿Necesito un diagnóstico o un informe previo?',
        answer:
          'No. Basta con contarme lo que estás viviendo. Si tienes informes del colegio o de otros especialistas, puedes compartirlos: ayudan a entender mejor la situación.',
      },
    ],
  },
  {
    id: 'costo-y-pagos',
    title: 'Costo y pagos',
    items: [
      {
        id: 'cuanto-cuesta',
        question: '¿Cuánto cuesta?',
        answer: 'Una sesión de 60 minutos cuesta 80 USD, en cualquiera de las dos modalidades.',
      },
      {
        id: 'paquetes',
        question: '¿Hay paquetes?',
        answer:
          'Sí. Una sesión por 80 USD, un paquete de dos sesiones por 140 USD o un paquete de tres sesiones por 215 USD. Las sesiones de seguimiento se hacen unos 20 días después de la primera.',
      },
      {
        id: 'como-pago',
        question: '¿Cómo pago?',
        answer:
          'Puedes pagar por PayPal, Binance o Pago Móvil (en bolívares, a la tasa del día), al menos 24 horas antes de la sesión. Si eliges Pago Móvil, envíame el comprobante por WhatsApp para confirmar tu cita.',
      },
    ],
  },
  {
    id: 'agenda-y-cambios',
    title: 'Agenda y cambios',
    items: [
      { id: 'como-agendo', question: '¿Cómo agendo?', answer: 'Por WhatsApp. Te confirmo el horario y te envío los datos de pago.' },
      {
        id: 'cancelar',
        question: '¿Puedo cancelar o reprogramar?',
        answer:
          'Sí, avisando con un mínimo de 12 horas de anticipación. Si no avisas a tiempo, la sesión se reprograma, pero se paga de nuevo.',
      },
      {
        id: 'horario',
        question: '¿Desde dónde atiendes y en qué horario?',
        answer:
          'Atiendo desde Lechería, Venezuela, a familias de otros países. Mi horario es el de Caracas, Venezuela, y al agendar ajustamos la hora a tu zona.',
      },
      { id: 'plataforma', question: '¿Por qué plataforma es la videollamada?', answer: 'Por Zoom. Te envío el enlace el mismo día de la sesión.' },
    ],
  },
  {
    id: 'antes-y-despues',
    title: 'Antes y después',
    items: [
      {
        id: 'preparar',
        question: '¿Qué necesito preparar?',
        answer: 'Un lugar tranquilo y buena conexión. Si puedes, llega con 2 o 3 situaciones concretas que quieras trabajar.',
      },
      {
        id: 'seguimiento',
        question: '¿Tengo seguimiento?',
        answer:
          'Sí. La sesión de seguimiento se hace unos 20 días después de la primera y puedes tenerla dentro de un paquete de dos sesiones (140 USD) o de tres sesiones (215 USD). Si prefieres una sola sesión (80 USD), el seguimiento se agenda aparte, con su propio pago.',
      },
      {
        id: 'cuantas-sesiones',
        question: '¿Cuántas sesiones necesito?',
        answer: 'Muchas familias avanzan con una o dos. Se define según tu caso.',
      },
      { id: 'confidencial', question: '¿Es confidencial?', answer: 'Sí. Lo que se conversa en la sesión es privado.' },
      {
        id: 'algo-mas',
        question: '¿Qué pasa si mi caso necesita algo más?',
        answer: 'Te lo digo con claridad. Si hace falta otro tipo de acompañamiento, te oriento hacia él.',
      },
    ],
  },
];

export const sessionFaqs: Faq[] = sessionFaqGroups.flatMap((group) => group.items);
