import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // Fix for NextAuth v4 on Cloudflare Pages (Edge Runtime)
    if (!isServer || nextRuntime === 'edge') {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        stream: false,
      };
    }
    return config;
  },
};

export default nextConfig;
