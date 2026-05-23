import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const scriptSrc = [
  "script-src 'self'",
  process.env.NODE_ENV === 'production' ? null : "'unsafe-eval'",
  "'unsafe-inline'",
  'https://pagead2.googlesyndication.com',
  'https://www.googletagmanager.com',
].filter(Boolean).join(' ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      scriptSrc,
      "connect-src 'self' https://*.supabase.co https://api.fitbit.com https://www.fitbit.com https://www.amazon.co.jp https://*.amazoncognito.com https://creatorsapi.amazon https://*.amazon.com https://*.amazon.co.jp",
      "frame-src 'self' https://www.fitbit.com https://accounts.fitbit.com https://pagead2.googlesyndication.com",
      'upgrade-insecure-requests',
    ].join('; '),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: securityHeaders,
    },
  ],
};

const withNextIntl = createNextIntlPlugin('./i18n.ts');

export default withNextIntl(nextConfig);

