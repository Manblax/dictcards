import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  database: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("./geoip-database.mjs", () => ({ getCountryDatabase: mocks.database }));

import { shouldShowGoogleAuth } from "./server-country";

describe("Google sign-in country visibility", () => {
  beforeEach(() => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.database.mockReset().mockResolvedValue({ lookup: mocks.lookup });
    mocks.lookup.mockReset().mockResolvedValue(null);
  });

  it.each([
    ["77.88.8.8", "RU", false],
    ["2a02:6b8::feed:0ff", "RU", false],
    ["8.8.8.8", "US", true],
    ["2001:4860:4860::8888", "US", true],
    ["::ffff:77.88.8.8", "RU", false],
  ])("resolves %s (%s)", async (ip, country, visible) => {
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": ip }));
    mocks.lookup.mockResolvedValue({ country });
    await expect(shouldShowGoogleAuth()).resolves.toBe(visible);
    expect(mocks.lookup).toHaveBeenCalledWith(ip.replace("::ffff:", "").replace(":0ff", ":ff"));
  });

  it.each([
    "", "invalid", "77.88.8.8, 8.8.8.8", "77.88.8.8:443",
    "127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.1.1",
    "169.254.1.1", "100.64.0.1", "::1", "fc00::1", "fe80::1",
    "::ffff:192.168.1.1", "192.0.2.1",
  ])("shows Google without looking up non-public input %s", async (ip) => {
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": ip }));
    await expect(shouldShowGoogleAuth()).resolves.toBe(true);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it("ignores language, country, and forwarded-IP headers", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      "x-forwarded-for": "77.88.8.8",
      "cf-ipcountry": "RU",
      "accept-language": "ru-RU",
    }));
    await expect(shouldShowGoogleAuth()).resolves.toBe(true);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it("uses X-Real-IP even when other headers disagree", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      "x-real-ip": "77.88.8.8", "x-forwarded-for": "8.8.8.8", "cf-ipcountry": "US",
    }));
    mocks.lookup.mockResolvedValue({ country: "RU" });
    await expect(shouldShowGoogleAuth()).resolves.toBe(false);
  });

  it("shows Google for unknown addresses and unavailable databases", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "8.8.8.8" }));
    await expect(shouldShowGoogleAuth()).resolves.toBe(true);
    mocks.database.mockResolvedValue(undefined);
    await expect(shouldShowGoogleAuth()).resolves.toBe(true);
    mocks.database.mockRejectedValue(new Error("Database unavailable"));
    await expect(shouldShowGoogleAuth()).resolves.toBe(true);
  });

  it("shows Google when a lookup throws", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "8.8.8.8" }));
    mocks.lookup.mockRejectedValue(new Error("Lookup failed"));
    await expect(shouldShowGoogleAuth()).resolves.toBe(true);
  });
});
