import type { Term } from "@/types/module";

const SPELL_SESSION_VERSION = 1;

export const SPELL_STAGE_SIZE = 7;
export const SPELL_MASTERY_TARGET = 2;

export interface SpellAttempt {
  termId: string;
  submittedAnswer: string;
  isCorrect: boolean;
}

export interface SpellStageResult {
  stageNumber: number;
  attempts: SpellAttempt[];
}

export interface SpellFeedback {
  kind: "correct" | "incorrect";
  termId: string;
  submittedAnswer: string;
}

export interface SpellExerciseState {
  stageNumber: number;
  queue: string[];
  currentIndex: number;
  mastery: Record<string, number>;
  currentStageAttempts: SpellAttempt[];
  feedback: SpellFeedback | null;
  correctionTermId: string | null;
  correctionError: boolean;
  history: SpellStageResult[];
  completed: boolean;
}

interface PersistedSpellSession {
  version: number;
  fingerprint: string;
  state: SpellExerciseState;
}

export interface SpellDifferenceSegment {
  text: string;
  different: boolean;
}

export function normalizeSpellAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isSpellAnswerCorrect(answer: string, expected: string) {
  return normalizeSpellAnswer(answer) === normalizeSpellAnswer(expected);
}

export function shuffleSpellTermIds(
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

export function createSpellStageQueue(
  terms: Term[],
  mastery: Record<string, number>,
  random: () => number = Math.random,
) {
  return shuffleSpellTermIds(
    terms
      .filter(
        (term) => (mastery[term.id] ?? 0) < SPELL_MASTERY_TARGET,
      )
      .map((term) => term.id),
    random,
  ).slice(0, SPELL_STAGE_SIZE);
}

export function createInitialSpellState(
  terms: Term[],
  random: () => number = Math.random,
): SpellExerciseState {
  const mastery = Object.fromEntries(terms.map((term) => [term.id, 0]));

  return {
    stageNumber: 1,
    queue: createSpellStageQueue(terms, mastery, random),
    currentIndex: 0,
    mastery,
    currentStageAttempts: [],
    feedback: null,
    correctionTermId: null,
    correctionError: false,
    history: [],
    completed: terms.length === 0,
  };
}

export function submitSpellAnswer(
  state: SpellExerciseState,
  term: Term,
  submittedAnswer: string,
): SpellExerciseState {
  if (
    state.completed ||
    state.feedback ||
    state.correctionTermId ||
    state.queue[state.currentIndex] !== term.id
  ) {
    return state;
  }

  const isCorrect = isSpellAnswerCorrect(submittedAnswer, term.term);
  const attempt: SpellAttempt = {
    termId: term.id,
    submittedAnswer,
    isCorrect,
  };

  return {
    ...state,
    currentStageAttempts: [...state.currentStageAttempts, attempt],
    feedback: {
      kind: isCorrect ? "correct" : "incorrect",
      termId: term.id,
      submittedAnswer,
    },
  };
}

export function continueCorrectSpellAnswer(
  state: SpellExerciseState,
  terms: Term[],
  random: () => number = Math.random,
): SpellExerciseState {
  if (
    state.completed ||
    state.feedback?.kind !== "correct" ||
    state.feedback.termId !== state.queue[state.currentIndex]
  ) {
    return state;
  }

  const termId = state.feedback.termId;
  const mastery = {
    ...state.mastery,
    [termId]: Math.min(
      SPELL_MASTERY_TARGET,
      (state.mastery[termId] ?? 0) + 1,
    ),
  };

  return advanceSpellExercise({ ...state, mastery }, terms, random);
}

export function beginSpellCorrection(
  state: SpellExerciseState,
): SpellExerciseState {
  if (
    state.completed ||
    state.feedback?.kind !== "incorrect" ||
    state.feedback.termId !== state.queue[state.currentIndex]
  ) {
    return state;
  }

  return {
    ...state,
    feedback: null,
    correctionTermId: state.queue[state.currentIndex],
    correctionError: false,
  };
}

export function submitSpellCorrection(
  state: SpellExerciseState,
  term: Term,
  submittedAnswer: string,
  terms: Term[],
  random: () => number = Math.random,
): SpellExerciseState {
  if (
    state.completed ||
    state.feedback ||
    state.correctionTermId !== term.id ||
    state.queue[state.currentIndex] !== term.id
  ) {
    return state;
  }

  if (!isSpellAnswerCorrect(submittedAnswer, term.term)) {
    return { ...state, correctionError: true };
  }

  return advanceSpellExercise(
    {
      ...state,
      correctionTermId: null,
      correctionError: false,
    },
    terms,
    random,
  );
}

export function getSpellOverallProgress(
  state: SpellExerciseState,
  totalTermCount: number,
) {
  if (totalTermCount === 0) {
    return 0;
  }

  const earnedMastery = Object.values(state.mastery).reduce(
    (total, value) => total + value,
    0,
  );

  return Math.round(
    (earnedMastery / (totalTermCount * SPELL_MASTERY_TARGET)) * 100,
  );
}

export function getSpellStageAccuracy(stage: SpellStageResult) {
  if (stage.attempts.length === 0) {
    return 0;
  }

  return Math.round(
    (stage.attempts.filter((attempt) => attempt.isCorrect).length /
      stage.attempts.length) *
      100,
  );
}

export function getExpectedAnswerDifference(
  submitted: string,
  expected: string,
): SpellDifferenceSegment[] {
  const submittedCharacters = Array.from(normalizeSpellAnswer(submitted));
  const displayExpected = expected.trim().replace(/\s+/g, " ");
  const expectedCharacters = Array.from(displayExpected);
  const comparableExpected = Array.from(displayExpected.toLowerCase());
  const distances = Array.from(
    { length: submittedCharacters.length + 1 },
    (_, submittedIndex) =>
      Array.from(
        { length: expectedCharacters.length + 1 },
        (_, expectedIndex) => submittedIndex + expectedIndex,
      ),
  );

  for (
    let submittedIndex = 1;
    submittedIndex <= submittedCharacters.length;
    submittedIndex += 1
  ) {
    for (
      let expectedIndex = 1;
      expectedIndex <= expectedCharacters.length;
      expectedIndex += 1
    ) {
      const substitutionCost =
        submittedCharacters[submittedIndex - 1] ===
        comparableExpected[expectedIndex - 1]
          ? 0
          : 1;
      distances[submittedIndex][expectedIndex] = Math.min(
        distances[submittedIndex - 1][expectedIndex] + 1,
        distances[submittedIndex][expectedIndex - 1] + 1,
        distances[submittedIndex - 1][expectedIndex - 1] +
          substitutionCost,
      );
    }
  }

  const characters: Array<{ text: string; different: boolean }> = [];
  let submittedIndex = submittedCharacters.length;
  let expectedIndex = expectedCharacters.length;

  while (expectedIndex > 0) {
    const expectedCharacter = comparableExpected[expectedIndex - 1];
    const submittedCharacter = submittedCharacters[submittedIndex - 1];

    if (
      submittedIndex > 0 &&
      submittedCharacter === expectedCharacter &&
      distances[submittedIndex][expectedIndex] ===
        distances[submittedIndex - 1][expectedIndex - 1]
    ) {
      characters.push({
        text: expectedCharacters[expectedIndex - 1],
        different: false,
      });
      submittedIndex -= 1;
      expectedIndex -= 1;
      continue;
    }

    const substitution =
      submittedIndex > 0
        ? distances[submittedIndex - 1][expectedIndex - 1]
        : Number.POSITIVE_INFINITY;
    const missingExpectedCharacter =
      distances[submittedIndex][expectedIndex - 1];
    const extraSubmittedCharacter =
      submittedIndex > 0
        ? distances[submittedIndex - 1][expectedIndex]
        : Number.POSITIVE_INFINITY;

    if (missingExpectedCharacter <= Math.min(substitution, extraSubmittedCharacter)) {
      characters.push({
        text: expectedCharacters[expectedIndex - 1],
        different: true,
      });
      expectedIndex -= 1;
    } else if (substitution <= extraSubmittedCharacter) {
      characters.push({
        text: expectedCharacters[expectedIndex - 1],
        different: true,
      });
      submittedIndex -= 1;
      expectedIndex -= 1;
    } else {
      submittedIndex -= 1;
    }
  }

  characters.reverse();

  return characters.reduce<SpellDifferenceSegment[]>((segments, character) => {
    const previous = segments[segments.length - 1];

    if (previous?.different === character.different) {
      previous.text += character.text;
    } else {
      segments.push({ ...character });
    }

    return segments;
  }, []);
}

export function getSpellSessionStorageKey(moduleId: string) {
  return `dictcards:spell:${moduleId}`;
}

export function saveSpellSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
  state: SpellExerciseState,
) {
  const payload: PersistedSpellSession = {
    version: SPELL_SESSION_VERSION,
    fingerprint: getModuleTermsFingerprint(terms),
    state,
  };

  try {
    storage.setItem(getSpellSessionStorageKey(moduleId), JSON.stringify(payload));
  } catch {
    // Session persistence is best-effort; the exercise remains usable in memory.
  }
}

