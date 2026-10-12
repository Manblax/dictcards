import type { Term } from "@/types/module";

const WRITE_SESSION_VERSION = 1;

export interface WriteAnswerResult {
  termId: string;
  submittedAnswer: string;
  isCorrect: boolean;
  wasSkipped: boolean;
  wasOverridden: boolean;
}

export interface WriteStageResult {
  stageNumber: number;
  answers: WriteAnswerResult[];
}

export interface WriteExerciseState {
  stageNumber: number;
  queue: string[];
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;
  unresolvedTermIds: string[];
  currentStageAnswers: WriteAnswerResult[];
  feedback: WriteAnswerResult | null;
  history: WriteStageResult[];
  completed: boolean;
}

interface PersistedWriteSession {
  version: number;
  fingerprint: string;
  state: WriteExerciseState;
}

export function normalizeWriteAnswer(value: string) {
  return value.trim().toLowerCase();
}

export function isWriteAnswerCorrect(answer: string, expected: string) {
  return normalizeWriteAnswer(answer) === normalizeWriteAnswer(expected);
}

export function shuffleTermIds(
  termIds: string[],
  random: () => number = Math.random,
) {
  const shuffled = [...termIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export function createInitialWriteState(
  terms: Term[],
  random: () => number = Math.random,
): WriteExerciseState {
  return {
    stageNumber: 1,
    queue: shuffleTermIds(
      terms.map((term) => term.id),
      random,
    ),
    currentIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    unresolvedTermIds: [],
    currentStageAnswers: [],
    feedback: null,
    history: [],
    completed: false,
  };
}

export function submitWriteAnswer(
  state: WriteExerciseState,
  term: Term,
  submittedAnswer: string,
  wasSkipped = false,
): WriteExerciseState {
  if (
    state.completed ||
    state.feedback ||
    state.queue[state.currentIndex] !== term.id
  ) {
    return state;
  }

  const isCorrect =
    !wasSkipped && isWriteAnswerCorrect(submittedAnswer, term.term);
  const result: WriteAnswerResult = {
    termId: term.id,
    submittedAnswer: wasSkipped ? "" : submittedAnswer,
    isCorrect,
    wasSkipped,
    wasOverridden: false,
  };

  return {
    ...state,
    correctCount: state.correctCount + (isCorrect ? 1 : 0),
    incorrectCount: state.incorrectCount + (isCorrect ? 0 : 1),
    unresolvedTermIds: isCorrect
      ? state.unresolvedTermIds
      : [...state.unresolvedTermIds, term.id],
    currentStageAnswers: [...state.currentStageAnswers, result],
    feedback: result,
  };
}

export function overrideWriteAnswer(
  state: WriteExerciseState,
): WriteExerciseState {
  if (!state.feedback || state.feedback.isCorrect) {
    return state;
  }

  const overriddenResult: WriteAnswerResult = {
    ...state.feedback,
    isCorrect: true,
    wasOverridden: true,
  };
  const currentStageAnswers = [...state.currentStageAnswers];
  currentStageAnswers[currentStageAnswers.length - 1] = overriddenResult;

  return {
    ...state,
    correctCount: state.correctCount + 1,
    incorrectCount: Math.max(0, state.incorrectCount - 1),
    unresolvedTermIds: state.unresolvedTermIds.filter(
      (termId) => termId !== state.feedback?.termId,
    ),
    currentStageAnswers,
    feedback: overriddenResult,
  };
}

export function continueWriteExercise(
  state: WriteExerciseState,
  totalTermCount: number,
  random: () => number = Math.random,
): WriteExerciseState {
  if (state.completed || !state.feedback) {
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
      answers: state.currentStageAnswers,
    },
  ];

  if (state.unresolvedTermIds.length === 0) {
    return {
      stageNumber: state.stageNumber,
      queue: [],
      currentIndex: 0,
      correctCount: totalTermCount,
      incorrectCount: 0,
      unresolvedTermIds: [],
      currentStageAnswers: [],
      feedback: null,
      history,
      completed: true,
    };
  }

  return {
    stageNumber: state.stageNumber + 1,
    queue: shuffleTermIds(state.unresolvedTermIds, random),
    currentIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    unresolvedTermIds: [],
    currentStageAnswers: [],
    feedback: null,
    history,
    completed: false,
  };
}

export function getModuleTermsFingerprint(terms: Term[]) {
  return JSON.stringify(
    terms.map(({ id, term, definition }) => ({ id, term, definition })),
  );
}

export function getWriteSessionStorageKey(moduleId: string) {
  return `dictcards:write:${moduleId}`;
}

export function saveWriteSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
  state: WriteExerciseState,
) {
  const payload: PersistedWriteSession = {
    version: WRITE_SESSION_VERSION,
    fingerprint: getModuleTermsFingerprint(terms),
    state,
  };

  try {
    storage.setItem(getWriteSessionStorageKey(moduleId), JSON.stringify(payload));
  } catch {
    // Progress persistence is best-effort; the exercise must still remain usable.
  }
}

