import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), reload: vi.fn(), updateDb: vi.fn() }));
vi.mock("node:fs/promises", () => ({ access: mocks.access, default: { access: mocks.access } }));
vi.mock("ip-location-api", () => ({ reload: mocks.reload, updateDb: mocks.updateDb }));

describe("country database initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.access.mockReset().mockResolvedValue(undefined);
    mocks.reload.mockReset().mockResolvedValue(undefined);
    mocks.updateDb.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("loads once for concurrent requests and configures background refresh", async () => {
    const { getCountryDatabase } = await import("./geoip-database.mjs");
    const [first, second] = await Promise.all([getCountryDatabase(), getCountryDatabase()]);
    expect(first).toBe(second);
    expect(mocks.access).toHaveBeenCalledTimes(6);
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(mocks.reload).toHaveBeenCalledWith(expect.objectContaining({
      ipLocationDb: "user", fields: ["country"], smallMemory: false,
      autoUpdate: "0 0 3 * * 3,6",
    }));
    expect(process.env.ILA_SKIP_INITIAL_RELOAD).toBe("true");
    expect(mocks.updateDb).not.toHaveBeenCalled();
  });

  it("does not bootstrap a missing database on requests and retries after a minute", async () => {
    vi.useFakeTimers();
    mocks.access.mockRejectedValue(new Error("Missing file"));
    const { getCountryDatabase } = await import("./geoip-database.mjs");
    await expect(getCountryDatabase()).rejects.toThrow("Missing file");
    await expect(getCountryDatabase()).resolves.toBeUndefined();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.updateDb).not.toHaveBeenCalled();

    mocks.access.mockResolvedValue(undefined);
    vi.advanceTimersByTime(60_000);
    await expect(getCountryDatabase()).resolves.toBeDefined();
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("reports unreadable data without making requests wait on repeated reloads", async () => {
    mocks.reload.mockRejectedValue(new Error("Corrupt data"));
    const { getCountryDatabase } = await import("./geoip-database.mjs");
    await expect(getCountryDatabase()).rejects.toThrow("Corrupt data");
    await expect(getCountryDatabase()).resolves.toBeUndefined();
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
