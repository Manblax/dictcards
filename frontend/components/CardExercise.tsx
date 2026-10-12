"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  clearCardSession,
  createInitialCardState,
  getCardProgress,
  loadCardSession,
  rateCurrentCard,
  saveCardSession,
  shuffleRemainingCards,
  undoLastCardRating,
  type CardRating,
  type CardExerciseState,
} from "@/lib/card-exercise";
import { usePronunciation } from "@/hooks/usePronunciation";

import type { Term } from "@/types/module";

interface CardExerciseProps {
  moduleId: string;
  moduleTitle: string;
  terms: Term[];
}

type CardSide = "term" | "definition";

export default function CardExercise({
  moduleId,
  moduleTitle,
  terms,
}: CardExerciseProps) {
  const [state, setState] = useState<CardExerciseState | null>(null);
  const [side, setSide] = useState<CardSide>("term");
  const [hintVisible, setHintVisible] = useState(false);
  const [shuffleMessageVisible, setShuffleMessageVisible] = useState(false);
  const shuffleMessageTimerRef = useRef<number | null>(null);
  const termsById = useMemo(
    () => new Map(terms.map((term) => [term.id, term])),
    [terms],
  );

  useEffect(() => {
    if (terms.length === 0) {
      return;
    }

    setState(
      loadCardSession(sessionStorage, moduleId, terms) ??
        createInitialCardState(terms),
    );
  }, [moduleId, terms]);

  useEffect(() => {
    if (state) {
      saveCardSession(sessionStorage, moduleId, terms, state);
    }
  }, [moduleId, state, terms]);

  useEffect(() => {
    setSide("term");
    setHintVisible(false);
  }, [state?.currentIndex]);

  useEffect(
    () => () => {
      if (shuffleMessageTimerRef.current !== null) {
        window.clearTimeout(shuffleMessageTimerRef.current);
      }
    },
    [],
  );

  const currentTerm =
    state && !state.completed
      ? termsById.get(state.order[state.currentIndex]) ?? null
      : null;
  const pronunciation = useCardPronunciation(currentTerm);

  const flipCard = useCallback(() => {
    setHintVisible(false);
    setSide((current) =>
      current === "term" ? "definition" : "term",
    );
  }, []);

  const rateCard = useCallback((rating: CardRating) => {
    setState((current) =>
      current ? rateCurrentCard(current, rating) : current,
    );
  }, []);

  const undoRating = useCallback(() => {
    setState((current) =>
      current ? undoLastCardRating(current) : current,
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      if (event.code === "Space" && currentTerm) {
        event.preventDefault();
        flipCard();
      } else if (event.key === "ArrowLeft" && currentTerm) {
        event.preventDefault();
        rateCard("learning");
      } else if (event.key === "ArrowRight" && currentTerm) {
        event.preventDefault();
        rateCard("known");
      } else if (event.key === "Backspace" && state?.history.length) {
        event.preventDefault();
        undoRating();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTerm, flipCard, rateCard, state?.history.length, undoRating]);

  if (terms.length === 0) {
    return (
      <EmptyCardExercise moduleId={moduleId} moduleTitle={moduleTitle} />
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span
          className="loading loading-spinner loading-lg text-primary"
          aria-label="Загрузка упражнения card"
        />
      </div>
    );
  }

  const restart = () => {
    clearCardSession(sessionStorage, moduleId);
    setSide("term");
    setHintVisible(false);
    setState(createInitialCardState(terms));
  };

  const shuffle = () => {
    setState((current) =>
      current ? shuffleRemainingCards(current) : current,
    );
    setShuffleMessageVisible(true);

    if (shuffleMessageTimerRef.current !== null) {
      window.clearTimeout(shuffleMessageTimerRef.current);
    }

    shuffleMessageTimerRef.current = window.setTimeout(() => {
      setShuffleMessageVisible(false);
      shuffleMessageTimerRef.current = null;
    }, 1800);
  };

  return (
    <div className="mobile-study-page page-container overflow-x-clip px-4 py-5 sm:px-6 sm:py-8">
      <main className="mx-auto max-w-6xl">
        <CardExerciseHeader
          moduleId={moduleId}
          moduleTitle={moduleTitle}
          state={state}
        />

        {state.completed ? (
          <CardSummary
            moduleId={moduleId}
            moduleTitle={moduleTitle}
            state={state}
            termsById={termsById}
            onRestart={restart}
            onUndo={undoRating}
          />
        ) : currentTerm ? (
          <>
            <ReviewCard
              hintVisible={hintVisible}
              pronunciation={pronunciation}
              side={side}
              term={currentTerm}
              onFlip={flipCard}
              onHintToggle={() => setHintVisible((visible) => !visible)}
            />

            <CardControls
              canShuffle={state.currentIndex < state.order.length - 2}
              canUndo={state.history.length > 0}
              onRate={rateCard}
              onShuffle={shuffle}
              onUndo={undoRating}
            />

            <p
              className={`mt-3 text-center text-sm text-success transition-opacity ${
                shuffleMessageVisible ? "opacity-100" : "opacity-0"
              }`}
              role="status"
              aria-hidden={!shuffleMessageVisible}
            >
              Оставшиеся карточки перемешаны
            </p>
          </>
        ) : (
          <InvalidCardSession onRestart={restart} />
        )}
      </main>
    </div>
  );
}

function CardExerciseHeader({
  moduleId,
  moduleTitle,
  state,
}: {
  moduleId: string;
  moduleTitle: string;
  state: CardExerciseState;
}) {
  const total = state.order.length;
  const visiblePosition = state.completed
    ? total
    : Math.min(total, state.currentIndex + 1);
  const progress = getCardProgress(state);

  return (
    <header className="card-header mb-5 sm:mb-7">
      <div className="mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Link
          href={`/module/${moduleId}`}
          className="btn btn-circle btn-ghost text-[var(--app-text-strong)]"
          aria-label="Назад к модулю"
          title="Назад к модулю"
        >
          <BackIcon />
        </Link>

        <div className="min-w-0 text-center">
          <p className="font-bold text-[var(--app-text-strong)]">
            {visiblePosition} / {total}
          </p>
          <h1
            className="truncate text-sm text-[var(--app-text-muted)]"
            title={moduleTitle}
          >
            {moduleTitle}
          </h1>
        </div>

        <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">
          card
        </span>
      </div>

      <progress
        className="progress progress-primary h-1.5 w-full"
        value={progress}
        max="100"
        aria-label={`Прогресс: ${progress}%`}
      />

      <div className="mt-5 flex items-center justify-between gap-4 text-sm font-bold sm:text-base">
        <span className="flex items-center gap-2 text-warning">
          Ещё изучаю
          <span className="rounded-full border border-warning/50 px-2 py-0.5">
            {state.learningTermIds.length}
          </span>
        </span>
        <span className="flex items-center gap-2 text-success">
          Знаю
          <span className="rounded-full border border-success/50 px-2 py-0.5">
            {state.knownTermIds.length}
          </span>
        </span>
      </div>
    </header>
  );
}

interface ReviewCardProps {
  hintVisible: boolean;
  pronunciation: CardPronunciationController;
  side: CardSide;
  term: Term;
  onFlip: () => void;
  onHintToggle: () => void;
}

function ReviewCard({
  hintVisible,
  pronunciation,
  side,
  term,
  onFlip,
  onHintToggle,
}: ReviewCardProps) {
  const flipped = side === "definition";

  return (
    <div className="perspective-[1200px]">
      <div
        data-testid="card-flipper"
        className={`grid transition-transform duration-300 ease-in-out [transform-style:preserve-3d] motion-reduce:transition-none ${
          flipped ? "[transform:rotateX(180deg)]" : ""
        }`}
      >
        <CardFace
          active={!flipped}
          hintVisible={hintVisible}
          pronunciation={pronunciation}
          side="term"
          term={term}
          onFlip={onFlip}
          onHintToggle={onHintToggle}
        />
        <CardFace
          active={flipped}
          hintVisible={hintVisible}
          pronunciation={pronunciation}
          side="definition"
          term={term}
          onFlip={onFlip}
          onHintToggle={onHintToggle}
        />
      </div>
    </div>
  );
}

function CardFace({
  active,
  hintVisible,
  pronunciation,
  side,
  term,
  onFlip,
  onHintToggle,
}: {
  active: boolean;
  hintVisible: boolean;
  pronunciation: CardPronunciationController;
  side: CardSide;
  term: Term;
  onFlip: () => void;
  onHintToggle: () => void;
}) {
  const isDefinition = side === "definition";

  return (
    <section
      className={`col-start-1 row-start-1 dictcard-face min-w-0 grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-strong)] shadow-[0_18px_45px_var(--app-shadow)] [backface-visibility:hidden] ${
        isDefinition ? "[transform:rotateX(180deg)]" : ""
      } ${active ? "" : "pointer-events-none"}`}
      aria-hidden={!active}
    >
      <div className="flex min-h-16 items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            className={`btn btn-ghost btn-sm gap-2 px-2 ${
              hintVisible
                ? "text-primary"
                : "text-[var(--app-text-muted)]"
            }`}
            onClick={onHintToggle}
            disabled={!active}
            tabIndex={active ? 0 : -1}
            aria-expanded={active && hintVisible}
          >
            <HintIcon />
            {hintVisible ? "Скрыть подсказку" : "Показать подсказку"}
          </button>

          {hintVisible && active && (
            <p className="absolute left-2 top-11 z-10 w-max max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-[var(--app-field)] px-4 py-2 text-sm leading-relaxed text-[var(--app-text-strong)] shadow-sm sm:px-5">
              {isDefinition ? term.term : getCardHint(term)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <button
            type="button"
            className={`btn btn-circle btn-ghost ${
              pronunciation.status === "error"
                ? "text-error"
                : "text-[var(--app-text-strong)]"
            }`}
            onClick={pronunciation.play}
            disabled={!active || pronunciation.status === "loading"}
            tabIndex={active ? 0 : -1}
            aria-label="Воспроизвести произношение"
            title="Воспроизвести произношение"
          >
            {pronunciation.status === "loading" ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <SpeakerIcon />
            )}
          </button>
          {active && pronunciation.message && (
            <span
              className={`max-w-32 sm:max-w-56 text-right text-xs ${
                pronunciation.status === "error"
                  ? "text-error"
                  : "text-[var(--app-text-muted)]"
              }`}
              role={pronunciation.status === "error" ? "alert" : "status"}
            >
              {pronunciation.message}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        className="flex min-h-0 w-full cursor-pointer flex-col items-center overflow-y-auto overscroll-contain px-5 py-5 text-center outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--app-focus-shadow)] sm:px-10"
        onClick={onFlip}
        disabled={!active}
        tabIndex={active ? 0 : -1}
        aria-label={isDefinition ? "Показать термин" : "Показать определение"}
      >
        <span className="my-auto flex w-full shrink-0 flex-col items-center gap-5">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
            {isDefinition ? "Определение" : "Термин"}
          </span>
          <span
            className={`w-full max-w-4xl [overflow-wrap:anywhere] text-[var(--app-text-strong)] ${
              isDefinition
                ? "text-2xl leading-relaxed sm:text-4xl"
                : "text-3xl leading-tight sm:text-5xl"
            }`}
          >
            {isDefinition ? term.definition : term.term}
          </span>
          {isDefinition && term.image && (
            <img
              src={term.image}
              alt=""
              className="max-h-40 max-w-full rounded-xl object-contain"
            />
          )}
        </span>
      </button>

      <button
        type="button"
        className="flex min-h-11 w-full flex-wrap items-center justify-center gap-2 border-t border-primary/20 bg-primary/15 px-4 py-2 text-sm font-medium text-[var(--app-text-strong)] hover:bg-primary/20"
        onClick={onFlip}
        disabled={!active}
        tabIndex={active ? 0 : -1}
      >
        <span className="card-keyboard-hint items-center justify-center gap-2">
          <KeyboardIcon />
          Нажмите <kbd className="kbd kbd-sm">Пробел</kbd> или карточку, чтобы перевернуть её
        </span>
        <span className="card-touch-hint">Коснитесь карточки, чтобы перевернуть её</span>
      </button>
    </section>
  );
}

function CardControls({
  canShuffle,
  canUndo,
  onRate,
  onShuffle,
  onUndo,
}: {
  canShuffle: boolean;
  canUndo: boolean;
  onRate: (rating: CardRating) => void;
  onShuffle: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="card-controls mt-4 grid items-center gap-3 sm:mt-5">
      <span className="hidden text-sm text-[var(--app-text-muted)] sm:block">
        ← ещё изучаю · знаю →
      </span>

      <div className="card-rating flex items-center justify-center gap-5 sm:gap-7">
        <button
          type="button"
          className="btn btn-circle btn-lg border border-error/30 bg-[var(--app-panel-strong)] text-error hover:border-error hover:bg-error/10"
          onClick={() => onRate("learning")}
          aria-label="Ещё изучаю"
          title="Ещё изучаю (стрелка влево)"
        >
          <CrossIcon />
        </button>
        <button
          type="button"
          className="btn btn-circle btn-lg border border-success/30 bg-[var(--app-panel-strong)] text-success hover:border-success hover:bg-success/10"
          onClick={() => onRate("known")}
          aria-label="Знаю"
          title="Знаю (стрелка вправо)"
        >
          <CheckIcon />
        </button>
      </div>

      <div className="card-tools flex justify-end gap-1">
        <button
          type="button"
          className="btn btn-circle btn-ghost text-[var(--app-text-muted)]"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Отменить последний ответ"
          title="Отменить последний ответ (Backspace)"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="btn btn-circle btn-ghost text-[var(--app-text-muted)]"
          onClick={onShuffle}
          disabled={!canShuffle}
          aria-label="Перемешать оставшиеся карточки"
          title="Перемешать оставшиеся карточки"
        >
          <ShuffleIcon />
        </button>
      </div>
    </div>
  );
}

function CardSummary({
  moduleId,
  moduleTitle,
  state,
  termsById,
  onRestart,
  onUndo,
}: {
  moduleId: string;
  moduleTitle: string;
  state: CardExerciseState;
  termsById: Map<string, Term>;
  onRestart: () => void;
  onUndo: () => void;
}) {
  const learningTerms = state.learningTermIds
    .map((termId) => termsById.get(termId))
    .filter((term): term is Term => Boolean(term));

  return (
    <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-sm sm:p-10">
      <div className="mx-auto max-w-3xl text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 text-success">
          <CheckIcon large />
        </span>
        <h2 className="mt-5 text-3xl font-bold text-[var(--app-text-strong)]">
          Все карточки просмотрены
        </h2>
        <p className="mt-2 text-[var(--app-text-muted)]">
          Результат по модулю «{moduleTitle}» сохранён в этой вкладке.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <SummaryStat
            label="Ещё изучаю"
            value={state.learningTermIds.length}
            colorClass="text-warning"
          />
          <SummaryStat
            label="Знаю"
            value={state.knownTermIds.length}
            colorClass="text-success"
          />
        </div>

        {learningTerms.length > 0 && (
          <div className="mt-7 rounded-xl border border-warning/25 bg-warning/5 p-5 text-left">
            <h3 className="font-bold text-[var(--app-text-strong)]">
              Стоит повторить
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {learningTerms.map((term) => (
                <li
                  key={term.id}
                  className="rounded-full bg-[var(--app-field)] px-3 py-1.5 text-sm text-[var(--app-text-strong)]"
                >
                  {term.term}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            Начать заново
          </button>
          <button type="button" className="btn btn-ghost" onClick={onUndo}>
            Отменить последний ответ
          </button>
          <Link href={`/module/${moduleId}`} className="btn btn-outline">
            Вернуться к модулю
          </Link>
        </div>
      </div>
    </section>
  );
}

function SummaryStat({
  colorClass,
  label,
  value,
}: {
  colorClass: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-5">
      <p className={`text-4xl font-bold ${colorClass}`}>{value}</p>
      <p className="mt-1 font-medium text-[var(--app-text-muted)]">{label}</p>
    </div>
  );
}

function EmptyCardExercise({
  moduleId,
  moduleTitle,
}: {
  moduleId: string;
  moduleTitle: string;
}) {
  return (
    <div className="mobile-study-page page-container px-4 py-8 sm:px-6">
      <section className="mx-auto max-w-2xl rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <CardsIcon />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-[var(--app-text-strong)]">
          В модуле пока нет терминов
        </h1>
        <p className="mt-2 text-[var(--app-text-muted)]">
          Добавьте карточки в «{moduleTitle}», чтобы начать упражнение card.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/module/${moduleId}/edit`} className="btn btn-primary">
            Добавить термины
          </Link>
          <Link href={`/module/${moduleId}`} className="btn btn-ghost">
            Вернуться к модулю
          </Link>
        </div>
      </section>
    </div>
  );
}

