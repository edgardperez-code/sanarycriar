// Unit tests for src/lib/quiz.ts (parenting test, 7 questions, 3 paths).
// Run with `npm run test:quiz` (Node 22.18+/24 strips the TypeScript types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITA_THRESHOLD, emptyAnswers, isComplete, quizQuestions, quizResult, scoreAnswers } from '../src/lib/quiz.ts';

// Option letters as indexes: A=0, B=1, C=2, D=3.
const answers = (letters) => [...letters].map((letter) => 'ABCD'.indexOf(letter));

test('the test has the 7 questions of the client survey', () => {
  assert.equal(quizQuestions.length, 7);
  assert.deepEqual(
    quizQuestions.map((question) => question.options.length),
    [4, 4, 4, 4, 4, 3, 3],
  );
  assert.match(quizQuestions[0].prompt, /^Tu hijo hace una rabieta/);
  assert.match(quizQuestions[6].prompt, /^¿Qué te gustaría ahora\?/);
});

test('scoreAnswers adds the points of every chosen option', () => {
  // 1A guia, 2B guia, 3A guia, 4A -, 5B guia, 6A guia, 7A guia
  assert.deepEqual(scoreAnswers(answers('ABAABAA')), { guia: 6, limites: 0, cita: 0 });
  // 1B limites, 2C limites, 3B limites, 4D cita 2, 5A limites, 6B limites, 7B limites
  assert.deepEqual(scoreAnswers(answers('BCBDABB')), { guia: 0, limites: 6, cita: 2 });
});

test('scoreAnswers ignores unanswered and out-of-range answers', () => {
  assert.deepEqual(scoreAnswers(emptyAnswers()), { guia: 0, limites: 0, cita: 0 });
  assert.deepEqual(scoreAnswers([0, 9, null, -1, 1.5, 'A', 0]), { guia: 2, limites: 0, cita: 0 });
});

test('a mother who mostly feels guilty gets the free guide', () => {
  assert.equal(quizResult(answers('ABAABAA')), 'guia');
});

test('limits win over the guide, and also when they tie', () => {
  assert.equal(quizResult(answers('BCBDABB')), 'limites');
  // 1A guia, 2C limites, 3A guia, 4A -, 5A limites, 6A guia, 7B limites: 3 to 3
  assert.equal(quizResult(answers('ACAAAAB')), 'limites');
});

test('the session wins from the threshold on, whatever the rest says', () => {
  assert.equal(CITA_THRESHOLD, 4);
  // 4D cita 2 + 7C cita 2 = 4, everything else limits
  assert.equal(quizResult(answers('BCBDABC')), 'cita');
  // 2D cita 1 + 4C cita 1 = 2 only: not enough for a session
  assert.equal(quizResult(answers('BDBCABB')), 'limites');
  // Worried parent of a teenager: 2D + 4D + 5D + 6C + 7C = 9
  assert.equal(quizResult(answers('ADADDCC')), 'cita');
});

test('isComplete needs one valid option per question', () => {
  assert.equal(isComplete(answers('ABAABAA')), true);
  assert.equal(isComplete(emptyAnswers()), false);
  assert.equal(isComplete(answers('ABAABA')), false);
  // Question 6 has only three options (A-C).
  assert.equal(isComplete(answers('ABAABDA')), false);
});
