/**
 * Frequently asked questions, rewritten for the new model: purchases happen on
 * the course platform (cart; Pago Móvil, bank transfer, Zelle or Binance), an
 * account is needed to see the content, and access arrives once the payment is
 * confirmed. Also marked up as FAQPage for search engines and AI assistants.
 */

export interface Faq {
  id: string;
  question: string;
  answer: string;
  /** Optional link shown after the answer. Paths starting with "/" are internal. */
  link?: { href: string; label: string };
}

export const faqs: Faq[] = [
  {
    id: 'consultas-online',
    question: '¿Las consultas son online?',
    answer:
      'Sí. Todas las consultas son 100% online, por videollamada, desde la comodidad de tu casa. Atiendo desde Lechería (Anzoátegui) a familias de Venezuela y de otros países.',
    link: { href: '/sesiones-online', label: 'Sesiones online: precios y cómo agendar' },
  },
  {
    id: 'como-comprar',
    question: '¿Cómo compro un curso o un ebook?',
    answer:
      'Elige el producto en la sección de cursos y ebooks y agrégalo al carrito; puedes llevar varios y pagarlos juntos. El carrito está en la plataforma de cursos de Sanar y Criar: ahí creas tu cuenta (o inicias sesión), confirmas tu pedido y pagas con el método que prefieras.',
    link: { href: '/cursos', label: 'Ver cursos y ebooks' },
  },
  {
    // Keep in step with the methods Hilda has turned on (site.payments).
    id: 'metodos-de-pago',
    question: '¿Qué métodos de pago aceptan?',
    answer:
      'Puedes pagar con Pago Móvil o transferencia bancaria en bolívares, a la tasa del día, o en dólares con Zelle o Binance. Agregas tus cursos al carrito, eliges cómo pagar, haces el pago y nos envías el comprobante por WhatsApp. En cuanto lo confirmamos tienes acceso (te avisamos por correo). Los precios se muestran en dólares (USD); si pagas en bolívares, al confirmar tu pedido ves el monto exacto.',
  },
  {
    id: 'acceso-inmediato',
    question: '¿Cuándo tengo acceso a lo que compré?',
    answer:
      'En cuanto confirmamos tu pago: revisamos el comprobante que nos envías por WhatsApp y, al confirmarlo, el curso o ebook queda disponible en tu cuenta y te llega un correo.',
  },
  {
    id: 'cuenta',
    question: '¿Necesito crear una cuenta?',
    answer:
      'Sí. Tu cuenta es la llave para ver tus cursos y leer tus ebooks desde cualquier dispositivo. Además, la plataforma recuerda dónde te quedaste para que retomes cada video sin buscarlo.',
  },
  {
    id: 'a-tu-ritmo',
    question: '¿Puedo ver los cursos a mi ritmo?',
    answer:
      'Sí. Los cursos son grabados: avanzas cuando puedas, desde el celular o la computadora, y puedes volver a ver las lecciones las veces que necesites.',
  },
  {
    id: 'ebooks-pdf',
    question: '¿Los ebooks se pueden descargar?',
    answer:
      'Sí. Después de comprar puedes leer el ebook en la plataforma o descargar el PDF para leerlo cuando quieras.',
  },
  {
    id: 'curso-o-consulta',
    question: '¿Qué diferencia hay entre un curso y una consulta?',
    answer:
      'Los cursos y ebooks son contenidos grabados para aprender a tu ritmo. Las consultas son sesiones en vivo, personales y confidenciales, pensadas para tu caso y el de tu familia.',
  },
  {
    id: 'sustituye-terapia',
    question: '¿Un curso puede reemplazar una consulta o una terapia?',
    answer:
      'No. Los cursos, ebooks y el test de crianza son recursos de orientación y aprendizaje. No sustituyen una evaluación ni un tratamiento psicológico individual. Si algo te preocupa, lo mejor es conversarlo en consulta.',
  },
  {
    id: 'edades',
    question: '¿Con qué edades trabajas?',
    answer:
      'Trabajo con familias de niños de 0 a 8 años y acompaño a mamás durante el embarazo, el posparto y la crianza. Si no sabes si puedo ayudarte, escríbeme y lo conversamos.',
  },
  {
    id: 'talleres',
    question: '¿Haces talleres para colegios, empresas o grupos de familias?',
    answer:
      'Sí. Los talleres pueden ser presenciales o virtuales en vivo, y se adaptan a cada institución. El costo se cotiza según la modalidad, el número de participantes y la duración.',
    link: { href: '/talleres', label: 'Ver talleres' },
  },
  {
    id: 'problema-compra',
    question: '¿Qué hago si tengo un problema con mi compra?',
    answer:
      'Escríbeme por WhatsApp con el correo de tu cuenta (y el código de tu pedido, si lo tienes) y te ayudo. También puedes revisar la política de reembolsos.',
    link: { href: '/reembolsos', label: 'Política de reembolsos' },
  },
];

/** Questions about the paid ebook, shown in its Home block. */
export const ebookFaqs: Faq[] = [
  { id: 'ebook-fisico', question: '¿El ebook es un libro físico?', answer: 'No. Es un PDF para leer en el celular o en la computadora.' },
  {
    id: 'ebook-cuando',
    question: '¿Cuándo recibo el ebook?',
    answer: 'En cuanto confirmamos tu pago. Te avisamos por correo y queda en tu cuenta.',
  },
  {
    id: 'ebook-terapia',
    question: '¿El ebook sustituye una terapia?',
    answer: 'No. Es una guía para aprender. Si necesitas acompañamiento directo, al final de esta página puedes agendar tu cita.',
  },
];

/** General questions shown on the Home page («¿En qué te puedo ayudar?»). */
export const homeFaqIds = ['consultas-online', 'edades', 'curso-o-consulta'] as const;
export const homeFaqs: Faq[] = homeFaqIds.map((id) => faqs.find((f) => f.id === id)).filter((f): f is Faq => Boolean(f));
