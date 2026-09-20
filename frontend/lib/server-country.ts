import "server-only";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { headers } from "next/headers";
import { getCountryDatabase } from "./geoip-database.mjs";

export async function shouldShowGoogleAuth(): Promise<boolean> {
  // Only trust the header overwritten by our directly exposed Nginx proxy.
  // Reading request headers also keeps the auth pages dynamically rendered.
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-real-ip")?.trim();
  if (!ip || !isIP(ip)) return true;

  const address = ipaddr.process(ip);
  if (address.range() !== "unicast") return true;

  try {
    const database = await getCountryDatabase();
    const location = await database?.lookup(address.toString());
    return location?.country !== "RU";
  } catch {
    return true;
  }
}
