/**
 * Parenting quiz "¿Desde dónde estás criando?" (15 questions).
 * Questions and scoring key are copied verbatim from the client's form
 * (attached_assets/Pasted-Formulario-…txt in the original project).
 */

export type QuizLetter = 'A' | 'B' | 'C' | 'D';
export type QuizAnswer = QuizLetter | null;
export type ParentingStyle = 'Consciente' | 'Autoritaria' | 'Permisiva' | 'Reactiva';

export interface QuizQuestion {
  prompt: string;
  options: [string, string, string, string];
}

export const QUIZ_LETTERS: readonly QuizLetter[] = ['A', 'B', 'C', 'D'];
export const QUIZ_STYLES: readonly ParentingStyle[] = ['Consciente', 'Autoritaria', 'Permisiva', 'Reactiva'];

export const quizIntro =
  'Este test no busca etiquetarte como madre. Busca ayudarte a reconocer qué patrones aparecen con mayor frecuencia en tu manera de responder a las situaciones cotidianas de la crianza.';

export const quizInstructions =
  'Elige la respuesta que más se parece a lo que sueles hacer, incluso si no es la respuesta que consideras “ideal”.';

export const quizQuestions: QuizQuestion[] = [
  {
    prompt: 'Tu hijo hace una rabieta porque no le compras algo que quiere. Tú…',
    options: [
      'Le explicas que entiendes que esté molesto, pero mantienes el límite y lo acompañas mientras atraviesa su frustración.',
      'Le dices que deje de llorar y que debe aprender a aceptar un “no”.',
      'Si el llanto se prolonga demasiado, terminas comprándoselo para que se calme.',
      'Intentas mantenerte tranquila, pero si estás cansada puedes terminar perdiendo la paciencia y levantando la voz.',
    ],
  },
  {
    prompt: 'Tu hijo no quiere recoger sus juguetes.',
    options: [
      'Te molestas y le dices que tiene que hacerlo porque tú eres quien manda.',
      'Terminas recogiéndolos tú porque no quieres entrar en una discusión.',
      'Dependiendo de cómo haya sido tu día, puedes insistir, gritar o terminar haciéndolo tú.',
      'Le recuerdas el límite, le das opciones acordes a su edad y lo acompañas a recoger.',
    ],
  },
  {
    prompt: 'Tu hijo comete un error que podría haberse evitado.',
    options: [
      'Le señalas que ya le habías advertido y que tiene que aprender a hacer las cosas correctamente.',
      'Intentas solucionarlo rápidamente para evitar que se sienta mal.',
      'Tu reacción depende mucho de tu nivel de cansancio y puedes reaccionar con más intensidad de la que quisieras.',
      'Aprovechas la situación para ayudarlo a comprender qué ocurrió y pensar juntos qué puede hacer diferente la próxima vez.',
    ],
  },
  {
    prompt: 'Estás agotada y tu hijo quiere seguir jugando contigo.',
    options: [
      'Le dices que eres la mamá y que tiene que entender que ahora no puedes.',
      'Juegas un rato más aunque realmente necesitas descansar, porque te cuesta decirle que no.',
      'Intentas atenderlo, pero tu agotamiento hace que puedas responderle con irritación.',
      'Le explicas que estás cansada, validas que quiera estar contigo y buscas una alternativa que también cuide tu necesidad de descanso.',
    ],
  },
  {
    prompt: 'Tu hijo te responde de una manera que consideras irrespetuosa.',
    options: [
      'Le dices que no puede hablarte así y aplicas una consecuencia para que aprenda a respetarte.',
      'Lo dejas pasar porque prefieres evitar una discusión.',
      'Puedes reaccionar impulsivamente y después sentir que exageraste.',
      'Pones un límite claro a la forma de hablarte y, cuando ambos estén tranquilos, intentas comprender qué había detrás de su reacción.',
    ],
  },
  {
    prompt: 'Tu hijo tiene miedo de hacer algo nuevo.',
    options: [
      'Le dices que no tiene por qué tener miedo y que debe hacerlo.',
      'Si tiene miedo, prefieres evitar la situación para que no lo pase mal.',
      'Intentas ayudarlo, pero si estás preocupada o estresada puedes terminar presionándolo.',
      'Reconoces su miedo, le das seguridad y lo acompañas progresivamente a enfrentarse a la situación.',
    ],
  },
  {
    prompt: 'Tu hijo llora porque no quiere irse del parque.',
    options: [
      'Le dices que se acabó y que tiene que obedecer; no quieres negociar.',
      'Le permites quedarse un poco más cada vez que llora.',
      'Intentas sacarlo, pero si la situación se vuelve muy intensa puedes terminar gritándole.',
      'Le anticipas el final, reconoces que quería seguir jugando y mantienes el límite aunque esté molesto.',
    ],
  },
  {
    prompt: 'Tu hijo tiene una conducta que te avergüenza delante de otras personas.',
    options: [
      'Te preocupa mucho lo que los demás piensen y buscas que tu hijo se comporte inmediatamente.',
      'Prefieres permitirle hacerlo para evitar una escena delante de los demás.',
      'La vergüenza y la presión del momento pueden hacer que reacciones de una manera que después lamentas.',
      'Recuerdas que la conducta de tu hijo no define tu capacidad como madre y buscas intervenir sin perder de vista lo que necesita.',
    ],
  },
  {
    prompt: 'Tu hijo insiste en hacer algo que ya le dijiste que no puede hacer.',
    options: [
      'Aumentas la firmeza y le haces saber que la decisión del adulto no se discute.',
      'Terminas negociando o cediendo porque estás cansada de repetir lo mismo.',
      'Puedes pasar de explicárselo tranquilamente a explotar después de varias veces.',
      'Mantienes el límite, aunque tenga emociones intensas, y evitas entrar en una lucha de poder.',
    ],
  },
  {
    prompt: 'Después de un día difícil, pierdes la paciencia con tu hijo.',
    options: [
      'Consideras que debe aprender que determinadas conductas tienen consecuencias.',
      'Intentas compensarlo inmediatamente haciendo algo que sabes que le gusta.',
      'Te sientes culpable, pero no siempre sabes cómo reparar lo ocurrido.',
      'Reconoces tu reacción, te disculpas sin responsabilizarlo por tus emociones y buscas reparar la conexión.',
    ],
  },
  {
    prompt: 'Tu hijo te pide ayuda para algo que podría intentar solo.',
    options: [
      'Le dices que debe aprender a hacerlo por sí mismo.',
      'Lo ayudas inmediatamente porque no quieres verlo frustrarse.',
      'A veces lo ayudas y otras veces te irritas porque sientes que debería poder hacerlo solo.',
      'Valoras qué puede hacer por sí mismo y le das la ayuda necesaria sin quitarle la oportunidad de aprender.',
    ],
  },
  {
    prompt: 'Tu hijo está muy emocionado y hace mucho ruido en casa.',
    options: [
      'Le pides que baje el tono porque debe aprender a comportarse adecuadamente.',
      'Lo dejas porque quieres que pueda expresarse libremente.',
      'Al principio lo toleras, pero después de un rato puedes terminar explotando.',
      'Reconoces su emoción y energía, pero también le enseñas cuándo y dónde necesitamos regular el volumen.',
    ],
  },
  {
    prompt: 'Tu hijo no quiere hacer algo que consideras necesario.',
    options: [
      'Le recuerdas que eres el adulto y que debe hacerlo aunque no quiera.',
      'Si se resiste mucho, prefieres dejarlo para otro momento.',
      'Intentas convencerlo varias veces y terminas reaccionando según tu nivel de paciencia.',
      'Te preguntas qué está dificultando la situación, pero también mantienes el límite cuando es necesario.',
    ],
  },
  {
    prompt: 'Cuando tu hijo tiene una emoción intensa…',
    options: [
      'Consideras importante enseñarle a controlarse y no dejarse llevar por sus emociones.',
      'Intentas hacer todo lo posible para que deje de sentirse mal.',
      'Si su emoción ocurre cuando tú estás sobrepasada, puede resultarte muy difícil acompañarlo.',
      'Intentas recordar que la emoción puede ser válida aunque la conducta necesite un límite.',
    ],
  },
  {
    prompt: 'Cuando piensas en tu manera de criar…',
    options: [
      'Creo que los niños necesitan límites firmes y aprender desde pequeños quién establece las reglas.',
      'Creo que mientras mi hijo se sienta amado y feliz, muchas cosas pueden flexibilizarse.',
      'Sé cómo quiero criar, pero muchas veces el cansancio, el estrés o mis propias emociones hacen que responda de otra manera.',
      'Sé que no voy a hacerlo perfecto, pero quiero comprenderme, revisar mis patrones, regularme, poner límites y reparar cuando sea necesario.',
    ],
  },
];

