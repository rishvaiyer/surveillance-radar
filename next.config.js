/** @type {import('next').NextConfig} */

// When building for GitHub Pages the app is served from a subpath
// (e.g. /unevil/surveillance-radar). NEXT_PUBLIC_BASE_PATH is set by the
// Pages workflow; locally it's empty so the app runs at the root.
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath: base || undefined,
  assetPrefix: base || undefined,
  images: { unoptimized: true },
  // Lint is run separately; don't fail production builds on lint.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
