import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPublicApiUrl,
  lookupDictionary,
  type DictionaryLookupResult,
} from "@/lib/api";
import {
  createInitialSpellState,
  saveSpellSession,
  submitSpellAnswer,
} from "@/lib/spell-exercise";
import { PRONUNCIATION_SETTING_KEY } from "@/lib/pronunciation-settings";
import { clearPronunciationCache } from "@/lib/pronunciation-cache";
import type { Term } from "@/types/module";
import SpellExercise from "./SpellExercise";

vi.mock("@/lib/api", () => ({
  getPublicApiUrl: vi.fn((path: string) => `https://api.example.test${path}`),
  lookupDictionary: vi.fn(),
  synthesizeSpeech: vi.fn().mockRejectedValue(new Error("Speech unavailable")),
}));

const terms: Term[] = [
  {
    id: "term-1",
    term: "Apple",
    definition: "a round fruit",
  },
];

const keepOrder = () => 0.999;

function createLookupResult(
  audio: DictionaryLookupResult["audio"] = {
    uk: "/dictionary/audio/uk-apple",
    us: "/dictionary/audio/us-apple",
  },
): DictionaryLookupResult {
  return {
    word: "apple",
    normalizedWord: "apple",
    suggestedDefinition: "a round fruit",
    definitions: [],
    ipa: {},
    audio,
    sources: { audio: "cambridge" },
    cached: true,
  };
}

function renderExercise(customTerms = terms) {
  return render(
    <SpellExercise
      moduleId="module-1"
      moduleTitle="English words"
      terms={customTerms}
    />,
  );
}

describe("SpellExercise", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => clearPronunciationCache());
  beforeEach(() => {
    clearPronunciationCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("audio")));
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:audio");
      static revokeObjectURL = vi.fn();
    });
    vi.mocked(lookupDictionary).mockReset();
    vi.mocked(getPublicApiUrl).mockClear();
    vi.mocked(lookupDictionary).mockResolvedValue(createLookupResult());
    playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
      () => undefined,
    );
  });

  it("automatically plays the preferred pronunciation and supports replay", async () => {
    const user = userEvent.setup();
    localStorage.setItem(PRONUNCIATION_SETTING_KEY, "us");
    renderExercise();

    const input = await screen.findByLabelText("Введите, что слышите");
    expect(input).toHaveFocus();

    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    expect(lookupDictionary).toHaveBeenCalledWith("apple", { source: "cambridge" });
    expect(getPublicApiUrl).toHaveBeenCalledWith(
      "/dictionary/audio/us-apple",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Воспроизвести произношение ещё раз",
      }),
    );
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
  });

  it("falls back to the alternate pronunciation variant", async () => {
    localStorage.setItem(PRONUNCIATION_SETTING_KEY, "us");
    vi.mocked(lookupDictionary).mockResolvedValue(
      createLookupResult({ uk: "/dictionary/audio/uk-only" }),
    );
    renderExercise();

    expect(
      await screen.findByText("Используется UK произношение"),
    ).toBeInTheDocument();
    expect(getPublicApiUrl).toHaveBeenCalledWith(
      "/dictionary/audio/uk-only",
    );
  });

  it("keeps the exercise usable when pronunciation is unavailable", async () => {
    vi.mocked(lookupDictionary).mockResolvedValue(createLookupResult({}));
    renderExercise();

    expect(
      await screen.findByText(
        "Произношение не найдено. Можно продолжить по определению.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Введите, что слышите")).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Воспроизвести произношение ещё раз",
      }),
    ).toBeEnabled();
  });

  it("requires an incorrect answer to be corrected without adding mastery", async () => {
    const user = userEvent.setup();
    renderExercise();

    const input = await screen.findByLabelText("Введите, что слышите");
    await user.type(input, "pear{Enter}");

    expect(
      await screen.findByRole("heading", { name: "Нужно исправить" }),
    ).toBeInTheDocument();
    expect(screen.getByText("pear")).toHaveClass("text-error");
    expect(screen.getByText("Правильный ответ").nextElementSibling).toHaveTextContent(
      "Apple",
    );

    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    const correctionInput = await screen.findByLabelText(
      "Введите правильный ответ ещё раз",
    );
    expect(correctionInput).toHaveFocus();
    await user.type(correctionInput, "still wrong{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ответ пока не совпадает",
    );

    await user.clear(correctionInput);
    await user.type(correctionInput, "apple{Enter}");

    const nextInput = await screen.findByLabelText("Введите, что слышите");
    expect(nextInput).toHaveValue("");
    expect(
      screen.getByLabelText("Освоение термина: 0 из 2"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Общий прогресс: 0%"),
    ).toBeInTheDocument();
  });

  it("completes after two first-try correct spellings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    renderExercise();

    let input = await screen.findByLabelText("Введите, что слышите");
    await user.type(input, "  APPLE  {Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent("Правильно");

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    input = await screen.findByLabelText("Введите, что слышите");
    expect(
      screen.getByLabelText("Освоение термина: 1 из 2"),
    ).toBeInTheDocument();
    await user.type(input, "apple{Enter}");

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(
      await screen.findByRole("heading", { name: "Все термины освоены" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Этапов пройдено: 2")).toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(3);
  });

  it("restores saved feedback from the spell session", async () => {
    let savedState = createInitialSpellState(terms, keepOrder);
    savedState = submitSpellAnswer(savedState, terms[0], "apple");
    saveSpellSession(sessionStorage, "module-1", terms, savedState);

    renderExercise();

    expect(await screen.findByRole("status")).toHaveTextContent("Правильно");
    expect(screen.getByDisplayValue("apple")).toBeDisabled();
  });

  it("shows links to add terms when the module is empty", () => {
    renderExercise([]);

    expect(
      screen.getByRole("heading", { name: "В модуле пока нет терминов" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Добавить термины" })).toHaveAttribute(
      "href",
      "/module/module-1/edit",
    );
    expect(
      screen.getByRole("link", { name: "Вернуться к модулю" }),
    ).toHaveAttribute("href", "/module/module-1");
    expect(lookupDictionary).not.toHaveBeenCalled();
  });
});
