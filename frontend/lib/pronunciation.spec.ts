import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  lookupDictionary,
  synthesizeSpeech,
  type DictionaryLookupResult,
} from "./api";
import { PronunciationSession } from "./pronunciation";
import { clearPronunciationCache } from "./pronunciation-cache";
import { clearAuthSession } from "./auth";
import { DICTIONARY_SOURCE_SETTING_KEY } from "./dictionary-settings";

vi.mock("./api", () => ({
  lookupDictionary: vi.fn(),
  synthesizeSpeech: vi.fn(),
  getPublicApiUrl: (url: string) => url,
}));

function definitionWithoutAudio(
  source: "cambridge" | "oxford",
): DictionaryLookupResult {
  const text = "a round fruit with a red or green skin";
  return {
    word: "apple",
    normalizedWord: "apple",
    suggestedDefinition: text,
    definitions: [{ text, examples: [], source }],
    ipa: {},
    audio: {},
    sources: { definitions: source },
    cached: true,
  };
}

describe("PronunciationSession", () => {
  let session: PronunciationSession;
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  let created: string[];
  beforeEach(() => {
    vi.mocked(lookupDictionary)
      .mockReset()
      .mockResolvedValue({ audio: { uk: "/uk", us: "/us" } } as any);
    vi.mocked(synthesizeSpeech)
      .mockReset()
      .mockResolvedValue(new Blob(["mp3"]));
    clearPronunciationCache();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response("mp3", { headers: { "Content-Type": `audio${url}` } })));
    created = [];
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    vi.stubGlobal(
      "Audio",
      vi.fn(function (this: any, url: string) {
        created.push(url);
        this.play = play;
        this.pause = pause;
      }),
    );
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn((blob: Blob) => blob.type ? `blob:${blob.type.replace(/^audio/, "")}` : "blob:tts");
        static revokeObjectURL = vi.fn();
      },
    );
    session = new PronunciationSession();
  });
  afterEach(() => { session.dispose(); clearPronunciationCache(); });

  describe.each(["cambridge", "oxford"] as const)(
    "%s definitions without audio",
    (source) => {
      it.each(["uk", "us"] as const)(
        "uses Google for the term in the %s accent and preserves definitions",
        async (variant) => {
          const result = definitionWithoutAudio(source);
          const original = structuredClone(result);
          localStorage.setItem(DICTIONARY_SOURCE_SETTING_KEY, source);
          vi.mocked(lookupDictionary).mockResolvedValue(result);

          expect(await session.play("apple", variant, "dictionary")).toBe(
            variant,
          );

          expect(lookupDictionary).toHaveBeenCalledWith("apple", { source });
          expect(synthesizeSpeech).toHaveBeenCalledExactlyOnceWith(
            "apple",
            variant,
          );
          expect(created).toEqual(["blob:tts"]);
          expect(result).toEqual(original);
        },
      );

      it("preserves definitions when Google fails", async () => {
        const result = definitionWithoutAudio(source);
        const original = structuredClone(result);
        vi.mocked(lookupDictionary).mockResolvedValue(result);
        vi.mocked(synthesizeSpeech).mockRejectedValue(
          new Error("Google unavailable"),
        );

        await expect(session.play("apple", "uk", "dictionary")).rejects.toThrow(
          "Google unavailable",
        );

        expect(synthesizeSpeech).toHaveBeenCalledWith("apple", "uk");
        expect(created).toEqual([]);
        expect(result).toEqual(original);
      });

      it("still prefers an available alternate dictionary recording", async () => {
        const result = definitionWithoutAudio(source);
        result.audio.uk = "/uk";
        result.sources.audio = source;
        vi.mocked(lookupDictionary).mockResolvedValue(result);

        expect(await session.play("apple", "us", "dictionary")).toBe("uk");

        expect(created).toEqual(["blob:/uk"]);
        expect(synthesizeSpeech).not.toHaveBeenCalled();
        expect(result.definitions[0].source).toBe(source);
      });
    },
  );

  it("plays preferred recording and reuses lookup on replay", async () => {
    await session.play(" apple ", "us", "dictionary");
    await session.play("apple", "us", "dictionary");
    expect(created).toEqual(["blob:/us", "blob:/us"]);
    expect(lookupDictionary).toHaveBeenCalledTimes(1);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("tries alternate recording before generating speech after a failed download", async () => {
    play.mockRejectedValueOnce(
      new DOMException("Download failed", "NotSupportedError"),
    );
    expect(await session.play("apple", "us", "dictionary")).toBe("uk");
    expect(created).toEqual(["blob:/us", "blob:/uk"]);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("generates in preferred accent when all recordings fail", async () => {
    play
      .mockRejectedValueOnce(new Error("download"))
      .mockRejectedValueOnce(new Error("decode"));
    await session.play("apple", "us", "dictionary");
    expect(created).toEqual(["blob:/us", "blob:/uk", "blob:tts"]);
    expect(synthesizeSpeech).toHaveBeenCalledWith("apple", "us");
  });

  it("uses only the explicitly requested accent", async () => {
    vi.mocked(lookupDictionary).mockResolvedValue({
      audio: { uk: "/uk" },
    } as any);
    await session.play("apple", "us", "exact");
    expect(created).toEqual(["blob:tts"]);
    expect(synthesizeSpeech).toHaveBeenCalledWith("apple", "us");
  });

  it("falls back when dictionary service is unavailable", async () => {
    vi.mocked(lookupDictionary).mockRejectedValue(new Error("502"));
    await session.play("apple", "uk", "dictionary");
    expect(synthesizeSpeech).toHaveBeenCalledWith("apple", "uk");
  });

  it.each([401, 403])(
    "does not synthesize after authentication failure %s",
    async (status) => {
      vi.mocked(lookupDictionary).mockRejectedValue({ status });
      await expect(session.play("apple", "uk", "dictionary")).rejects.toEqual({
        status,
      });
      expect(synthesizeSpeech).not.toHaveBeenCalled();
    },
  );

  it("does not fall back on autoplay denial", async () => {
    play.mockRejectedValueOnce(
      new DOMException("Click required", "NotAllowedError"),
    );
    await expect(
      session.play("apple", "uk", "dictionary"),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    await session.play("apple", "uk", "dictionary");
    expect(created).toEqual(["blob:/uk", "blob:/uk"]);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("reuses generated MP3 after autoplay denial, and revokes it on cleanup", async () => {
    play.mockRejectedValueOnce(
      new DOMException("Click required", "NotAllowedError"),
    );
    await expect(
      session.play("definition", "uk", "speech"),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    await session.play("definition", "uk", "speech");
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(lookupDictionary).not.toHaveBeenCalled();
    session.dispose();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    clearPronunciationCache();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:tts");
  });

  it("retries failed synthesis", async () => {
    vi.mocked(synthesizeSpeech).mockRejectedValueOnce(new Error("unavailable"));
    await expect(session.play("definition", "uk", "speech")).rejects.toThrow(
      "unavailable",
    );
    await session.play("definition", "uk", "speech");
    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
  });

  it("discards a lookup that finishes after navigation", async () => {
    let resolve!: (value: any) => void;
    vi.mocked(lookupDictionary).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = session.play("apple", "uk", "dictionary");
    await vi.waitFor(() => expect(lookupDictionary).toHaveBeenCalled());
    session.dispose();
    resolve({ audio: { uk: "/uk" } });
    expect(await pending).toBeNull();
    expect(created).toEqual([]);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("retains synthesis after navigation without starting cancelled playback", async () => {
    let resolve!: (value: Blob) => void;
    vi.mocked(synthesizeSpeech).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = session.play("definition", "uk", "speech");
    await vi.waitFor(() => expect(synthesizeSpeech).toHaveBeenCalled());
    session.dispose();
    resolve(new Blob(["mp3"]));
    expect(await pending).toBeNull();
    expect(created).toEqual([]);
    const next = new PronunciationSession();
    await next.play("definition", "uk", "speech");
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(created).toEqual(["blob:tts"]);
    next.dispose();
  });

  it("shares lookups across accents, separating words and dictionaries", async () => {
    await session.play("apple", "uk", "dictionary");
    await session.play("apple", "us", "dictionary");
    localStorage.setItem(DICTIONARY_SOURCE_SETTING_KEY, "oxford");
    await session.play("apple", "us", "dictionary");
    await session.play("pear", "us", "dictionary");
    expect(lookupDictionary).toHaveBeenCalledTimes(3);
  });

  it("stops playback when another control starts", async () => {
    await session.play("apple", "uk", "dictionary");
    const other = new PronunciationSession();
    await other.play("pear", "us", "dictionary");
    expect(pause).toHaveBeenCalled();
    other.dispose();
  });

  it("reuses recordings across players and modes after navigation", async () => {
    await session.play("apple", "uk", "exact");
    session.dispose();
    const other = new PronunciationSession();
    await other.play("apple", "uk", "dictionary");
    expect(lookupDictionary).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(created).toEqual(["blob:/uk", "blob:/uk"]);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    other.dispose();
  });

  it("shares generated speech between dictionary fallback and speech modes", async () => {
    vi.mocked(lookupDictionary).mockResolvedValue({ audio: {} } as any);
    await session.play("apple", "us", "exact");
    session.dispose();
    localStorage.setItem(DICTIONARY_SOURCE_SETTING_KEY, "oxford");
    const other = new PronunciationSession();
    await other.play("apple", "us", "speech");
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(created).toEqual(["blob:tts", "blob:tts"]);
    other.dispose();
  });

  it("shares a pending download and only plays the most recently requested control", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const first = session.play("apple", "uk", "exact");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const other = new PronunciationSession();
    const second = other.play("apple", "uk", "dictionary");
    resolve(new Response("audio", { headers: { "Content-Type": "audio/uk" } }));
    expect(await first).toBeNull();
    expect(await second).toBe("uk");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(created).toEqual(["blob:/uk"]);
    other.dispose();
  });

  it("retries failed downloads on the next playback", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 502 }));
    await session.play("apple", "uk", "exact");
    expect(created).toEqual(["blob:tts"]);
    await session.play("apple", "uk", "exact");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(created).toEqual(["blob:tts", "blob:/uk"]);
  });

  it("stops active playback and releases audio on logout", async () => {
    await session.play("apple", "uk", "exact");
    pause.mockClear();
    clearAuthSession();
    expect(pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:/uk");
  });

  it("does not play or retain synthesis that completes after logout", async () => {
    let resolve!: (blob: Blob) => void;
    vi.mocked(synthesizeSpeech).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = session.play("apple", "uk", "speech");
    await vi.waitFor(() => expect(synthesizeSpeech).toHaveBeenCalled());
    clearAuthSession();
    resolve(new Blob(["audio"]));
    expect(await pending).toBeNull();
    expect(created).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
