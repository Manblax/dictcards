import type { Term } from "@/types/module";

const LEARN_SESSION_VERSION = 1;

export const LEARN_STAGE_SIZE = 7;
export const LEARN_MASTERY_TARGET = 3;

export type LearnQuestionMode = "choice" | "written";

export interface LearnQuestion {
  termId: string;
  mode: LearnQuestionMode;
  optionTermIds: string[];
}

export interface LearnAttempt {
  termId: string;
  mode: LearnQuestionMode;
  submittedAnswer: string;
  isCorrect: boolean;
  wasUnsure: boolean;
}

export interface LearnStageResult {
  stageNumber: number;
  attempts: LearnAttempt[];
}

export interface LearnExerciseState {
  stageNumber: number;
  queue: LearnQuestion[];
  currentIndex: number;
  mastery: Record<string, number>;
  streak: number;
  currentStageAttempts: LearnAttempt[];
  feedback: LearnAttempt | null;
  history: LearnStageResult[];
  stageComplete: boolean;
  completed: boolean;
}

interface PersistedLearnSession {
  version: number;
  fingerprint: string;
  state: LearnExerciseState;
}

export function normalizeLearnAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isLearnAnswerCorrect(answer: string, expected: string) {
  return normalizeLearnAnswer(answer) === normalizeLearnAnswer(expected);
}

export function shuffleLearnItems<T>(
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

export function createLearnStageQueue(
  terms: Term[],
  mastery: Record<string, number>,
  random: () => number = Math.random,
): LearnQuestion[] {
  const newTerms = shuffleLearnItems(
    terms.filter((term) => (mastery[term.id] ?? 0) === 0),
    random,
  );
  const practicingTerms = shuffleLearnItems(
    terms.filter(
      (term) =>
        (mastery[term.id] ?? 0) > 0 &&
        (mastery[term.id] ?? 0) < LEARN_MASTERY_TARGET,
    ),
    random,
  );
  const selectedTerms: Term[] = [];

  if (practicingTerms.length === 0) {
    selectedTerms.push(...newTerms.slice(0, LEARN_STAGE_SIZE));
  } else {
    selectedTerms.push(...newTerms.slice(0, 3));
    selectedTerms.push(
      ...practicingTerms.slice(0, LEARN_STAGE_SIZE - selectedTerms.length),
    );

    if (selectedTerms.length < LEARN_STAGE_SIZE) {
      selectedTerms.push(
        ...newTerms.slice(
          3,
          3 + LEARN_STAGE_SIZE - selectedTerms.length,
        ),
      );
    }
  }

  return selectedTerms.map((term) => {
    const mode: LearnQuestionMode =
      (mastery[term.id] ?? 0) === 0 && terms.length >= 4
        ? "choice"
        : "written";

    if (mode === "written") {
      return { termId: term.id, mode, optionTermIds: [] };
    }

    const distractorIds = shuffleLearnItems(
      terms.filter((candidate) => candidate.id !== term.id),
      random,
    )
      .slice(0, 3)
      .map((candidate) => candidate.id);

    return {
      termId: term.id,
      mode,
      optionTermIds: shuffleLearnItems(
        [term.id, ...distractorIds],
        random,
      ),
    };
  });
}

export function createInitialLearnState(
  terms: Term[],
  random: () => number = Math.random,
): LearnExerciseState {
  const mastery = Object.fromEntries(terms.map((term) => [term.id, 0]));

  return {
    stageNumber: 1,
    queue: createLearnStageQueue(terms, mastery, random),
    currentIndex: 0,
    mastery,
    streak: 0,
    currentStageAttempts: [],
    feedback: null,
    history: [],
    stageComplete: false,
    completed: terms.length === 0,
  };
}

export function submitLearnAnswer(
  state: LearnExerciseState,
  term: Term,
  submittedAnswer: string,
  wasUnsure = false,
): LearnExerciseState {
  const question = state.queue[state.currentIndex];

  if (
    state.completed ||
    state.stageComplete ||
    state.feedback ||
    !question ||
    question.termId !== term.id
  ) {
    return state;
  }

  const isCorrect =
    !wasUnsure && isLearnAnswerCorrect(submittedAnswer, term.term);
  const attempt: LearnAttempt = {
    termId: term.id,
    mode: question.mode,
    submittedAnswer,
    isCorrect,
    wasUnsure,
  };
  const mastery = isCorrect
    ? {
        ...state.mastery,
        [term.id]: Math.min(
          LEARN_MASTERY_TARGET,
          (state.mastery[term.id] ?? 0) + 1,
        ),
      }
    : state.mastery;

  return {
    ...state,
    mastery,
    streak: isCorrect ? state.streak + 1 : 0,
    currentStageAttempts: [...state.currentStageAttempts, attempt],
    feedback: attempt,
  };
}

export function continueLearnExercise(
  state: LearnExerciseState,
): LearnExerciseState {
  if (state.completed || state.stageComplete || !state.feedback) {
    return state;
  }

  if (state.currentIndex < state.queue.length - 1) {
    return {
      ...state,
      currentIndex: state.currentIndex + 1,
      feedback: null,
    };
  }

  const history = [
    ...state.history,
    {
      stageNumber: state.stageNumber,
      attempts: state.currentStageAttempts,
    },
  ];
  const completed = Object.values(state.mastery).every(
    (value) => value >= LEARN_MASTERY_TARGET,
  );

  return {
    ...state,
    feedback: null,
    history,
    stageComplete: true,
    completed,
  };
}

export function startNextLearnStage(
  state: LearnExerciseState,
  terms: Term[],
  random: () => number = Math.random,
): LearnExerciseState {
  if (!state.stageComplete || state.completed) {
    return state;
  }

  const queue = createLearnStageQueue(terms, state.mastery, random);

  if (queue.length === 0) {
    return { ...state, completed: true };
  }

  return {
    ...state,
    stageNumber: state.stageNumber + 1,
    queue,
    currentIndex: 0,
    currentStageAttempts: [],
    feedback: null,
    stageComplete: false,
  };
}

export function getLearnMasteryCount(state: LearnExerciseState) {
  return Object.values(state.mastery).reduce(
    (total, value) => total + Math.min(value, LEARN_MASTERY_TARGET),
    0,
  );
}

export function getLearnMasteryTotal(termCount: number) {
  return termCount * LEARN_MASTERY_TARGET;
}

export function getLearnProgress(
  state: LearnExerciseState,
  termCount: number,
) {
  const total = getLearnMasteryTotal(termCount);

  return total === 0
    ? 0
    : Math.round((getLearnMasteryCount(state) / total) * 100);
}

export function getLearnStageTermIds(state: LearnExerciseState) {
  const stage = state.history[state.history.length - 1];

  if (!stage) {
    return [];
  }

  return [
    ...new Set(
      stage.attempts
        .filter((attempt) => attempt.isCorrect)
        .map((attempt) => attempt.termId),
    ),
  ];
}

export function getLearnSessionStorageKey(moduleId: string) {
  return `dictcards:learn:${moduleId}`;
}

export function saveLearnSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
  state: LearnExerciseState,
) {
  const payload: PersistedLearnSession = {
    version: LEARN_SESSION_VERSION,
    fingerprint: getTermsFingerprint(terms),
    state,
  };

  try {
    storage.setItem(
      getLearnSessionStorageKey(moduleId),
      JSON.stringify(payload),
    );
  } catch {
    // Persistence is best-effort; the exercise remains usable in memory.
  }
}

