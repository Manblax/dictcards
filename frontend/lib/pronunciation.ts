import { getDictionarySourcePreference } from "./dictionary-settings";
import {
  getCachedDictionary,
  getCachedDictionaryAudio,
  getCachedSpeech,
  onPronunciationCacheReset,
  type CachedAudio,
} from "./pronunciation-cache";
import {
  getAlternatePronunciationVariant,
  type PronunciationVariant,
} from "./pronunciation-settings";

export type PronunciationMode = "dictionary" | "exact" | "speech";
type Clip = { url: string; variant: PronunciationVariant };
export function isAuthenticationError(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return status === 401 || status === 403;
}
export function isAutoplayError(error: unknown) {
  return (error as { name?: string } | null)?.name === "NotAllowedError";
}

// A session owns playback only. Downloaded audio belongs to the shared cache.
export class PronunciationSession {
  private static active: PronunciationSession | null = null;
  private audio: HTMLAudioElement | null = null;
  private generation = 0;
  private unsubscribe = onPronunciationCacheReset(() => this.stop());

  stop() {
    this.generation++;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
  }

  dispose() {
    this.stop();
    if (PronunciationSession.active === this)
      PronunciationSession.active = null;
    this.unsubscribe();
  }

  async play(
    text: string,
    variant: PronunciationVariant,
    mode: PronunciationMode,
  ): Promise<PronunciationVariant | null> {
    PronunciationSession.active?.stop();
    PronunciationSession.active = this;
    this.stop();
    const generation = this.generation;
    const current = () => generation === this.generation;
    const word = text.trim();
    if (!word) throw new Error("Empty text");
    const source = getDictionarySourcePreference();
    let candidates: Clip[] = [];
    if (mode !== "speech") {
      try {
        const result = await getCachedDictionary(word, source);
        const variants = mode === "exact"
          ? [variant]
          : [variant, getAlternatePronunciationVariant(variant)];
        candidates = variants.flatMap((accent) => result.audio[accent]
          ? [{ url: result.audio[accent], variant: accent }]
          : []);
      } catch (error) {
        if (!current()) return null;
        if (isAuthenticationError(error)) throw error;
      }
    }
    for (const clip of candidates) {
      if (!current()) return null;
      let cached: CachedAudio | undefined;
      try {
        cached = await getCachedDictionaryAudio(clip.url);
        if (!current()) return null;
        await this.playClip(cached.url);
        return current() ? clip.variant : null;
      } catch (error) {
        if (!current()) return null;
        if (isAutoplayError(error)) throw error;
        cached?.invalidate();
      }
    }
    if (!current()) return null;
    let speech: CachedAudio | undefined;
    try {
      speech = await getCachedSpeech(word, variant);
      if (!current()) return null;
      await this.playClip(speech.url);
    } catch (error) {
      if (!current()) return null;
      if (!isAutoplayError(error)) speech?.invalidate();
      throw error;
    }
    return current() ? variant : null;
  }

  private async playClip(url: string) {
    if (this.audio) this.audio.pause();
    const audio = new Audio(url);
    this.audio = audio;
    // play() rejects for download/decode errors and browser autoplay denial.
    await audio.play();
  }
}
