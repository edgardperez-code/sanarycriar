/**
 * In-person / live workshops for schools, companies and families.
 * Copy from the client's brief ("Formación para instituciones educativas,
 * empresas y familias"). Prices are always quoted individually.
 */

export interface Workshop {
  title: string;
  category: string;
  objective: string;
  audience: string[];
  duration: string;
}

export const workshops: Workshop[] = [
  {
    title: 'Neurodiversidad educativa: herramientas actualizadas para aplicar en el aula',
    category: 'Educación',
    objective:
      'Brindar a los participantes conocimientos actualizados sobre neurodiversidad y estrategias prácticas para favorecer el aprendizaje, la participación y la inclusión de estudiantes con diferentes perfiles de desarrollo dentro del aula.',
    audience: ['Docentes', 'Equipos de orientación', 'Psicólogos escolares', 'Directivos', 'Profesionales de la educación'],
    duration: '2 a 3 horas (adaptable según las necesidades de la institución).',
  },
  {
    title: 'Entendiendo el cerebro adolescente: mitos vs. realidad',
    category: 'Adolescencia',
    objective:
      'Comprender los cambios neurobiológicos propios de la adolescencia para favorecer relaciones más empáticas, fortalecer la comunicación y promover estrategias de acompañamiento respetuosas.',
    audience: ['Padres', 'Docentes', 'Orientadores', 'Profesionales que trabajan con adolescentes'],
    duration: '2 horas.',
  },
  {
    title: 'Escuelas que emocionan: estrategias para transformar la educación',
    category: 'Educación',
    objective:
      'Reflexionar sobre el papel de la escuela en el desarrollo socioemocional y proporcionar herramientas que permitan construir ambientes de aprendizaje seguros, motivadores y emocionalmente saludables.',
    audience: ['Docentes', 'Directivos', 'Coordinadores académicos', 'Equipos de orientación'],
    duration: '2 a 4 horas.',
  },
  {
    title: 'Estrategias para fortalecer el bienestar emocional de tus hijos',
    category: 'Familias',
    objective:
      'Ofrecer herramientas prácticas para que madres, padres y cuidadores promuevan la regulación emocional, el vínculo afectivo y la resiliencia en sus hijos.',
    audience: ['Padres', 'Madres', 'Cuidadores'],
    duration: '2 horas.',
  },
  {
    title: 'Rol del docente y bienestar emocional del estudiante',
    category: 'Educación',
    objective:
      'Fortalecer el rol del docente como figura protectora dentro del contexto escolar, promoviendo estrategias que favorezcan el bienestar emocional y el aprendizaje.',
    audience: ['Docentes', 'Coordinadores', 'Equipos de apoyo escolar'],
    duration: '2 a 3 horas.',
  },
  {
    title: 'Fomentando la autonomía de mi hijo con salud emocional',
    category: 'Familias',
    objective:
      'Comprender cómo desarrollar la autonomía infantil respetando el ritmo del niño, fortaleciendo su autoestima y promoviendo habilidades para la vida.',
    audience: ['Padres', 'Madres', 'Cuidadores'],
    duration: '2 horas.',
  },
  {
    title: 'Hábitos y límites que construyen el bienestar infantil',
    category: 'Infancia',
    objective:
      'Proporcionar herramientas para establecer hábitos saludables y límites respetuosos que favorezcan el desarrollo emocional, conductual y familiar.',
    audience: ['Padres', 'Madres', 'Docentes de educación inicial y primaria'],
    duration: '2 horas.',
  },
  {
    title: 'Conectados o desconectados: el impacto de la tecnología en las emociones de nuestros niños',
    category: 'Vida digital',
    objective:
      'Analizar el impacto del uso de pantallas y la tecnología en el desarrollo emocional, social y cognitivo de niños y adolescentes, ofreciendo estrategias para un uso saludable.',
    audience: ['Padres', 'Docentes', 'Instituciones educativas'],
    duration: '2 horas.',
  },
  {
    title: 'Sentir para sanar: conectando con la emoción para proteger la mente',
    category: 'Bienestar',
    objective:
      'Promover la comprensión de las emociones como un factor protector de la salud mental, desarrollando habilidades para el reconocimiento, la validación y la regulación emocional.',
    audience: ['Padres', 'Docentes', 'Empresas', 'Público general'],
    duration: '2 horas.',
  },
];

export const workshopCost =
  'Cotización personalizada según la modalidad (presencial o virtual), el número de participantes y la duración.';

export function workshopQuoteMessage(title: string): string {
  return `Hola, Hilda. Quisiera solicitar una cotización para el taller "${title}".`;
}

export const customWorkshopMessage =
  'Hola, Hilda. Quisiera solicitar una propuesta de taller o curso personalizado para mi institución o empresa.';