/**
 * Scoring key (client's "Clave de corrección"): question 1 uses its own
 * mapping; questions 2 to 15 share the same one. Each answer adds one point.
 */
const KEY_Q1: Record<QuizLetter, ParentingStyle> = {
  A: 'Consciente',
  B: 'Autoritaria',
  C: 'Permisiva',
  D: 'Reactiva',
};

const KEY_REST: Record<QuizLetter, ParentingStyle> = {
  A: 'Autoritaria',
  B: 'Permisiva',
  C: 'Reactiva',
  D: 'Consciente',
};

export function styleFor(questionIndex: number, letter: QuizLetter): ParentingStyle {
  return questionIndex === 0 ? KEY_Q1[letter] : KEY_REST[letter];
}

export function countStyles(answers: readonly QuizAnswer[]): Record<ParentingStyle, number> {
  const counts: Record<ParentingStyle, number> = { Consciente: 0, Autoritaria: 0, Permisiva: 0, Reactiva: 0 };
  answers.forEach((answer, index) => {
    if (!answer) return;
    counts[styleFor(index, answer)] += 1;
  });
  return counts;
}

/** Styles with the highest score (more than one on a tie). */
export function dominantStyles(counts: Record<ParentingStyle, number>): { styles: ParentingStyle[]; points: number } {
  const points = Math.max(...QUIZ_STYLES.map((style) => counts[style]));
  return { styles: QUIZ_STYLES.filter((style) => counts[style] === points), points };
}
