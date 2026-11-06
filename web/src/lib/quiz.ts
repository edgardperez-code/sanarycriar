/**
 * Parenting test "¿Desde dónde estás criando?" (7 questions). Questions and
 * scoring are the client's (Downloads/Encuesta Hilda.pdf and the guide page of
 * 2026-11): every answer adds points to one of three paths, and the path
 * decides what we offer next (free guide, «Límites sin culpa» or a session).
 *
 * The result is shown on the course platform after signing up (/regalo); this
 * file only computes which path it is.
 *
 * Sanar y Criar: no imports and erasable-only TypeScript, so
 * `node --test scripts/test-quiz.mjs` can import this file as is.
 */

export type QuizPath = 'guia' | 'limites' | 'cita';
export type QuizPoints = Partial<Record<QuizPath, number>>;

export interface QuizOption {
  text: string;
  points: QuizPoints;
}

export interface QuizQuestion {
  prompt: string;
  options: QuizOption[];
}

export const QUIZ_PATHS: readonly QuizPath[] = ['guia', 'limites', 'cita'];
export const QUIZ_LETTERS = 'ABCD';
/** From this many "cita" points on, the result is a session whatever the rest says. */
export const CITA_THRESHOLD = 4;

export const quizIntro =
  'Este test no busca etiquetarte como madre. Busca ayudarte a reconocer tus patrones… y decirte por dónde empezar.';

export const quizInstructions =
  'Elige la respuesta que más se parece a lo que sueles hacer, aunque no sea la que consideras «ideal».';

export const quizQuestions: QuizQuestion[] = [
  {
    prompt: 'Tu hijo hace una rabieta porque no le compras algo que quiere. Tú…',
    options: [
      { text: 'Le explicas que entiendes que esté molesto, mantienes el límite y lo acompañas.', points: { guia: 1 } },
      { text: 'Le dices que deje de llorar y que debe aprender a aceptar un «no».', points: { limites: 1 } },
      { text: 'Si el llanto se alarga, terminas comprándoselo para que se calme.', points: { limites: 1 } },
      { text: 'Intentas mantener la calma, pero si estás cansada terminas levantando la voz.', points: { guia: 1 } },
    ],
  },
  {
    prompt: 'Después de perder la paciencia con tu hijo, lo que más sientes es…',
    options: [
      { text: 'Culpa: pienso que soy una mala mamá.', points: { guia: 1 } },
      { text: 'Miedo de haberle hecho daño.', points: { guia: 1 } },
      { text: 'Frustración, porque no logro que me haga caso sin gritar.', points: { limites: 1 } },
      { text: 'Agotamiento: siento que ya no puedo con esto sola.', points: { cita: 1 } },
    ],
  },
  {
    prompt: 'Cuando le dices «no» a tu hijo…',
    options: [
      { text: 'Lo sostengo con calma, aunque llore.', points: { guia: 1 } },
      { text: 'Me cuesta: termino cediendo o negociando.', points: { limites: 1 } },
      { text: 'Lo repito varias veces y al final grito.', points: { limites: 1 } },
      { text: 'Siento culpa, como si le estuviera quitando amor.', points: { limites: 1 } },
    ],
  },
  {
    prompt: '¿Qué edad tiene tu hijo o hija? Si tienes varios, piensa en el que más te preocupa.',
    options: [
      { text: '0 a 3 años', points: {} },
      { text: '4 a 8 años', points: {} },
      { text: '9 a 12 años', points: { cita: 1 } },
      { text: '13 años o más', points: { cita: 2 } },
    ],
  },
  {
    prompt: 'Lo que más te preocupa hoy es…',
    options: [
      { text: 'Sus rabietas y que no acepte un «no».', points: { limites: 1 } },
      { text: 'Mi forma de reaccionar, más que su conducta.', points: { guia: 1 } },
      {
        text: 'Algo que se repite desde hace meses: miedos intensos, dificultades en el colegio o con otros niños.',
        points: { cita: 2 },
      },
      { text: 'Creo que podría necesitar una evaluación (TDAH, autismo o ansiedad).', points: { cita: 2 } },
    ],
  },
  {
    prompt: '¿Cuánto afecta esto el día a día en casa?',
    options: [
      { text: 'Poco: son momentos puntuales.', points: { guia: 1 } },
      { text: 'Bastante: pasa casi todos los días.', points: { limites: 1 } },
      { text: 'Mucho: afecta el sueño, el colegio o la convivencia de toda la familia.', points: { cita: 2 } },
    ],
  },
  {
    prompt: '¿Qué te gustaría ahora?',
    options: [
      { text: 'Entenderme mejor, a mi ritmo y sin presión.', points: { guia: 1 } },
      { text: 'Herramientas concretas para poner límites esta misma semana.', points: { limites: 1 } },
      { text: 'Que alguien me escuche y me guíe en mi caso.', points: { cita: 2 } },
    ],
  },
];

/** Answer per question: the option index, or null while unanswered. */
export type QuizAnswers = ReadonlyArray<number | null>;

export function emptyAnswers(questions: readonly QuizQuestion[] = quizQuestions): (number | null)[] {
  return questions.map(() => null);
}

/** Points per path for the given answers (unanswered or invalid answers add nothing). */
export function scoreAnswers(
  answers: QuizAnswers,
  questions: readonly QuizQuestion[] = quizQuestions,
): Record<QuizPath, number> {
  const totals: Record<QuizPath, number> = { guia: 0, limites: 0, cita: 0 };
  questions.forEach((question, index) => {
    const answer = answers[index];
    if (typeof answer !== 'number' || !Number.isInteger(answer)) return;
    const option = question.options[answer];
    if (!option) return;
    for (const path of QUIZ_PATHS) totals[path] += option.points[path] ?? 0;
  });
  return totals;
}

/** The client's rule: a session from CITA_THRESHOLD on; else limits when they tie or win; else the free guide. */
export function quizResult(answers: QuizAnswers, questions: readonly QuizQuestion[] = quizQuestions): QuizPath {
  const totals = scoreAnswers(answers, questions);
  if (totals.cita >= CITA_THRESHOLD) return 'cita';
  return totals.limites >= totals.guia ? 'limites' : 'guia';
}

export function isComplete(answers: QuizAnswers, questions: readonly QuizQuestion[] = quizQuestions): boolean {
  return (
    answers.length === questions.length &&
    questions.every((question, index) => {
      const answer = answers[index];
      return typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
    })
  );
}
