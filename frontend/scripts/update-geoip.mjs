import { geoipConfig } from "../lib/geoip-database.mjs";

const api = await import("ip-location-api");
const config = { ...geoipConfig, autoUpdate: false };
api.setupWithoutReload(config);
await api.updateDb(undefined, true);
await api.reload();
if (!api.lookup("8.8.8.8")?.country) {
  throw new Error("Country database verification failed");
}
console.log("Country database is ready.");