export function loadSpellSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
): SpellExerciseState | null {
  try {
    const stored = storage.getItem(getSpellSessionStorageKey(moduleId));

    if (!stored) {
      return null;
    }

    const payload = JSON.parse(stored) as unknown;

    if (
      !isRecord(payload) ||
      payload.version !== SPELL_SESSION_VERSION ||
      payload.fingerprint !== getModuleTermsFingerprint(terms) ||
      !isValidSpellState(payload.state, terms)
    ) {
      storage.removeItem(getSpellSessionStorageKey(moduleId));
      return null;
    }

    return payload.state;
  } catch {
    try {
      storage.removeItem(getSpellSessionStorageKey(moduleId));
    } catch {
      // Ignore unavailable storage and start a new in-memory exercise.
    }
    return null;
  }
}

export function clearSpellSession(storage: Storage, moduleId: string) {
  try {
    storage.removeItem(getSpellSessionStorageKey(moduleId));
  } catch {
    // Ignore unavailable storage and restart in memory.
  }
}

function advanceSpellExercise(
  state: SpellExerciseState,
  terms: Term[],
  random: () => number,
): SpellExerciseState {
  if (state.currentIndex < state.queue.length - 1) {
    return {
      ...state,
      currentIndex: state.currentIndex + 1,
      feedback: null,
      correctionTermId: null,
      correctionError: false,
    };
  }

  const history = [
    ...state.history,
    {
      stageNumber: state.stageNumber,
      attempts: state.currentStageAttempts,
    },
  ];
  const completed = terms.every(
    (term) =>
      (state.mastery[term.id] ?? 0) >= SPELL_MASTERY_TARGET,
  );

  if (completed) {
    return {
      ...state,
      queue: [],
      currentIndex: 0,
      currentStageAttempts: [],
      feedback: null,
      correctionTermId: null,
      correctionError: false,
      history,
      completed: true,
    };
  }

  return {
    ...state,
    stageNumber: state.stageNumber + 1,
    queue: createSpellStageQueue(terms, state.mastery, random),
    currentIndex: 0,
    currentStageAttempts: [],
    feedback: null,
    correctionTermId: null,
    correctionError: false,
    history,
    completed: false,
  };
}

