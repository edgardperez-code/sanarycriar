import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { getStorage, markSubscribed } from '@/lib/newsletter';
import { QUIZ_LETTERS, emptyAnswers, isComplete, quizQuestions, quizResult } from '@/lib/quiz';
import { giftAuthHref, site } from '@/site.config';

/**
 * "¿Desde dónde estás criando?" — the client's 7-question test (2026-11).
 * The answers never leave the browser and are not stored. At the end the
 * result stays locked: the mother creates her free account on the platform,
 * which shows the result and gives her the free ebook. Only the path name
 * (guía, límites or cita) travels to the platform.
 */

const TOTAL = quizQuestions.length;

/** Going for the gift counts as joining: the welcome pop-up stops offering it. */
const markGiftTaken = () => markSubscribed(getStorage());
/** Pause after a choice so the selected option can be seen before moving on. */
const ADVANCE_MS = 260;

interface Props {
  /** Heading level for the question and the final card: one below the section title. */
  headingLevel?: 'h2' | 'h3';
}

export default function ParentingQuiz({ headingLevel = 'h3' }: Props) {
  const Heading = headingLevel;
  const [answers, setAnswers] = useState<(number | null)[]>(() => emptyAnswers());
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const gateRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);
  const advanceTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  // Move focus only after a user action (not on the first render).
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    (finished ? gateRef.current : questionRef.current)?.focus({ preventScroll: true });
  }, [step, finished]);

  function choose(option: number) {
    const next = [...answers];
    next[step] = option;
    setAnswers(next);
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      shouldFocus.current = true;
      if (step < TOTAL - 1) setStep(step + 1);
      else if (isComplete(next)) setFinished(true);
    }, ADVANCE_MS);
  }

  function back() {
    window.clearTimeout(advanceTimer.current);
    shouldFocus.current = true;
    if (finished) {
      setFinished(false);
      setStep(TOTAL - 1);
    } else if (step > 0) {
      setStep(step - 1);
    }
  }

  function restart() {
    window.clearTimeout(advanceTimer.current);
    shouldFocus.current = true;
    setAnswers(emptyAnswers());
    setFinished(false);
    setStep(0);
  }

  if (finished) {
    const result = quizResult(answers);
    return (
      <div className="card p-6 shadow-[0_24px_50px_-36px_rgba(25,9,51,0.5)] sm:p-9" aria-live="polite">
        <div className="h-2 overflow-hidden rounded-full bg-lavanda-100" aria-hidden="true">
          <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,var(--color-lavanda-500),var(--color-rosa-500))]" />
        </div>

        <div className="mt-7 grid items-start gap-7 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="eyebrow">¡Listo! Tu resultado está listo</p>
            <Heading
              ref={gateRef}
              tabIndex={-1}
              className="mt-3 font-serif text-[1.75rem] font-semibold leading-tight text-violeta outline-none sm:text-[2.125rem]"
            >
              Crea tu cuenta gratis para ver tu <em className="title-accent">resultado</em>.
            </Heading>
            <p className="mt-3 text-violeta-600 sm:text-lg">
              Con tu cuenta también te regalo mi ebook <strong className="font-semibold text-violeta">«{site.funnel.giftTitle}»</strong>.
              Te toma un minuto.
            </p>
          </div>
          <div className="mini-cover cover-free max-sm:-order-1" aria-hidden="true">
            <small>Gratis</small>
            <b>MALA MAMÁ?</b>
          </div>
        </div>

        <a href={giftAuthHref('test', { result })} onClick={markGiftTaken} className="btn btn-primary mt-7 max-sm:w-full">
          Crear mi cuenta y ver mi resultado
          <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
        </a>
        <p className="mt-4 text-[0.9375rem] text-violeta-600">
          ¿Ya tienes cuenta?{' '}
          <a href={giftAuthHref('test', { result, mode: 'login' })} onClick={markGiftTaken} className="text-link">
            Entra aquí
          </a>
        </p>
        <p className="note mt-3">Después te seguiré escribiendo, como una amiga; te das de baja cuando quieras.</p>

        <div className="mt-7 flex flex-col gap-3 border-t border-borde pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="note">Este test no es un diagnóstico. Es una forma de mirarte con cariño y elegir por dónde empezar.</p>
          <div className="flex shrink-0 flex-wrap gap-x-5 gap-y-1">
            <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-violeta-600 underline-offset-4 hover:text-violeta hover:underline">
              <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
              Cambiar respuestas
            </button>
            <button type="button" onClick={restart} className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-violeta-600 underline-offset-4 hover:text-violeta hover:underline">
              <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
              Repetir el test
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = quizQuestions[step];
  const questionId = `test-pregunta-${step}`;

  return (
    <div className="card p-5 shadow-[0_24px_50px_-36px_rgba(25,9,51,0.5)] sm:p-8">
      <div className="flex justify-between gap-3 text-sm font-medium text-violeta-400">
        <span>
          Pregunta {step + 1} de {TOTAL}
        </span>
        <span className="max-sm:hidden">2 minutos · sin juicios</span>
      </div>
      <div className="mb-6 mt-2.5 h-2 overflow-hidden rounded-full bg-lavanda-100" aria-hidden="true">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-lavanda-500),var(--color-rosa-500))] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${(step / TOTAL) * 100}%` }}
        />
      </div>

      <Heading
        ref={questionRef}
        id={questionId}
        tabIndex={-1}
        className="mb-5 font-serif text-[1.3rem] font-semibold leading-snug text-violeta outline-none sm:text-[1.625rem]"
      >
        {question.prompt}
      </Heading>

      <ul className="grid gap-2.5" role="list" aria-labelledby={questionId}>
        {question.options.map((option, index) => {
          const selected = answers[step] === index;
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => choose(index)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3.5 rounded-[14px] border-[1.5px] px-4 py-3.5 text-left text-[0.9875rem] leading-normal text-violeta transition-colors sm:px-[1.125rem] ${
                  selected ? 'border-lavanda-600 bg-lavanda-100' : 'border-borde bg-nube hover:border-lavanda-500 hover:bg-lavanda-100/60'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.8125rem] font-bold ${
                    selected ? 'bg-lavanda-600 text-nube' : 'bg-lavanda-100 text-lavanda-600'
                  }`}
                >
                  {QUIZ_LETTERS[index]}
                </span>
                <span>{option.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3.5 min-h-11">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-medium text-violeta-400 underline underline-offset-[3px] hover:text-violeta"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            Anterior
          </button>
        )}
      </div>
    </div>
  );
}
