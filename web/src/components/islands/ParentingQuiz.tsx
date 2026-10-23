import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import {
  QUIZ_LETTERS,
  QUIZ_STYLES,
  countStyles,
  dominantStyles,
  quizQuestions,
  type QuizAnswer,
  type QuizLetter,
} from '@/data/quiz';
import { clearDraft, readDraft, saveDraft } from '@/lib/quizDraft';
import { freeClassHref, site } from '@/site.config';

/**
 * "¿Desde dónde estás criando?" — 15 everyday situations. No login: the
 * result is shown right away and nothing leaves the browser.
 */

const TOTAL = quizQuestions.length;
const blank = (): QuizAnswer[] => Array.from({ length: TOTAL }, () => null);

interface Props {
  /** Id of the element to scroll to on restart (the surrounding section). */
  anchorId?: string;
  /** Heading level for the question and the result: one below the section title. */
  headingLevel?: 'h2' | 'h3';
}

export default function ParentingQuiz({ anchorId = 'test-crianza', headingLevel = 'h3' }: Props) {
  const Heading = headingLevel;
  const [answers, setAnswers] = useState<QuizAnswer[]>(blank);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [showError, setShowError] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  // Restore a saved draft after hydration (server HTML always starts blank).
  useEffect(() => {
    const draft = readDraft(TOTAL);
    if (!draft) return;
    setAnswers([...draft.answers]);
    setCompleted(draft.completed);
    if (!draft.completed) {
      const firstMissing = draft.answers.findIndex((answer) => answer === null);
      setStep(firstMissing >= 0 ? firstMissing : TOTAL - 1);
    }
  }, []);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    (completed ? resultRef.current : questionRef.current)?.focus();
  }, [step, completed]);

  const answered = answers.filter(Boolean).length;

  const select = (letter: QuizLetter) => {
    const next = [...answers];
    next[step] = letter;
    setAnswers(next);
    setShowError(false);
    if (!saveDraft(next, false)) setStorageBlocked(true);
  };

  const goTo = (index: number) => {
    shouldFocus.current = true;
    setStep(index);
  };

  const next = () => {
    if (!answers[step]) {
      setShowError(true);
      return;
    }
    if (step < TOTAL - 1) {
      goTo(step + 1);
      return;
    }
    const missing = answers.findIndex((answer) => answer === null);
    if (missing >= 0) {
      setShowError(true);
      goTo(missing);
      return;
    }
    if (!saveDraft(answers, true)) setStorageBlocked(true);
    shouldFocus.current = true;
    setCompleted(true);
  };

  const restart = () => {
    clearDraft();
    setAnswers(blank());
    setCompleted(false);
    setShowError(false);
    shouldFocus.current = true;
    setStep(0);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(anchorId)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  if (completed) {
    return (
      <Result
        answers={answers}
        onRestart={restart}
        headingRef={resultRef}
        headingLevel={headingLevel}
        storageBlocked={storageBlocked}
      />
    );
  }

  const question = quizQuestions[step];
  const percent = Math.round((answered / TOTAL) * 100);

  return (
    <div className="card flex min-h-[34rem] flex-col p-5 sm:p-9">
      <div className="flex items-center justify-between gap-4 text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-violeta-500">
        <span>
          Pregunta {step + 1} de {TOTAL}
        </span>
        <span className="normal-case tracking-normal text-violeta-400">{answered} respondidas</span>
      </div>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-lavanda-100"
        role="progressbar"
        aria-label="Preguntas respondidas"
        aria-valuemin={0}
        aria-valuemax={TOTAL}
        aria-valuenow={answered}
      >
        <div className="h-full rounded-full bg-lavanda-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>

      <div className="flex-1">
        <Heading
          ref={questionRef}
          tabIndex={-1}
          id="quiz-question"
          className="mt-8 font-serif text-[1.375rem] font-semibold leading-snug text-violeta outline-none sm:text-[1.625rem]"
        >
          <span className="mr-2 text-rosa-600">{String(step + 1).padStart(2, '0')}.</span>
          {question.prompt}
        </Heading>
        <fieldset className="mt-6 space-y-3" aria-describedby={showError ? 'quiz-error' : undefined}>
          <legend className="sr-only">Elige una respuesta para la pregunta {step + 1}</legend>
          {question.options.map((option, index) => {
            const letter = QUIZ_LETTERS[index];
            const chosen = answers[step] === letter;
            return (
              <label
                key={`${step}-${letter}`}
                className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-field)] border p-3.5 transition-colors sm:gap-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lavanda-600 sm:p-[1.125rem] ${
                  chosen ? 'border-lavanda-600 bg-lavanda-100' : 'border-borde bg-white hover:border-lavanda-300'
                }`}
              >
                <input
                  type="radio"
                  name={`quiz-question-${step}`}
                  value={letter}
                  checked={chosen}
                  onChange={() => select(letter)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    chosen ? 'border-lavanda-600 bg-lavanda-600 text-white' : 'border-borde bg-nube text-violeta-500'
                  }`}
                >
                  {chosen ? <Check size={15} strokeWidth={2.5} /> : letter}
                </span>
                <span className="pt-0.5 text-[0.9375rem] leading-relaxed text-violeta-600 sm:text-base">{option}</span>
              </label>
            );
          })}
        </fieldset>
        {showError && (
          <p id="quiz-error" role="alert" className="mt-4 text-[0.9375rem] font-semibold text-rosa-600">
            Elige una respuesta antes de continuar.
          </p>
        )}
        {storageBlocked && (
          <p role="status" className="mt-4 rounded-[var(--radius-field)] bg-rosa-200/60 p-3 text-sm text-violeta-600">
            Tu navegador no nos deja guardar el avance. Puedes terminar el test igual; si cierras la página, tus respuestas se perderán.
          </p>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-borde pt-6">
        <button
          type="button"
          onClick={() => {
            setShowError(false);
            goTo(step - 1);
          }}
          disabled={step === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[0.9375rem] font-semibold text-violeta-600 hover:text-violeta disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          Anterior
        </button>
        <button type="button" onClick={next} className="btn btn-primary">
          {step === TOTAL - 1 ? 'Ver mi resultado' : 'Siguiente'}
          <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Result({
  answers,
  onRestart,
  headingRef,
  headingLevel,
  storageBlocked,
}: {
  answers: QuizAnswer[];
  onRestart: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  headingLevel: 'h2' | 'h3';
  storageBlocked: boolean;
}) {
  const Heading = headingLevel;
  const counts = countStyles(answers);
  const { styles, points } = dominantStyles(counts);
  const single = styles.length === 1;

  return (
    <div className="card flex min-h-[34rem] flex-col p-5 sm:p-9" aria-live="polite">
      <p className="eyebrow">Tu resultado</p>
      <Heading
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 font-serif text-[1.625rem] font-semibold leading-tight text-violeta outline-none sm:text-[2rem]"
      >
        {single ? (
          <>
            Tu estilo con mayor puntuación: <em className="title-accent">{styles[0]}</em>
          </>
        ) : (
          <>Tus estilos con mayor puntuación: {joinStyles(styles)}</>
        )}
      </Heading>
      <p className="mt-2 text-violeta-500">
        {points} de {TOTAL} respuestas{single ? '' : ' en cada uno'}.
      </p>

      <ul className="mt-7 space-y-4" aria-label="Puntos por estilo">
        {QUIZ_STYLES.map((style) => {
          const isTop = styles.includes(style);
          return (
            <li key={style}>
              <div className="mb-1.5 flex justify-between gap-3 text-[0.9375rem]">
                <span className={isTop ? 'font-semibold text-violeta' : 'text-violeta-600'}>{style}</span>
                <span className="tabular-nums text-violeta-500">
                  {counts[style]} / {TOTAL}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-lavanda-100" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${isTop ? 'bg-lavanda-600' : 'bg-lavanda-300'}`}
                  style={{ width: `${(counts[style] / TOTAL) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-7 rounded-[var(--radius-field)] bg-nube p-4 text-[0.9375rem] leading-relaxed text-violeta-600">
        Cada respuesta suma un punto a un estilo. Este resultado describe las respuestas que elegiste hoy:{' '}
        <strong className="font-semibold text-violeta">no es un diagnóstico ni una etiqueta</strong>, sino un punto de partida para mirarte con
        curiosidad y sin culpa. Si algo de lo que viste te inquieta, lo podemos conversar en consulta.
      </p>

      <div className="mt-7">
        <p className="font-semibold text-violeta">¿Quieres dar el siguiente paso?</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href={freeClassHref} className="btn btn-primary" target="_blank" rel="noopener">
            <span className="sm:hidden">{site.freeClass.mobileLabel}</span>
            <span className="hidden sm:inline">{site.freeClass.label}</span>
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </a>
          <a href="/agenda" className="btn btn-secondary">
            Agenda tu consulta
          </a>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-full text-[0.9375rem] font-semibold text-violeta-600 underline-offset-4 hover:text-violeta hover:underline"
        >
          <RotateCcw size={17} strokeWidth={2} aria-hidden="true" />
          Volver a empezar
        </button>
        <p className="note sm:text-right">
          {storageBlocked ? 'Tus respuestas no salen de esta página.' : 'Tus respuestas se guardan solo en este navegador.'}
        </p>
      </div>
    </div>
  );
}

function joinStyles(styles: readonly string[]): string {
  if (styles.length <= 1) return styles.join('');
  return `${styles.slice(0, -1).join(', ')} y ${styles[styles.length - 1]}`;
}