export function loadWriteSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
): WriteExerciseState | null {
  try {
    const stored = storage.getItem(getWriteSessionStorageKey(moduleId));

    if (!stored) {
      return null;
    }

    const payload = JSON.parse(stored) as unknown;

    if (
      !isRecord(payload) ||
      payload.version !== WRITE_SESSION_VERSION ||
      payload.fingerprint !== getModuleTermsFingerprint(terms) ||
      !isValidWriteState(payload.state, terms)
    ) {
      storage.removeItem(getWriteSessionStorageKey(moduleId));
      return null;
    }

    return payload.state;
  } catch {
    try {
      storage.removeItem(getWriteSessionStorageKey(moduleId));
    } catch {
      // Ignore unavailable storage and start a fresh exercise.
    }
    return null;
  }
}

export function clearWriteSession(storage: Storage, moduleId: string) {
  try {
    storage.removeItem(getWriteSessionStorageKey(moduleId));
  } catch {
    // Ignore unavailable storage and restart in memory.
  }
}

function isValidWriteState(
  value: unknown,
  terms: Term[],
): value is WriteExerciseState {
  if (!isRecord(value)) {
    return false;
  }

  const termIds = new Set(terms.map((term) => term.id));
  const history = value.history;
  const queue = value.queue;
  const currentStageAnswers = value.currentStageAnswers;
  const unresolvedTermIds = value.unresolvedTermIds;

  if (
    !isPositiveInteger(value.stageNumber) ||
    !Array.isArray(history) ||
    !Array.isArray(queue) ||
    !Array.isArray(currentStageAnswers) ||
    !Array.isArray(unresolvedTermIds) ||
    !isNonNegativeInteger(value.currentIndex) ||
    !isNonNegativeInteger(value.correctCount) ||
    !isNonNegativeInteger(value.incorrectCount) ||
    typeof value.completed !== "boolean" ||
    !isUniqueValidTermIdList(queue, termIds) ||
    !isUniqueValidTermIdList(unresolvedTermIds, termIds) ||
    !currentStageAnswers.every((answer) => isValidAnswer(answer, termIds)) ||
    !history.every((stage, index) => isValidStage(stage, index + 1, termIds))
  ) {
    return false;
  }

  if (value.completed) {
    return (
      queue.length === 0 &&
      value.currentIndex === 0 &&
      currentStageAnswers.length === 0 &&
      unresolvedTermIds.length === 0 &&
      value.feedback === null &&
      value.correctCount === terms.length &&
      value.incorrectCount === 0 &&
      history.length === value.stageNumber &&
      history.length > 0 &&
      history[history.length - 1].answers.every(
        (answer: WriteAnswerResult) => answer.isCorrect,
      )
    );
  }

  if (
    queue.length === 0 ||
    value.currentIndex >= queue.length ||
    history.length !== value.stageNumber - 1
  ) {
    return false;
  }

  const feedback = value.feedback;
  const feedbackIsValid =
    feedback === null || isValidAnswer(feedback, termIds);

  if (!feedbackIsValid) {
    return false;
  }

  const answeredCount =
    value.currentIndex + (feedback === null ? 0 : 1);
  const correctCount = currentStageAnswers.filter(
    (answer: WriteAnswerResult) => answer.isCorrect,
  ).length;
  const incorrectTermIds = currentStageAnswers
    .filter((answer: WriteAnswerResult) => !answer.isCorrect)
    .map((answer: WriteAnswerResult) => answer.termId);

  return (
    currentStageAnswers.length === answeredCount &&
    currentStageAnswers.every(
      (answer: WriteAnswerResult, index: number) =>
        answer.termId === queue[index],
    ) &&
    value.correctCount === correctCount &&
    value.incorrectCount === currentStageAnswers.length - correctCount &&
    arraysEqual(unresolvedTermIds, incorrectTermIds) &&
    (feedback === null ||
      (feedback.termId === queue[value.currentIndex] &&
        answersEqual(
          feedback,
          currentStageAnswers[currentStageAnswers.length - 1],
        )))
  );
}

function isValidStage(
  value: unknown,
  expectedStageNumber: number,
  validTermIds: Set<string>,
) {
  return (
    isRecord(value) &&
    value.stageNumber === expectedStageNumber &&
    Array.isArray(value.answers) &&
    value.answers.length > 0 &&
    value.answers.every((answer) => isValidAnswer(answer, validTermIds)) &&
    new Set(
      value.answers.map((answer: WriteAnswerResult) => answer.termId),
    ).size === value.answers.length
  );
}

function isValidAnswer(
  value: unknown,
  validTermIds: Set<string>,
): value is WriteAnswerResult {
  return (
    isRecord(value) &&
    typeof value.termId === "string" &&
    validTermIds.has(value.termId) &&
    typeof value.submittedAnswer === "string" &&
    typeof value.isCorrect === "boolean" &&
    typeof value.wasSkipped === "boolean" &&
    typeof value.wasOverridden === "boolean"
  );
}

function isUniqueValidTermIdList(
  value: unknown[],
  validTermIds: Set<string>,
) {
  return (
    value.every(
      (termId) => typeof termId === "string" && validTermIds.has(termId),
    ) && new Set(value).size === value.length
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function arraysEqual(left: unknown[], right: unknown[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function answersEqual(left: WriteAnswerResult, right: WriteAnswerResult) {
  return (
    left.termId === right.termId &&
    left.submittedAnswer === right.submittedAnswer &&
    left.isCorrect === right.isCorrect &&
    left.wasSkipped === right.wasSkipped &&
    left.wasOverridden === right.wasOverridden
  );
}
