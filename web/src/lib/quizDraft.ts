import type { QuizAnswer } from '@/data/quiz';

/**
 * Local draft of the parenting quiz. Lives only in this browser
 * (localStorage, 7 days) and is never sent anywhere. Every access is wrapped
 * in try/catch: storage can be missing or blocked (private mode, previews).
 */

const STORAGE_KEY = 'sanarycriar:test-crianza:v1';
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const VALID = new Set<unknown>(['A', 'B', 'C', 'D', null]);

export interface QuizDraft {
  answers: QuizAnswer[];
  completed: boolean;
  savedAt: number;
}

export function readDraft(total: number): QuizDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<QuizDraft> | null;
    const valid =
      !!draft &&
      Array.isArray(draft.answers) &&
      draft.answers.length === total &&
      draft.answers.every((answer) => VALID.has(answer)) &&
      typeof draft.completed === 'boolean' &&
      typeof draft.savedAt === 'number' &&
      draft.savedAt <= Date.now() + 60_000 &&
      Date.now() - draft.savedAt <= LIFETIME_MS &&
      !(draft.completed && draft.answers.some((answer) => answer === null));
    if (!valid) {
      clearDraft();
      return null;
    }
    return draft as QuizDraft;
  } catch {
    return null;
  }
}

/** Returns false when the browser does not let us save. */
export function saveDraft(answers: QuizAnswer[], completed: boolean): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, completed, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