export function loadLearnSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
): LearnExerciseState | null {
  const storageKey = getLearnSessionStorageKey(moduleId);

  try {
    const stored = storage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const payload = JSON.parse(stored) as unknown;

    if (
      !isRecord(payload) ||
      payload.version !== LEARN_SESSION_VERSION ||
      payload.fingerprint !== getTermsFingerprint(terms) ||
      !isValidLearnState(payload.state, terms)
    ) {
      storage.removeItem(storageKey);
      return null;
    }

    return payload.state;
  } catch {
    try {
      storage.removeItem(storageKey);
    } catch {
      // Ignore unavailable storage and start a fresh exercise.
    }
    return null;
  }
}

export function clearLearnSession(storage: Storage, moduleId: string) {
  try {
    storage.removeItem(getLearnSessionStorageKey(moduleId));
  } catch {
    // Ignore unavailable storage and restart in memory.
  }
}

function getTermsFingerprint(terms: Term[]) {
  return JSON.stringify(
    terms.map(({ id, term, definition }) => ({ id, term, definition })),
  );
}

function isValidLearnState(
  value: unknown,
  terms: Term[],
): value is LearnExerciseState {
  if (!isRecord(value)) {
    return false;
  }

  const validTermIds = new Set(terms.map((term) => term.id));
  const mastery = value.mastery;

  return (
    isPositiveInteger(value.stageNumber) &&
    Array.isArray(value.queue) &&
    value.queue.length > 0 &&
    value.queue.length <= LEARN_STAGE_SIZE &&
    value.queue.every((question) => isValidQuestion(question, validTermIds)) &&
    isNonNegativeInteger(value.currentIndex) &&
    value.currentIndex < value.queue.length &&
    isRecord(mastery) &&
    Object.keys(mastery).length === validTermIds.size &&
    [...validTermIds].every(
      (termId) =>
        isNonNegativeInteger(mastery[termId]) &&
        (mastery[termId] as number) <= LEARN_MASTERY_TARGET,
    ) &&
    isNonNegativeInteger(value.streak) &&
    Array.isArray(value.currentStageAttempts) &&
    value.currentStageAttempts.every((attempt) =>
      isValidAttempt(attempt, validTermIds),
    ) &&
    (value.feedback === null ||
      isValidAttempt(value.feedback, validTermIds)) &&
    Array.isArray(value.history) &&
    value.history.every((stage) => isValidStage(stage, validTermIds)) &&
    typeof value.stageComplete === "boolean" &&
    typeof value.completed === "boolean" &&
    (!value.completed || value.stageComplete)
  );
}

function isValidQuestion(value: unknown, validTermIds: Set<string>) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.termId === "string" &&
    validTermIds.has(value.termId) &&
    (value.mode === "choice" || value.mode === "written") &&
    Array.isArray(value.optionTermIds) &&
    value.optionTermIds.every(
      (termId) => typeof termId === "string" && validTermIds.has(termId),
    ) &&
    new Set(value.optionTermIds).size === value.optionTermIds.length &&
    (value.mode === "choice"
      ? value.optionTermIds.length === 4 &&
        value.optionTermIds.includes(value.termId)
      : value.optionTermIds.length === 0)
  );
}

function isValidAttempt(value: unknown, validTermIds: Set<string>) {
  return (
    isRecord(value) &&
    typeof value.termId === "string" &&
    validTermIds.has(value.termId) &&
    (value.mode === "choice" || value.mode === "written") &&
    typeof value.submittedAnswer === "string" &&
    typeof value.isCorrect === "boolean" &&
    typeof value.wasUnsure === "boolean"
  );
}

function isValidStage(value: unknown, validTermIds: Set<string>) {
  return (
    isRecord(value) &&
    isPositiveInteger(value.stageNumber) &&
    Array.isArray(value.attempts) &&
    value.attempts.every((attempt) =>
      isValidAttempt(attempt, validTermIds),
    )
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
