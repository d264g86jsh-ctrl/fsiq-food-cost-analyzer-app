import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright and playwright-core are optional server-side dependencies used only
  // in headless-fetch.ts for website validation. Marking them external prevents
  // webpack from trying to bundle their native .node binaries (e.g. fsevents).
  serverExternalPackages: ['playwright', 'playwright-core'],
};

export default nextConfig;
