import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthSession, persistAuthSession } from "./auth";
import { DICTIONARY_SOURCE_SETTING_KEY } from "./dictionary-settings";
import {
  clearPronunciationCache,
  getCachedDictionary,
  getCachedDictionaryAudio,
  getCachedSpeech,
} from "./pronunciation-cache";

const user = { id: "one", username: "one", email: "one@example.com" };
const entry = { ipa: { uk: "/wɜːk/" }, audio: { uk: "/dictionary/audio/work" } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("tab pronunciation cache", () => {
  beforeEach(() => {
    clearPronunciationCache();
    persistAuthSession("token-one", user);
    let id = 0;
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => `blob:clip-${++id}`);
      static revokeObjectURL = vi.fn();
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/dictionary/lookup")
      ? Response.json(entry)
      : new Response("audio", { headers: { "Content-Type": "audio/mpeg" } })));
  });
  afterEach(() => clearPronunciationCache());

  it("deduplicates normalized lookups and captures the source before starting the request", async () => {
    const first = getCachedDictionary("  Carry   ON ");
    const second = getCachedDictionary("carry on");
    expect(first).toBe(second);
    localStorage.setItem(DICTIONARY_SOURCE_SETTING_KEY, "oxford");
    expect(await first).toEqual(entry);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("source=cambridge");
    await getCachedDictionary("carry on");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain("source=oxford");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("deduplicates pending downloads by absolute audio URL", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const first = getCachedDictionaryAudio("/dictionary/audio/work");
    const second = getCachedDictionaryAudio("http://localhost:3001/dictionary/audio/work");
    expect(first).toBe(second);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    pending.resolve(new Response("audio"));
    const clip = await first;
    expect(await getCachedDictionaryAudio("/dictionary/audio/work")).toBe(clip);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("shares TTS across dictionary preferences but preserves accent and text case", async () => {
    const first = getCachedSpeech(" Work ", "uk");
    expect(getCachedSpeech("Work", "uk")).toBe(first);
    await first;
    localStorage.setItem(DICTIONARY_SOURCE_SETTING_KEY, "oxford");
    expect(await getCachedSpeech("Work", "uk")).toBe(await first);
    await getCachedSpeech("Work", "us");
    await getCachedSpeech("work", "uk");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string))).toEqual([
      { text: "Work", variant: "uk" }, { text: "Work", variant: "us" }, { text: "work", variant: "uk" },
    ]);
  });

  it("retries failed lookups and downloads, including empty audio", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 502 }));
    await expect(getCachedDictionary("work")).rejects.toThrow();
    await expect(getCachedDictionary("work")).resolves.toEqual(entry);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 502 }));
    await expect(getCachedDictionaryAudio("/work")).rejects.toThrow();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(""));
    await expect(getCachedDictionaryAudio("/work")).rejects.toThrow("Empty audio");
    await getCachedDictionaryAudio("/work");
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("keeps entries on same-account token refresh and clears them on account change and logout", async () => {
    const first = await getCachedSpeech("work", "uk");
    persistAuthSession("refreshed-token", user);
    expect(await getCachedSpeech("work", "uk")).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    persistAuthSession("token-two", { ...user, id: "two" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first.url);
    const second = await getCachedSpeech("work", "uk");
    expect(second.url).not.toBe(first.url);
    clearAuthSession();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(second.url);
    persistAuthSession("token-two", { ...user, id: "two" });
    await getCachedSpeech("work", "uk");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("clears audio when another tab logs out", async () => {
    const clip = await getCachedSpeech("work", "uk");
    localStorage.removeItem("token");
    window.dispatchEvent(new StorageEvent("storage", { key: "token", storageArea: localStorage }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(clip.url);
  });

  it("rejects late dictionary and audio responses after logout without replacing newer entries", async () => {
    const dictionary = deferred<Response>();
    const recording = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(dictionary.promise).mockReturnValueOnce(recording.promise);
    const pending = Promise.allSettled([getCachedDictionary("work"), getCachedSpeech("work", "uk")]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    clearAuthSession();
    persistAuthSession("new-token", { ...user, id: "two" });
    const newEntry = await getCachedDictionary("work");
    const newClip = await getCachedSpeech("work", "uk");
    dictionary.resolve(Response.json(entry));
    recording.resolve(new Response("old audio"));
    expect(await pending).toEqual([
      { status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) },
      { status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) },
    ]);
    expect(await getCachedDictionary("work")).toBe(newEntry);
    expect(await getCachedSpeech("work", "uk")).toBe(newClip);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("does not start queued requests after reset", async () => {
    const pending = getCachedSpeech("work", "uk");
    clearPronunciationCache();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("releases invalid clips once and leaves replacement clips intact", async () => {
    const first = await getCachedDictionaryAudio("/work");
    first.invalidate();
    const second = await getCachedDictionaryAudio("/work");
    first.invalidate();
    expect(await getCachedDictionaryAudio("/work")).toBe(second);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(first.url);
  });

  it("does not store data during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(() => getCachedDictionary("work")).toThrow("only available in the browser");
    expect(fetch).not.toHaveBeenCalled();
  });
});
