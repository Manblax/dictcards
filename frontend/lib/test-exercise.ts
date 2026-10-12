import type { Term } from "@/types/module";

const TEST_SESSION_VERSION = 1;

export type TestQuestionType =
  | "true-false"
  | "choice"
  | "matching"
  | "written";

export type TestAnswerWith = "term" | "definition";

export interface TestTypeSettings {
  trueFalse: boolean;
  choice: boolean;
  matching: boolean;
  written: boolean;
}

export interface TestSettings {
  questionCount: number;
  answerWith: TestAnswerWith;
  types: TestTypeSettings;
}

export interface TestQuestion {
  id: string;
  type: TestQuestionType;
  termId: string;
  optionTermIds: string[];
  shownTermId: string | null;
  statementIsCorrect: boolean | null;
  matchingGroupId: string | null;
}

export interface TestExerciseState {
  settings: TestSettings;
  questions: TestQuestion[];
  answers: Record<string, string>;
  submitted: boolean;
}

export interface TestQuestionResult {
  question: TestQuestion;
  submittedAnswer: string;
  expectedAnswer: string;
  isCorrect: boolean;
}

interface PersistedTestSession {
  version: number;
  fingerprint: string;
  state: TestExerciseState;
}

const TYPE_SETTING_KEYS: Array<{
  key: keyof TestTypeSettings;
  type: TestQuestionType;
}> = [
  { key: "trueFalse", type: "true-false" },
  { key: "choice", type: "choice" },
  { key: "matching", type: "matching" },
  { key: "written", type: "written" },
];

export function createDefaultTestSettings(terms: Term[]): TestSettings {
  return {
    questionCount: terms.length,
    answerWith: "term",
    types: {
      trueFalse: true,
      choice: true,
      matching: terms.length >= 2,
      written: true,
    },
  };
}

