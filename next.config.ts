import type { NextConfig } from "next";

import path from 'path';

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
        http: false,
        https: false,
        querystring: false,
        url: false,
        zlib: false,
        net: false,
        tls: false,
        fs: false,
        child_process: false,
        os: false,
        path: false,
      };

      // Alias 'util' to the installed package
      config.resolve.alias = {
        ...config.resolve.alias,
        util: require.resolve('util/'),
      };
    }
    return config;
  },
};


export default nextConfig;
