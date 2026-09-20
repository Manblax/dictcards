import { access } from "node:fs/promises";
import path from "node:path";

// Never let importing the library download a database on a page request.
process.env.ILA_SKIP_INITIAL_RELOAD = "true";

export const geoipConfig = {
  fields: ["country"],
  ipLocationDb: "user",
  dataDir: path.resolve(process.env.GEOIP_DATA_DIR || ".geoip/data"),
  tmpDataDir: path.resolve(process.env.GEOIP_TMP_DIR || ".geoip/tmp"),
  smallMemory: false,
  // Wednesday and Saturday at 03:00 UTC, after the first lookup in this process.
  autoUpdate: "0 0 3 * * 3,6",
};

/** @type {Promise<typeof import("ip-location-api")> | undefined} */
let database;
let retryAfter = 0;

export async function getCountryDatabase() {
  if (!database && Date.now() >= retryAfter) {
    database = (async () => {
      // `g` is the library's directory for the country-only field set.
      // Check all files to avoid its automatic bootstrap download if absent.
      await Promise.all(
        ["4-1.dat", "4-2.dat", "4-3.dat", "6-1.dat", "6-2.dat", "6-3.dat"].map(
          (file) => access(path.join(geoipConfig.dataDir, "g", file)),
        ),
      );
      const api = await import("ip-location-api");
      await api.reload(geoipConfig);
      return api;
    })().catch((error) => {
      database = undefined;
      retryAfter = Date.now() + 60_000;
      console.warn("Country database unavailable; showing Google sign-in.", error);
      return Promise.reject(error);
    });
  }

  return database;
}