function getModuleTermsFingerprint(terms: Term[]) {
  return JSON.stringify(
    terms.map(({ id, term, definition }) => ({ id, term, definition })),
  );
}

function isValidSpellState(
  value: unknown,
  terms: Term[],
): value is SpellExerciseState {
  if (!isRecord(value)) {
    return false;
  }

  const termIds = new Set(terms.map((term) => term.id));
  const mastery = value.mastery;
  const history = value.history;
  const queue = value.queue;
  const currentStageAttempts = value.currentStageAttempts;

  if (
    !isPositiveInteger(value.stageNumber) ||
    !Array.isArray(history) ||
    !Array.isArray(queue) ||
    !Array.isArray(currentStageAttempts) ||
    !isNonNegativeInteger(value.currentIndex) ||
    !isRecord(mastery) ||
    typeof value.completed !== "boolean" ||
    typeof value.correctionError !== "boolean" ||
    !isUniqueValidTermIdList(queue, termIds) ||
    queue.length > SPELL_STAGE_SIZE ||
    !currentStageAttempts.every((attempt) =>
      isValidAttempt(attempt, termIds),
    ) ||
    !history.every((stage, index) =>
      isValidStage(stage, index + 1, termIds),
    ) ||
    !hasValidMastery(mastery, termIds)
  ) {
    return false;
  }

  const feedback = value.feedback;
  const feedbackIsValid =
    feedback === null || isValidFeedback(feedback, termIds);
  const correctionTermId = value.correctionTermId;
  const correctionIsValid =
    correctionTermId === null ||
    (typeof correctionTermId === "string" && termIds.has(correctionTermId));

  if (!feedbackIsValid || !correctionIsValid || (feedback && correctionTermId)) {
    return false;
  }

  if (value.completed) {
    return (
      terms.length > 0 &&
      queue.length === 0 &&
      value.currentIndex === 0 &&
      currentStageAttempts.length === 0 &&
      feedback === null &&
      correctionTermId === null &&
      history.length === value.stageNumber &&
      terms.every(
        (term) => mastery[term.id] === SPELL_MASTERY_TARGET,
      )
    );
  }

  if (
    queue.length === 0 ||
    value.currentIndex >= queue.length ||
    history.length !== value.stageNumber - 1 ||
    queue.slice(value.currentIndex).some(
      (termId) =>
        Number(mastery[termId]) >= SPELL_MASTERY_TARGET,
    )
  ) {
    return false;
  }

  const hasEvaluatedCurrent = feedback !== null || correctionTermId !== null;
  const expectedAttemptCount =
    value.currentIndex + (hasEvaluatedCurrent ? 1 : 0);

  if (
    currentStageAttempts.length !== expectedAttemptCount ||
    !currentStageAttempts.every(
      (attempt: SpellAttempt, index: number) =>
        attempt.termId === queue[index],
    )
  ) {
    return false;
  }

  if (feedback) {
    const attempt = currentStageAttempts[currentStageAttempts.length - 1];
    return (
      feedback.termId === queue[value.currentIndex] &&
      feedback.submittedAnswer === attempt.submittedAnswer &&
      (feedback.kind === "correct") === attempt.isCorrect &&
      value.correctionError === false
    );
  }

  if (correctionTermId) {
    const attempt = currentStageAttempts[currentStageAttempts.length - 1];
    return (
      correctionTermId === queue[value.currentIndex] &&
      attempt.termId === correctionTermId &&
      !attempt.isCorrect
    );
  }

  return value.correctionError === false;
}

