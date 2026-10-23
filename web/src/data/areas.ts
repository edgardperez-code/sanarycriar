/**
 * Areas Hilda works on (from the original brief). These are areas of work,
 * not services with prices.
 */

export type AreaIcon = 'baby' | 'heart' | 'sprout' | 'wind' | 'brain' | 'infinity' | 'messages';

export interface Area {
  title: string;
  description: string;
  icon: AreaIcon;
}

/** Main focus (shown larger). */
export const mainAreas: Area[] = [
  {
    title: 'Primera infancia (1 a 5 años)',
    description:
      'Rabietas, hábitos, sueño, autonomía y desarrollo integral. Te acompaño a entender lo que tu hijo siente y a responder con calma y límites claros.',
    icon: 'baby',
  },
  {
    title: 'Acompañamiento materno',
    description:
      'Salud mental durante el embarazo, el posparto y la maternidad. Un espacio para ti, para fortalecer el vínculo seguro con tu bebé sin dejarte de lado.',
    icon: 'heart',
  },
];

/** Other areas (shown as a compact list). */
export const otherAreas: Area[] = [
  {
    title: 'Crianza, hábitos y límites',
    description: 'Rutinas, autonomía y límites respetuosos que cuidan la conexión.',
    icon: 'sprout',
  },
  {
    title: 'Ansiedad infantil y regulación emocional',
    description: 'Herramientas para acompañar miedos, preocupaciones y emociones intensas.',
    icon: 'wind',
  },
  {
    title: 'TDAH, neurodiversidad e inclusión',
    description: 'Comprender cómo aprende y siente tu hijo, en casa y en la escuela.',
    icon: 'brain',
  },
  {
    title: 'Autismo',
    description: 'Orientación a las familias y acompañamiento respetuoso del desarrollo.',
    icon: 'infinity',
  },
  {
    title: 'Salud mental del adolescente',
    description: 'Entender el cerebro adolescente y cuidar la comunicación en casa.',
    icon: 'messages',
  },
];
