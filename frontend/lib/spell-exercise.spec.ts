import { beforeEach, describe, expect, it } from "vitest";

import type { Term } from "@/types/module";
import {
  beginSpellCorrection,
  continueCorrectSpellAnswer,
  createInitialSpellState,
  getExpectedAnswerDifference,
  getSpellOverallProgress,
  getSpellSessionStorageKey,
  getSpellStageAccuracy,
  isSpellAnswerCorrect,
  loadSpellSession,
  normalizeSpellAnswer,
  saveSpellSession,
  SPELL_MASTERY_TARGET,
  submitSpellAnswer,
  submitSpellCorrection,
} from "./spell-exercise";

const terms: Term[] = [
  {
    id: "term-1",
    term: "Apple",
    definition: "a round fruit",
  },
  {
    id: "term-2",
    term: "make a decision",
    definition: "choose what to do",
  },
];

const keepOrder = () => 0.999;

describe("spell exercise state", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("normalizes case and whitespace while preserving punctuation", () => {
    expect(normalizeSpellAnswer("  MAKE   A DECISION  ")).toBe(
      "make a decision",
    );
    expect(
      isSpellAnswerCorrect(" MAKE   A DECISION ", "make a decision"),
    ).toBe(true);
    expect(isSpellAnswerCorrect("cant", "can't")).toBe(false);
    expect(isSpellAnswerCorrect("ice cream", "ice-cream")).toBe(false);
  });

  it("creates shuffled stages with at most seven distinct terms", () => {
    const manyTerms = Array.from({ length: 10 }, (_, index) => ({
      id: `term-${index}`,
      term: `word ${index}`,
      definition: `definition ${index}`,
    }));
    const state = createInitialSpellState(manyTerms, keepOrder);

    expect(state.queue).toHaveLength(7);
    expect(new Set(state.queue)).toHaveLength(7);
    expect(state.queue).toEqual(
      manyTerms.slice(0, 7).map((term) => term.id),
    );
  });

  it("requires two first-try correct answers to master a term", () => {
    const singleTerm = [terms[0]];
    let state = createInitialSpellState(singleTerm, keepOrder);

    state = submitSpellAnswer(state, terms[0], "APPLE");
    expect(state.feedback?.kind).toBe("correct");
    expect(getSpellOverallProgress(state, 1)).toBe(0);

    state = continueCorrectSpellAnswer(state, singleTerm, keepOrder);
    expect(state.mastery[terms[0].id]).toBe(1);
    expect(state.completed).toBe(false);
    expect(state.stageNumber).toBe(2);
    expect(getSpellOverallProgress(state, 1)).toBe(50);

    state = submitSpellAnswer(state, terms[0], "apple");
    state = continueCorrectSpellAnswer(state, singleTerm, keepOrder);

    expect(state.mastery[terms[0].id]).toBe(SPELL_MASTERY_TARGET);
    expect(state.completed).toBe(true);
    expect(state.history).toHaveLength(2);
    expect(getSpellOverallProgress(state, 1)).toBe(100);
  });

  it("requires a wrong answer to be retyped without granting mastery", () => {
    const singleTerm = [terms[0]];
    let state = createInitialSpellState(singleTerm, keepOrder);

    state = submitSpellAnswer(state, terms[0], "pear");
    expect(state.feedback?.kind).toBe("incorrect");
    expect(state.currentStageAttempts).toEqual([
      {
        termId: terms[0].id,
        submittedAnswer: "pear",
        isCorrect: false,
      },
    ]);

    state = beginSpellCorrection(state);
    state = submitSpellCorrection(
      state,
      terms[0],
      "still wrong",
      singleTerm,
      keepOrder,
    );
    expect(state.correctionError).toBe(true);
    expect(state.mastery[terms[0].id]).toBe(0);

    state = submitSpellCorrection(
      state,
      terms[0],
      "apple",
      singleTerm,
      keepOrder,
    );

    expect(state.mastery[terms[0].id]).toBe(0);
    expect(state.stageNumber).toBe(2);
    expect(state.history[0].attempts).toHaveLength(1);
    expect(getSpellStageAccuracy(state.history[0])).toBe(0);
  });

  it("calculates stage accuracy from first attempts only", () => {
    expect(
      getSpellStageAccuracy({
        stageNumber: 1,
        attempts: [
          { termId: "term-1", submittedAnswer: "apple", isCorrect: true },
          { termId: "term-2", submittedAnswer: "guess", isCorrect: false },
        ],
      }),
    ).toBe(50);
  });

  it("highlights missing characters in the expected answer", () => {
    expect(
      getExpectedAnswerDifference("make concession", "make concessions"),
    ).toEqual([
      { text: "make concession", different: false },
      { text: "s", different: true },
    ]);
  });

  it("saves and restores independent spell progress", () => {
    let state = createInitialSpellState(terms, keepOrder);
    state = submitSpellAnswer(state, terms[0], "apple");

    saveSpellSession(sessionStorage, "module-1", terms, state);

    expect(getSpellSessionStorageKey("module-1")).toBe(
      "dictcards:spell:module-1",
    );
    expect(loadSpellSession(sessionStorage, "module-1", terms)).toEqual(
      state,
    );
  });

  it("restores progress after a term reaches its first mastery mark", () => {
    let state = createInitialSpellState([terms[0]], keepOrder);
    state = submitSpellAnswer(state, terms[0], "apple");
    state = continueCorrectSpellAnswer(state, [terms[0]], keepOrder);
    saveSpellSession(sessionStorage, "module-1", [terms[0]], state);

    expect(
      loadSpellSession(sessionStorage, "module-1", [terms[0]]),
    ).toEqual(state);
  });

  it("discards corrupt or outdated progress", () => {
    const key = getSpellSessionStorageKey("module-1");
    sessionStorage.setItem(key, "not-json");

    expect(loadSpellSession(sessionStorage, "module-1", terms)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();

    saveSpellSession(
      sessionStorage,
      "module-1",
      terms,
      createInitialSpellState(terms, keepOrder),
    );
    expect(
      loadSpellSession(sessionStorage, "module-1", [
        terms[0],
        { ...terms[1], definition: "changed" },
      ]),
    ).toBeNull();
  });
});