function hasValidMastery(
  mastery: Record<string, unknown>,
  termIds: Set<string>,
) {
  const masteryIds = Object.keys(mastery);

  return (
    masteryIds.length === termIds.size &&
    masteryIds.every(
      (termId) =>
        termIds.has(termId) &&
        isNonNegativeInteger(mastery[termId]) &&
        Number(mastery[termId]) <= SPELL_MASTERY_TARGET,
    )
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
    Array.isArray(value.attempts) &&
    value.attempts.length > 0 &&
    value.attempts.length <= SPELL_STAGE_SIZE &&
    value.attempts.every((attempt) =>
      isValidAttempt(attempt, validTermIds),
    ) &&
    new Set(
      value.attempts.map((attempt: SpellAttempt) => attempt.termId),
    ).size === value.attempts.length
  );
}

function isValidAttempt(
  value: unknown,
  validTermIds: Set<string>,
): value is SpellAttempt {
  return (
    isRecord(value) &&
    typeof value.termId === "string" &&
    validTermIds.has(value.termId) &&
    typeof value.submittedAnswer === "string" &&
    typeof value.isCorrect === "boolean"
  );
}

function isValidFeedback(
  value: unknown,
  validTermIds: Set<string>,
): value is SpellFeedback {
  return (
    isRecord(value) &&
    (value.kind === "correct" || value.kind === "incorrect") &&
    typeof value.termId === "string" &&
    validTermIds.has(value.termId) &&
    typeof value.submittedAnswer === "string"
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
