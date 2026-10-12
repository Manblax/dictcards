import type { Term } from "@/types/module";

const CARD_SESSION_VERSION = 1;

export type CardRating = "learning" | "known";

export interface CardReview {
  termId: string;
  rating: CardRating;
}

export interface CardExerciseState {
  order: string[];
  currentIndex: number;
  learningTermIds: string[];
  knownTermIds: string[];
  history: CardReview[];
  completed: boolean;
}

interface PersistedCardSession {
  version: number;
  fingerprint: string;
  state: CardExerciseState;
}

export function createInitialCardState(terms: Term[]): CardExerciseState {
  return {
    order: terms.map((term) => term.id),
    currentIndex: 0,
    learningTermIds: [],
    knownTermIds: [],
    history: [],
    completed: terms.length === 0,
  };
}

export function rateCurrentCard(
  state: CardExerciseState,
  rating: CardRating,
): CardExerciseState {
  if (state.completed) {
    return state;
  }

  const termId = state.order[state.currentIndex];

  if (!termId) {
    return state;
  }

  const currentIndex = state.currentIndex + 1;

  return {
    ...state,
    currentIndex,
    learningTermIds:
      rating === "learning"
        ? [...state.learningTermIds, termId]
        : state.learningTermIds,
    knownTermIds:
      rating === "known"
        ? [...state.knownTermIds, termId]
        : state.knownTermIds,
    history: [...state.history, { termId, rating }],
    completed: currentIndex === state.order.length,
  };
}

export function undoLastCardRating(
  state: CardExerciseState,
): CardExerciseState {
  const review = state.history[state.history.length - 1];

  if (!review) {
    return state;
  }

  return {
    ...state,
    currentIndex: Math.max(0, state.currentIndex - 1),
    learningTermIds: state.learningTermIds.filter(
      (termId) => termId !== review.termId,
    ),
    knownTermIds: state.knownTermIds.filter(
      (termId) => termId !== review.termId,
    ),
    history: state.history.slice(0, -1),
    completed: false,
  };
}

export function shuffleRemainingCards(
  state: CardExerciseState,
  random: () => number = Math.random,
): CardExerciseState {
  if (state.completed || state.currentIndex >= state.order.length - 2) {
    return state;
  }

  const currentAndReviewed = state.order.slice(0, state.currentIndex + 1);
  const remaining = state.order.slice(state.currentIndex + 1);

  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [remaining[index], remaining[targetIndex]] = [
      remaining[targetIndex],
      remaining[index],
    ];
  }

  return {
    ...state,
    order: [...currentAndReviewed, ...remaining],
  };
}

export function getCardProgress(state: CardExerciseState) {
  if (state.order.length === 0) {
    return 0;
  }

  return Math.round((state.currentIndex / state.order.length) * 100);
}

export function getCardSessionStorageKey(moduleId: string) {
  return `dictcards:card:${moduleId}`;
}

export function saveCardSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
  state: CardExerciseState,
) {
  const payload: PersistedCardSession = {
    version: CARD_SESSION_VERSION,
    fingerprint: getTermsFingerprint(terms),
    state,
  };

  try {
    storage.setItem(getCardSessionStorageKey(moduleId), JSON.stringify(payload));
  } catch {
    // Progress persistence is best-effort; the exercise remains usable in memory.
  }
}

export function loadCardSession(
  storage: Storage,
  moduleId: string,
  terms: Term[],
): CardExerciseState | null {
  const storageKey = getCardSessionStorageKey(moduleId);

  try {
    const stored = storage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const payload = JSON.parse(stored) as unknown;

    if (
      !isRecord(payload) ||
      payload.version !== CARD_SESSION_VERSION ||
      payload.fingerprint !== getTermsFingerprint(terms) ||
      !isValidCardState(payload.state, terms)
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

export function clearCardSession(storage: Storage, moduleId: string) {
  try {
    storage.removeItem(getCardSessionStorageKey(moduleId));
  } catch {
    // Ignore unavailable storage and restart in memory.
  }
}

function getTermsFingerprint(terms: Term[]) {
  return JSON.stringify(
    terms.map(({ id, term, definition }) => ({ id, term, definition })),
  );
}

function isValidCardState(
  value: unknown,
  terms: Term[],
): value is CardExerciseState {
  if (!isRecord(value)) {
    return false;
  }

  const validTermIds = new Set(terms.map((term) => term.id));
  const { order, learningTermIds, knownTermIds, history } = value;

  if (
    !Array.isArray(order) ||
    !Array.isArray(learningTermIds) ||
    !Array.isArray(knownTermIds) ||
    !Array.isArray(history) ||
    !isNonNegativeInteger(value.currentIndex) ||
    typeof value.completed !== "boolean" ||
    !isCompleteUniqueTermList(order, validTermIds) ||
    !isUniqueTermList(learningTermIds, validTermIds) ||
    !isUniqueTermList(knownTermIds, validTermIds) ||
    value.currentIndex > order.length ||
    history.length !== value.currentIndex ||
    learningTermIds.length + knownTermIds.length !== history.length ||
    value.completed !== (value.currentIndex === order.length)
  ) {
    return false;
  }

  const reviewedIds = new Set(order.slice(0, value.currentIndex));
  const classifiedIds = new Set([...learningTermIds, ...knownTermIds]);

  if (
    classifiedIds.size !== history.length ||
    ![...classifiedIds].every((termId) => reviewedIds.has(termId))
  ) {
    return false;
  }

  return history.every((review, index) => {
    if (!isRecord(review)) {
      return false;
    }

    return (
      review.termId === order[index] &&
      (review.rating === "learning" || review.rating === "known") &&
      (review.rating === "learning"
        ? learningTermIds.includes(review.termId)
        : knownTermIds.includes(review.termId))
    );
  });
}

function isCompleteUniqueTermList(
  value: unknown[],
  validTermIds: Set<string>,
) {
  return (
    value.length === validTermIds.size &&
    isUniqueTermList(value, validTermIds)
  );
}

function isUniqueTermList(value: unknown[], validTermIds: Set<string>) {
  return (
    value.every(
      (termId): termId is string =>
        typeof termId === "string" && validTermIds.has(termId),
    ) && new Set(value).size === value.length
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
