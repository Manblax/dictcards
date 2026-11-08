import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPublicApiUrl,
  lookupDictionary,
  type DictionaryLookupResult,
} from "@/lib/api";
import { clearPronunciationCache } from "@/lib/pronunciation-cache";
import type { Term } from "@/types/module";
import CardExercise, { getCardHint } from "./CardExercise";

vi.mock("@/lib/api", () => ({
  getPublicApiUrl: vi.fn((path: string) => `https://api.example.test${path}`),
  lookupDictionary: vi.fn(),
  synthesizeSpeech: vi.fn().mockRejectedValue(new Error("Speech unavailable")),
}));

const terms: Term[] = [
  {
    id: "term-1",
    term: "Apple",
    definition: "Apple is a round fruit",
  },
  {
    id: "term-2",
    term: "Book",
    definition: "pages bound together",
  },
];

function createLookupResult(): DictionaryLookupResult {
  return {
    word: "apple",
    normalizedWord: "apple",
    suggestedDefinition: "a round fruit",
    definitions: [],
    ipa: {},
    audio: { uk: "/dictionary/audio/uk-apple" },
    sources: { audio: "cambridge" },
    cached: true,
  };
}

function renderExercise(customTerms = terms) {
  return render(
    <CardExercise
      moduleId="module-1"
      moduleTitle="English words"
      terms={customTerms}
    />,
  );
}

describe("CardExercise", () => {
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
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(
      undefined,
    );
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
      () => undefined,
    );
  });

  it("flips the card by click and by Space", async () => {
    const user = userEvent.setup();
    renderExercise();

    const flipButton = await screen.findByRole("button", {
      name: "Показать определение",
    });
    const flipper = screen.getByTestId("card-flipper");
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(flipper).toHaveClass("duration-300");
    expect(flipper).not.toHaveClass("[transform:rotateX(180deg)]");

    await user.click(flipButton);
    expect(
      screen.getByRole("button", { name: "Показать термин" }),
    ).toBeInTheDocument();
    expect(flipper).toHaveClass("[transform:rotateX(180deg)]");
    expect(flipper.className).not.toContain("rotateY");

    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(
      screen.getByRole("button", { name: "Показать определение" }),
    ).toBeInTheDocument();
    expect(flipper).not.toHaveClass("[transform:rotateX(180deg)]");
  });

  it("rates cards, advances progress, and supports undo", async () => {
    const user = userEvent.setup();
    renderExercise();

    await screen.findByText("Apple");
    await user.click(screen.getByRole("button", { name: "Знаю" }));

    expect(screen.getByText("Book")).toBeInTheDocument();
    expect(screen.getByLabelText("Прогресс: 50%")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Отменить последний ответ" }),
    );

    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByLabelText("Прогресс: 0%")).toBeInTheDocument();
  });

  it("supports keyboard rating and shows a completion summary", async () => {
    renderExercise();

    await screen.findByText("Apple");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(
      await screen.findByRole("heading", {
        name: "Все карточки просмотрены",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Apple", { selector: "li" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Начать заново" }),
    ).toBeInTheDocument();
  });

  it("reveals a masked hint", async () => {
    const user = userEvent.setup();
    renderExercise();

    await user.click(
      await screen.findByRole("button", { name: "Показать подсказку" }),
    );

    expect(screen.getByText("_____ is a round fruit")).toHaveClass(
      "w-max",
      "max-w-full",
      "whitespace-nowrap",
      "text-ellipsis",
    );
    expect(getCardHint(terms[0])).toBe("_____ is a round fruit");
  });

  it("plays the preferred available pronunciation", async () => {
    const user = userEvent.setup();
    renderExercise();

    await user.click(
      await screen.findByRole("button", {
        name: "Воспроизвести произношение",
      }),
    );

    await waitFor(() => expect(lookupDictionary).toHaveBeenCalledWith("apple", { source: "cambridge" }));
    expect(getPublicApiUrl).toHaveBeenCalledWith(
      "/dictionary/audio/uk-apple",
    );
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
  });
});
