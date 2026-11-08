"use client";

import { usePronunciation } from "@/hooks/usePronunciation";
import { useEffect, useRef, useState } from "react";
import type { DictionaryLookupResult } from "@/lib/api";
import { getCachedDictionary } from "@/lib/pronunciation-cache";
import type { PronunciationVariant } from "@/lib/pronunciation-settings";

interface PronunciationButtonProps {
  term: string;
  className?: string;
  showTranscription?: boolean;
}
export default function PronunciationButton({
  term,
  showTranscription = false,
  className = "btn btn-ghost btn-sm gap-1 px-2 text-neutral-content hover:text-[var(--app-text-strong)]",
}: PronunciationButtonProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [transcription, setTranscription] = useState<{
    term: string;
    ipa: DictionaryLookupResult["ipa"];
  } | null>(null);

  useEffect(() => {
    setTranscription(null);
    if (!showTranscription || !term.trim()) return;

    let active = true;
    let started = false;
    const load = async () => {
      if (started || !active) return;
      started = true;
      try {
        const result = await getCachedDictionary(term);
        if (active) setTranscription({ term, ipa: result.ipa });
      } catch {
        // Transcription is optional; audio controls remain available.
      }
    };

    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            void load();
          }
        }, { rootMargin: "200px" });
    if (observer && groupRef.current) observer.observe(groupRef.current);
    else void load();

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [term, showTranscription]);

  const ipa = showTranscription && transcription?.term === term
    ? transcription.ipa
    : undefined;

  return (
    <div
      ref={groupRef}
      className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1"
      role="group"
      aria-label={`Произношение: ${term}`}
    >
      {(["uk", "us"] as const).map((variant) => (
        <AccentButton
          key={variant}
          term={term}
          variant={variant}
          className={className}
          transcription={formatTranscription(ipa?.[variant])}
        />
      ))}
    </div>
  );
}

function formatTranscription(value?: string) {
  const ipa = value?.replace(/^[\/\s]+|[\/\s]+$/g, "");
  return ipa ? `/${ipa}/` : undefined;
}

function AccentButton({
  term,
  variant,
  className,
  transcription,
}: PronunciationButtonProps & {
  variant: PronunciationVariant;
  transcription?: string;
}) {
  const speech = usePronunciation(term, { mode: "exact", variant });
  const label = variant.toUpperCase();
  return (
    <span className="flex min-w-0 max-w-full items-center gap-1">
      {transcription && (
        <>
          <span className="shrink-0 text-sm font-semibold text-neutral-content">{label}</span>
          <span
            className="min-w-0 text-sm text-neutral-content [overflow-wrap:anywhere]"
            aria-label={`${label} транскрипция`}
          >
            {transcription}
          </span>
        </>
      )}
      <button
        type="button"
        className={
          `${speech.status === "error"
            ? "btn btn-ghost btn-sm gap-1 px-2 text-error"
            : className} shrink-0`
        }
        onClick={speech.play}
        disabled={speech.status === "loading"}
        title={speech.message ?? `Воспроизвести ${label} произношение`}
        aria-label={`Воспроизвести ${label} произношение: ${term}`}
      >
        {!transcription && <span className="font-semibold">{label}</span>}
        {speech.status === "loading" ? (
          <span
            className="loading loading-spinner loading-xs"
            aria-hidden="true"
          />
        ) : (
          <SpeakerIcon />
        )}
      </button>
      {speech.message && (
        <span role="status" className="sr-only">
          {speech.message}
        </span>
      )}
    </span>
  );
}

function SpeakerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
    </svg>
  );
}
