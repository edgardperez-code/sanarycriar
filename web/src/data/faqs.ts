/**
 * Frequently asked questions, rewritten for the new model: purchases happen on
 * the course platform (cart + Pago Móvil now, PayPal soon), an account is
 * needed to see the content, and access arrives once the payment is confirmed.
 */

export interface Faq {
  id: string;
  question: string;
  answer: string;
  /** Optional link shown after the answer. Paths starting with "/" are internal. */
  link?: { href: string; label: string };
  /** Shown on the Home page (keep it to about five). */
  home?: boolean;
}

export const faqs: Faq[] = [
  {
    id: 'consultas-online',
    question: '¿Las consultas son online?',
    answer:
      'Sí. Todas las consultas son 100% online, por videollamada, desde la comodidad de tu casa. Atiendo desde Lechería (Anzoátegui) a familias de Venezuela y de otros países.',
    link: { href: '/agenda', label: 'Cómo agendar tu consulta' },
    home: true,
  },
  {
    id: 'como-comprar',
    question: '¿Cómo compro un curso o un ebook?',
    answer:
      'Elige el producto en la sección de cursos y ebooks y agrégalo al carrito; puedes llevar varios y pagarlos juntos. El carrito está en la plataforma de cursos de Sanar y Criar: ahí creas tu cuenta (o inicias sesión), confirmas tu pedido y pagas con Pago Móvil.',
    link: { href: '/cursos', label: 'Ver cursos y ebooks' },
    home: true,
  },
  {
    id: 'metodos-de-pago',
    question: '¿Qué métodos de pago aceptan?',
    answer:
      'Pagas con Pago Móvil en bolívares, a la tasa del día: agregas tus cursos al carrito, haces el Pago Móvil y nos envías el comprobante por WhatsApp. En cuanto lo confirmamos tienes acceso (te avisamos por correo). Muy pronto también PayPal. Los precios se muestran en dólares (USD) y, al confirmar tu pedido, ves el monto exacto en bolívares.',
    home: true,
  },
  {
    id: 'acceso-inmediato',
    question: '¿Cuándo tengo acceso a lo que compré?',
    answer:
      'En cuanto confirmamos tu Pago Móvil: revisamos el comprobante que nos envías por WhatsApp y, al confirmarlo, el curso o ebook queda disponible en tu cuenta y te llega un correo. Cuando llegue PayPal, pagando con PayPal el acceso será inmediato.',
    home: true,
  },
  {
    id: 'cuenta',
    question: '¿Necesito crear una cuenta?',
    answer:
      'Sí. Tu cuenta es la llave para ver tus cursos y leer tus ebooks desde cualquier dispositivo. Además, la plataforma recuerda dónde te quedaste para que retomes cada video sin buscarlo.',
    home: true,
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
      'Mi enfoque principal es la primera infancia (de 1 a 5 años) y el acompañamiento a mamás durante el embarazo, el posparto y la crianza. También trabajo temas de la infancia y la adolescencia. Si no sabes si puedo ayudarte, escríbeme y lo conversamos.',
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

export const homeFaqs = faqs.filter((faq) => faq.home);
