import type { Metadata, Viewport } from "next";
import "../globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import GlobalLoader from "@/components/auth/GlobalLoader";
import dynamic from 'next/dynamic';

import { Suspense } from "react";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { auth } from "@/lib/auth";
import LanguageSyncer from "@/components/layout/LanguageSyncer";
import BottomNavBar from "@/components/layout/BottomNavBar";

// ⚡ パフォーマンス: 装飾用クライアントコンポーネントを遅延読み込み
const SplashScreen = dynamic(() => import('@/components/auth/SplashScreen'));
const FloatingEmojis = dynamic(() => import('@/components/dashboard/FloatingEmojis'));

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#6366f1',
};

export const metadata: Metadata = {
  title: "UCFitness",
  description: "Fitbit Step Competition Dashboard",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  const languageUser = session?.user
    ? { language: (session.user as { language?: string | null }).language ?? null }
    : undefined;

  // Ensure that the incoming `locale` is valid
  if (!['ja', 'en'].includes(locale)) {
    notFound();
  }

  // Provide all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800;900&family=Inter:wght@700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <ToastProvider>
              <ThemeProvider>
                {/* スキップナビゲーションリンク (WCAG 2.4.1) */}
                <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-[var(--theme-primary)] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg">
                  Skip to content
                </a>
                <SplashScreen />
                <Suspense fallback={null}>
                  <GlobalLoader />
                </Suspense>

                <LanguageSyncer user={languageUser} />
                {/* pb-16: BottomNav h-16 (64px) 分の余白を確保 */}
                <div id="main-content" className="relative flex flex-col pb-16 sm:pb-0" style={{ zIndex: 20 }}>
                  {session && <FloatingEmojis />}
                  {children}
                </div>
                {/* モバイル用固定ボトムナビゲーション (認証済みユーザーのみ) */}
                {session && <BottomNavBar />}
              </ThemeProvider>
            </ToastProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
