"use client";

import { getPublicApiUrl, lookupDictionary, synthesizeSpeech, type DictionaryLookupResult } from "./api";
import { AUTH_STATE_CHANGE_EVENT, getStoredUser } from "./auth";
import { getDictionarySourcePreference, type DictionarySourcePreference } from "./dictionary-settings";
import type { PronunciationVariant } from "./pronunciation-settings";

export interface CachedAudio {
  url: string;
  invalidate: () => void;
}

const dictionaries = new Map<string, Promise<DictionaryLookupResult>>();
const audio = new Map<string, Promise<CachedAudio>>();
const urls = new Set<string>();
const resetListeners = new Set<() => void>();
let generation = 0;
let listening = false;
let account: string | null = null;

function currentAccount() {
  const token = localStorage.getItem("token");
  return token ? getStoredUser()?.id ?? token : null;
}

function syncAccount() {
  const next = currentAccount();
  if (next !== account || next === null) clearPronunciationCache();
  account = next;
}

function ensureBrowserCache() {
  if (typeof window === "undefined") {
    throw new Error("Pronunciation caching is only available in the browser");
  }
  if (!listening) {
    account = currentAccount();
    window.addEventListener(AUTH_STATE_CHANGE_EVENT, syncAccount);
    window.addEventListener("storage", (event) => {
      if (event.storageArea === localStorage &&
          (event.key === null || event.key === "token" || event.key === "user")) {
        syncAccount();
      }
    });
    listening = true;
  } else if (currentAccount() !== account) {
    syncAccount();
  }
}

// Cache lifetime belongs to the tab/account, never to an individual player.
export function clearPronunciationCache() {
  generation++;
  dictionaries.clear();
  audio.clear();
  resetListeners.forEach((listener) => listener());
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
}

export function onPronunciationCacheReset(listener: () => void) {
  resetListeners.add(listener);
  return () => { resetListeners.delete(listener); };
}

function getOrLoad<T, Result>(
  cache: Map<string, Promise<Result>>,
  key: string,
  load: () => Promise<T>,
  prepare: (value: T, request: Promise<Result>) => Result,
): Promise<Result> {
  ensureBrowserCache();
  const existing = cache.get(key);
  if (existing) return existing;
  const started = generation;
  const request: Promise<Result> = Promise.resolve().then(() => {
    if (started !== generation) throw new DOMException("Cache cleared", "AbortError");
    return load();
  }).then((value) => {
    if (started !== generation) throw new DOMException("Cache cleared", "AbortError");
    return prepare(value, request);
  });
  cache.set(key, request);
  void request.catch(() => {
    // An old rejection must not remove a newer request after a reset.
    if (cache.get(key) === request) cache.delete(key);
  });
  return request;
}

export function getCachedDictionary(
  word: string,
  source: DictionarySourcePreference = getDictionarySourcePreference(),
) {
  const normalizedWord = word.trim().toLowerCase().replace(/\s+/g, " ");
  return getOrLoad(
    dictionaries,
    JSON.stringify([normalizedWord, source]),
    () => lookupDictionary(normalizedWord, { source }),
    (result) => result,
  );
}

function getAudio(key: string, load: () => Promise<Blob>) {
  return getOrLoad(audio, key, load, (blob, request) => {
    if (!blob.size) throw new Error("Empty audio response");
    const url = URL.createObjectURL(blob);
    urls.add(url);
    return {
      url,
      invalidate: () => {
        if (audio.get(key) === request) audio.delete(key);
        if (urls.delete(url)) URL.revokeObjectURL(url);
      },
    };
  });
}

export function getCachedDictionaryAudio(path: string) {
  const url = getPublicApiUrl(path);
  return getAudio(JSON.stringify(["dictionary", url]), async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Audio download failed");
    return response.blob();
  });
}

export function getCachedSpeech(text: string, variant: PronunciationVariant) {
  const trimmed = text.trim();
  return getAudio(JSON.stringify(["speech", trimmed, variant]), () => synthesizeSpeech(trimmed, variant));
}
