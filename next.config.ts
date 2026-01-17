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

        // Explicitly provide the polyfill path in fallback as well (though alias usually wins)
        util: path.join(process.cwd(), 'lib/polyfills/util.js'),
      };

      // Alias 'util' to the local polyfill
      config.resolve.alias = {
        ...config.resolve.alias,
        util: path.join(process.cwd(), 'lib/polyfills/util.js'),
        'node:util': path.join(process.cwd(), 'lib/polyfills/util.js'),
      };
    }
    return config;
  },
};


export default nextConfig;
