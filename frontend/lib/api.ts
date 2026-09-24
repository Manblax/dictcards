import type { Module } from "@/types/module";
import { getDictionarySourcePreference } from "@/lib/dictionary-settings";

const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || PUBLIC_API_URL;

export const API_URL = PUBLIC_API_URL;

export interface DictionaryDefinition {
  text: string;
  partOfSpeech?: string;
  guideWord?: string;
  cefr?: string;
  examples: string[];
  source: "cambridge" | "oxford";
}

export interface DictionaryLookupResult {
  word: string;
  normalizedWord: string;
  suggestedDefinition: string | null;
  definitions: DictionaryDefinition[];
  ipa: {
    uk?: string;
    us?: string;
  };
  audio: {
    uk?: string;
    us?: string;
  };
  sources: {
    definitions?: "cambridge" | "oxford";
    ipa?: "cambridge" | "oxford";
    audio?: "cambridge" | "oxford";
  };
  cached: boolean;
}

function getApiBaseUrl() {
  return typeof window === "undefined" ? INTERNAL_API_URL : PUBLIC_API_URL;
}

function buildApiUrl(path: string, baseUrl = getApiBaseUrl()) {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

export function getPublicApiUrl(path = "") {
  return path ? buildApiUrl(path, PUBLIC_API_URL) : PUBLIC_API_URL;
}

interface RequestOptions {
  token?: string | null;
}

function resolveAuthToken(token?: string | null) {
  return token ?? getClientToken();
}

function getClientToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("token");
}

function withAuthHeaders(headers?: HeadersInit, token?: string | null) {
  const finalHeaders = new Headers(headers);
  const authToken = resolveAuthToken(token);

  if (authToken) {
    finalHeaders.set("Authorization", `Bearer ${authToken}`);
  }

  return finalHeaders;
}

async function apiFetch(path: string, init: RequestInit = {}, token?: string | null) {
  return fetch(buildApiUrl(path), {
    ...init,
    headers: withAuthHeaders(init.headers, token),
  });
}

export function getGoogleAuthUrl() {
  return getPublicApiUrl("/auth/google");
}

export function getYandexAuthUrl() {
  return getPublicApiUrl("/auth/yandex");
}

export async function getModules(
  skip = 0,
  take = 20,
  options: RequestOptions = {},
): Promise<Module[]> {
  const authToken = resolveAuthToken(options.token);

  if (!authToken) {
    return [];
  }

  const res = await apiFetch(`/flashcards?skip=${skip}&take=${take}`, {
    cache: "no-store",
  }, authToken);
  
  if (res.status === 401 || res.status === 403) {
    return [];
  }

  if (!res.ok) {
    throw new Error("Failed to fetch modules");
  }
  
  return res.json();
}

export async function getModule(
  id: string,
  options: RequestOptions = {},
): Promise<Module | null> {
  const authToken = resolveAuthToken(options.token);

  if (!authToken) {
    return null;
  }

  const res = await apiFetch(`/flashcards/${id}`, {
    cache: "no-store",
  }, authToken);
  
  if (!res.ok) {
    return null;
  }
  
  return res.json();
}

export async function createModule(
  data: any,
  options: RequestOptions = {},
): Promise<Module> {
  const res = await apiFetch("/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }, options.token);
  
  if (!res.ok) {
    throw new Error("Failed to create module");
  }
  
  return res.json();
}

export async function updateModule(
  id: string,
  data: any,
  options: RequestOptions = {},
): Promise<Module> {
  const res = await apiFetch(`/flashcards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }, options.token);
  
  if (!res.ok) {
    throw new Error("Failed to update module");
  }
  
  return res.json();
}

export async function deleteModule(id: string, options: RequestOptions = {}) {
  const res = await apiFetch(`/flashcards/${id}`, {
    method: "DELETE",
  }, options.token);
  
  if (!res.ok) {
    throw new Error("Failed to delete module");
  }
  
  return res.json();
}

export async function lookupDictionary(
  word: string,
  options: RequestOptions = {},
): Promise<DictionaryLookupResult> {
  const source = getDictionarySourcePreference();
  const query = new URLSearchParams({
    word,
    source,
  });
  const res = await apiFetch(
    `/dictionary/lookup?${query.toString()}`,
    {
      cache: "no-store",
    },
    options.token,
  );

  if (!res.ok) {
    throw new AudioRequestError(res.status, "Failed to lookup dictionary word");
  }

  return res.json();
}

export async function uploadFile(file: File, options: RequestOptions = {}) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/upload", {
    method: "POST",
    body: formData,
  }, options.token);

  if (!res.ok) {
    throw new Error("Failed to upload file");
  }

  return res.json();
}

export async function register(data: any) {
  const res = await fetch(getPublicApiUrl("/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Registration failed");
  }
  
  return res.json();
}

export async function login(data: any) {
  const res = await fetch(getPublicApiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Login failed");
  }
  
  return res.json();
}

export class AudioRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function synthesizeSpeech(text: string, variant: "uk" | "us"): Promise<Blob> {
  const res = await apiFetch("/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, variant }),
  });
  if (!res.ok) throw new AudioRequestError(res.status, "Speech unavailable");
  return res.blob();
}
