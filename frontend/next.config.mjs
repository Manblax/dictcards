/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep browser-test/build output separate from a running local dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["ip-location-api"],
};

export default nextConfig;
