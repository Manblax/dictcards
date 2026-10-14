import { describe, expect, it, vi } from "vitest";

import { DICTIONARY_SOURCE_SETTING_KEY } from "./dictionary-settings";
import {
  createModule,
  deleteModule,
  getGoogleAuthUrl,
  getYandexAuthUrl,
  getModule,
  getModules,
  getPublicApiUrl,
  login,
  lookupDictionary,
  register,
  synthesizeSpeech,
  updateModule,
  uploadFile,
} from "./api";

describe("api utilities", () => {
  it("builds public API URLs", () => {
    expect(getPublicApiUrl()).toBe("http://localhost:3001");
    expect(getPublicApiUrl("/auth/login")).toBe(
      "http://localhost:3001/auth/login",
    );
    expect(getGoogleAuthUrl()).toBe("http://localhost:3001/auth/google");
    expect(getYandexAuthUrl()).toBe("http://localhost:3001/auth/yandex");
  });

  it("does not request modules when there is no auth token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getModules()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests modules with bearer auth when a token is stored", async () => {
    localStorage.setItem("token", "stored-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "module-1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getModules(20, 10)).resolves.toEqual([{ id: "module-1" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3001/dictcards?skip=20&take=10");
    expect(init.headers.get("Authorization")).toBe("Bearer stored-token");
  });

  it("encodes title searches and keeps pagination and authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    await getModules(20, 20, { token: "search-token", query: "  Урок & Test  " });

    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.get("q")).toBe("Урок & Test");
    expect(params.get("skip")).toBe("20");
    expect(params.get("take")).toBe("20");
    expect(init.headers.get("Authorization")).toBe("Bearer search-token");
  });

  it("returns an empty module list for unauthorized responses", async () => {
    localStorage.setItem("token", "stored-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    await expect(getModules()).resolves.toEqual([]);
  });

  it("returns null for a module request without auth", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getModule("module-1")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when a module cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    await expect(
      getModule("missing", { token: "token-1" }),
    ).resolves.toBeNull();
  });

  it("creates, updates, and deletes modules with explicit auth tokens", async () => {
    const moduleResponse = {
      id: "module-1",
      title: "Phrasal verbs",
      termCount: 2,
      author: "demo",
      createdAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(moduleResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...moduleResponse, title: "Updated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createModule({ title: "Phrasal verbs" }, { token: "token-1" }),
    ).resolves.toEqual(moduleResponse);
    await expect(
      updateModule("module-1", { title: "Updated" }, { token: "token-1" }),
    ).resolves.toMatchObject({ title: "Updated" });
    await expect(
      deleteModule("module-1", { token: "token-1" }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3001/dictcards");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ title: "Phrasal verbs" }),
    });
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe(
      "Bearer token-1",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:3001/dictcards/module-1",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "DELETE" });
  });

  it("throws when write operations fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    await expect(createModule({ title: "Broken" })).rejects.toThrow(
      "Failed to create module",
    );
    await expect(updateModule("module-1", {})).rejects.toThrow(
      "Failed to update module",
    );
    await expect(deleteModule("module-1")).rejects.toThrow(
      "Failed to delete module",
    );
  });

  it("looks up dictionary entries with the stored source preference", async () => {
    localStorage.setItem("token", "stored-token");
    localStorage.setItem(DICTIONARY_SOURCE_SETTING_KEY, "oxford");
    const lookupResult = {
      word: "run",
      normalizedWord: "run",
      suggestedDefinition: null,
      definitions: [],
      ipa: {},
      audio: {},
      sources: {},
      cached: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(lookupResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupDictionary("run")).resolves.toEqual(lookupResult);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://localhost:3001/dictionary/lookup?word=run&source=oxford",
    );
    expect(init.headers.get("Authorization")).toBe("Bearer stored-token");
  });

  it("uploads a file as form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "/uploads/image.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "image.png", { type: "image/png" });

    await expect(uploadFile(file, { token: "token-1" })).resolves.toEqual({
      url: "/uploads/image.png",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3001/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers.get("Authorization")).toBe("Bearer token-1");
  });

  it("uses backend error messages for auth failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Email already exists" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Invalid credentials" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(register({ email: "demo@example.com" })).rejects.toThrow(
      "Email already exists",
    );
    await expect(login({ username: "demo" })).rejects.toThrow(
      "Invalid credentials",
    );
  });
  it("fetches TTS as a blob with bearer authentication", async () => {
    localStorage.setItem("token", "stored-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("mp3", { headers: { "Content-Type": "audio/mpeg" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const blob = await synthesizeSpeech("hello", "us");
    expect(blob.type).toBe("audio/mpeg");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3001/tts");
    expect(init.method).toBe("POST");
    expect(init.headers.get("Authorization")).toBe("Bearer stored-token");
    expect(JSON.parse(init.body)).toEqual({ text: "hello", variant: "us" });
  });

  it.each([401, 403, 429, 502])(
    "preserves TTS HTTP failure status %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      await expect(synthesizeSpeech("hello", "uk")).rejects.toMatchObject({
        status,
      });
    },
  );
});