export function normalizeTestAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function shuffleTestItems<T>(
  values: T[],
  random: () => number = Math.random,
) {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export function createTestExerciseState(
  terms: Term[],
  requestedSettings: TestSettings,
  random: () => number = Math.random,
): TestExerciseState {
  const settings = normalizeSettings(requestedSettings, terms.length);
  const selectedTerms = shuffleTestItems(terms, random).slice(
    0,
    settings.questionCount,
  );
  const enabledTypes = TYPE_SETTING_KEYS.filter(
    ({ key }) => settings.types[key],
  ).map(({ type }) => type);
  const usableTypes = enabledTypes.length > 0 ? enabledTypes : ["written" as const];
  let matchingGroupNumber = 0;
  let previousType: TestQuestionType | null = null;
  let matchingGroupSize = 0;

  const questions = selectedTerms.map((term, index) => {
    let type = usableTypes[
      Math.min(
        usableTypes.length - 1,
        Math.floor((index * usableTypes.length) / selectedTerms.length),
      )
    ];

    if (terms.length === 1 && type !== "written") {
      type = "written";
    }

    if (type === "matching") {
      if (previousType !== "matching" || matchingGroupSize >= 5) {
        matchingGroupNumber += 1;
        matchingGroupSize = 0;
      }
      matchingGroupSize += 1;
    } else {
      matchingGroupSize = 0;
    }

    const question = createQuestion(
      term,
      type,
      index,
      terms,
      matchingGroupNumber,
      random,
    );
    previousType = type;
    return question;
  });

  return {
    settings: {
      ...settings,
      types:
        enabledTypes.length > 0
          ? settings.types
          : { ...settings.types, written: true },
    },
    questions,
    answers: {},
    submitted: false,
  };
}

function createQuestion(
  term: Term,
  type: TestQuestionType,
  index: number,
  terms: Term[],
  matchingGroupNumber: number,
  random: () => number,
): TestQuestion {
  const baseQuestion: TestQuestion = {
    id: `question-${index + 1}`,
    type,
    termId: term.id,
    optionTermIds: [],
    shownTermId: null,
    statementIsCorrect: null,
    matchingGroupId:
      type === "matching" ? `matching-${matchingGroupNumber}` : null,
  };

  if (type === "choice") {
    const distractorIds = shuffleTestItems(
      terms.filter((candidate) => candidate.id !== term.id),
      random,
    )
      .slice(0, 3)
      .map((candidate) => candidate.id);

    return {
      ...baseQuestion,
      optionTermIds: shuffleTestItems(
        [term.id, ...distractorIds],
        random,
      ),
    };
  }

  if (type === "true-false") {
    const shouldBeCorrect = random() >= 0.5;
    const shownTerm = shouldBeCorrect
      ? term
      : shuffleTestItems(
          terms.filter((candidate) => candidate.id !== term.id),
          random,
        )[0] ?? term;

    return {
      ...baseQuestion,
      shownTermId: shownTerm.id,
      statementIsCorrect: shownTerm.id === term.id,
    };
  }

  return baseQuestion;
}

export function answerTestQuestion(
  state: TestExerciseState,
  questionId: string,
  answer: string,
): TestExerciseState {
  if (state.submitted || !state.questions.some(({ id }) => id === questionId)) {
    return state;
  }

  const question = state.questions.find(({ id }) => id === questionId)!;
  const answers = { ...state.answers };

  if (question.type === "matching" && question.matchingGroupId) {
    state.questions.forEach((candidate) => {
      if (
        candidate.id !== questionId &&
        candidate.matchingGroupId === question.matchingGroupId &&
        answers[candidate.id] === answer
      ) {
        delete answers[candidate.id];
      }
    });
  }

  if (answer.trim()) {
    answers[questionId] = answer;
  } else {
    delete answers[questionId];
  }

  return { ...state, answers };
}

export function getAnsweredTestQuestionCount(state: TestExerciseState) {
  return state.questions.filter((question) =>
    Boolean(state.answers[question.id]?.trim()),
  ).length;
}

export function canSubmitTest(state: TestExerciseState) {
  return (
    state.questions.length > 0 &&
    getAnsweredTestQuestionCount(state) === state.questions.length
  );
}

export function submitTestExercise(state: TestExerciseState) {
  return canSubmitTest(state) ? { ...state, submitted: true } : state;
}

export function getTestPrompt(term: Term, answerWith: TestAnswerWith) {
  return answerWith === "term" ? term.definition : term.term;
}

export function getTestExpectedAnswer(
  term: Term,
  answerWith: TestAnswerWith,
) {
  return answerWith === "term" ? term.term : term.definition;
}

export function getTestQuestionResults(
  state: TestExerciseState,
  terms: Term[],
): TestQuestionResult[] {
  const termsById = new Map(terms.map((term) => [term.id, term]));

  return state.questions.map((question) => {
    const term = termsById.get(question.termId);
    const submittedAnswer = state.answers[question.id] ?? "";
    let expectedAnswer = term
      ? getTestExpectedAnswer(term, state.settings.answerWith)
      : "";
    let isCorrect = false;

    if (question.type === "true-false") {
      expectedAnswer = question.statementIsCorrect ? "Верно" : "Неверно";
      isCorrect =
        submittedAnswer === String(Boolean(question.statementIsCorrect));
    } else if (
      question.type === "choice" ||
      question.type === "matching"
    ) {
      isCorrect = submittedAnswer === question.termId;
    } else {
      isCorrect =
        normalizeTestAnswer(submittedAnswer) ===
        normalizeTestAnswer(expectedAnswer);
    }

    return { question, submittedAnswer, expectedAnswer, isCorrect };
  });
}

export function getTestScore(state: TestExerciseState, terms: Term[]) {
  const results = getTestQuestionResults(state, terms);
  const correct = results.filter((result) => result.isCorrect).length;
  const total = results.length;

  return {
    correct,
    total,
    incorrect: total - correct,
    percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
  };
}

export function getTestSessionStorageKey(moduleId: string) {
  return `dictcards:test:${moduleId}`;
}

export function saveTestSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
  state: TestExerciseState,
) {
  const payload: PersistedTestSession = {
    version: TEST_SESSION_VERSION,
    fingerprint: getTermsFingerprint(terms),
    state,
  };

  try {
    storage.setItem(
      getTestSessionStorageKey(moduleId),
      JSON.stringify(payload),
    );
  } catch {
    // Persistence is best-effort; the test remains usable in memory.
  }
}

