import type { NextConfig } from "next";


const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // webpack: (config, { isServer, nextRuntime }) => {
  //   // Webpack config removed as NextAuth v5 supports Edge Runtime natively
  //   return config;
  // },
};


import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

export default withNextIntl(nextConfig);