function InvalidCardSession({ onRestart }: { onRestart: () => void }) {
  return (
    <section className="rounded-2xl border border-error/40 bg-[var(--app-panel)] p-6 text-center">
      <h2 className="text-2xl font-bold text-[var(--app-text-strong)]">
        Не удалось продолжить упражнение
      </h2>
      <p className="mt-2 text-[var(--app-text-muted)]">
        Начните новую попытку, чтобы восстановить порядок карточек.
      </p>
      <button type="button" className="btn btn-primary mt-6" onClick={onRestart}>
        Начать заново
      </button>
    </section>
  );
}

type PronunciationStatus = "idle" | "loading" | "ready" | "error";

interface CardPronunciationController {
  status: PronunciationStatus;
  message: string | null;
  play: () => void;
}

function useCardPronunciation(term: Term | null): CardPronunciationController {
  return usePronunciation(term?.term ?? "", { promptKey: term?.id });
}

export function getCardHint(term: Term) {
  const definition = term.definition.trim();
  const normalizedTerm = term.term.trim();

  if (!definition || !normalizedTerm) {
    return definition;
  }

  const maskedDefinition = definition.replace(
    new RegExp(escapeRegExp(normalizedTerm), "gi"),
    "_".repeat(Math.max(4, normalizedTerm.length)),
  );

  return maskedDefinition.length > 150
    ? `${maskedDefinition.slice(0, 147).trimEnd()}…`
    : maskedDefinition;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function BackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function HintIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.674M12 3a6 6 0 00-3.536 10.85c.724.528 1.036 1.152 1.036 1.65h5c0-.498.312-1.122 1.036-1.65A6 6 0 0012 3z" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2zM6 11h.01M10 11h.01M14 11h.01M18 11h.01M7 14h10" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ large = false }: { large?: boolean }) {
  return (
    <svg className={large ? "h-9 w-9" : "h-7 w-7"} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="m5 12 4 4L19 6" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10H5V6m0 4 3.5-3.5A7 7 0 112 12" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m16 3 4 4-4 4M4 7h3c3.5 0 4.5 10 8 10h5M16 13l4 4-4 4M4 17h3c1.2 0 2.1-1.2 3-2.8" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}
