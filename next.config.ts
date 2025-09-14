import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep default config; server code can read process.env directly
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com", pathname: "/coins/images/**" },
      { protocol: "https", hostname: "coin-images.coingecko.com", pathname: "/coins/images/**" },
    ],
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