export function loadTestSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
): TestExerciseState | null {
  const storageKey = getTestSessionStorageKey(moduleId);

  try {
    const stored = storage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const payload = JSON.parse(stored) as unknown;

    if (
      !isRecord(payload) ||
      payload.version !== TEST_SESSION_VERSION ||
      payload.fingerprint !== getTermsFingerprint(terms) ||
      !isValidTestState(payload.state, terms)
    ) {
      storage.removeItem(storageKey);
      return null;
    }

    return payload.state;
  } catch {
    try {
      storage.removeItem(storageKey);
    } catch {
      // Ignore unavailable storage and start a new test.
    }
    return null;
  }
}

export function clearTestSession(storage: Storage, moduleId: string) {
  try {
    storage.removeItem(getTestSessionStorageKey(moduleId));
  } catch {
    // Ignore unavailable storage and reset in memory.
  }
}

function normalizeSettings(settings: TestSettings, termCount: number) {
  return {
    questionCount: Math.max(
      1,
      Math.min(termCount, Math.floor(settings.questionCount) || termCount),
    ),
    answerWith:
      settings.answerWith === "definition" ? "definition" : "term",
    types: {
      trueFalse: Boolean(settings.types.trueFalse),
      choice: Boolean(settings.types.choice),
      matching: Boolean(settings.types.matching),
      written: Boolean(settings.types.written),
    },
  } satisfies TestSettings;
}

function getTermsFingerprint(terms: Term[]) {
  return JSON.stringify(
    terms.map(({ id, term, definition }) => ({ id, term, definition })),
  );
}

function isValidTestState(
  value: unknown,
  terms: Term[],
): value is TestExerciseState {
  if (!isRecord(value) || !isValidSettings(value.settings, terms.length)) {
    return false;
  }

  const validTermIds = new Set(terms.map((term) => term.id));

  if (!Array.isArray(value.questions) || !isRecord(value.answers)) {
    return false;
  }

  const questions = value.questions;
  const answers = value.answers;

  return (
    questions.length === value.settings.questionCount &&
    questions.every((question) =>
      isValidQuestion(question, validTermIds),
    ) &&
    Object.entries(answers).every(
      ([questionId, answer]) =>
        questions.some(
          (question) =>
            isRecord(question) && question.id === questionId,
        ) && typeof answer === "string",
    ) &&
    typeof value.submitted === "boolean"
  );
}

function isValidSettings(value: unknown, termCount: number): value is TestSettings {
  return (
    isRecord(value) &&
    isPositiveInteger(value.questionCount) &&
    value.questionCount <= termCount &&
    (value.answerWith === "term" || value.answerWith === "definition") &&
    isRecord(value.types) &&
    typeof value.types.trueFalse === "boolean" &&
    typeof value.types.choice === "boolean" &&
    typeof value.types.matching === "boolean" &&
    typeof value.types.written === "boolean"
  );
}

function isValidQuestion(value: unknown, validTermIds: Set<string>) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.type === "true-false" ||
      value.type === "choice" ||
      value.type === "matching" ||
      value.type === "written") &&
    typeof value.termId === "string" &&
    validTermIds.has(value.termId) &&
    Array.isArray(value.optionTermIds) &&
    value.optionTermIds.every(
      (termId) => typeof termId === "string" && validTermIds.has(termId),
    ) &&
    new Set(value.optionTermIds).size === value.optionTermIds.length &&
    (value.shownTermId === null ||
      (typeof value.shownTermId === "string" &&
        validTermIds.has(value.shownTermId))) &&
    (value.statementIsCorrect === null ||
      typeof value.statementIsCorrect === "boolean") &&
    (value.matchingGroupId === null ||
      typeof value.matchingGroupId === "string")
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
