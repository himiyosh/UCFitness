import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import SplashScreen from "@/components/SplashScreen";
import GlobalLoader from "@/components/GlobalLoader";

import { Suspense } from "react";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { auth } from "@/lib/auth";
import LanguageSyncer from "@/components/LanguageSyncer";import FloatingEmojis from '@/components/FloatingEmojis';
const inter = Inter({ subsets: ["latin"] });

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

  // Ensure that the incoming `locale` is valid
  if (!['ja', 'en'].includes(locale)) {
    notFound();
  }

  // Provide all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={inter.className}>
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

                <LanguageSyncer user={session?.user as any} />
                {session && <FloatingEmojis />}
                <div id="main-content" className="relative" style={{ zIndex: 20 }}>
                  {children}
                </div>
              </ThemeProvider>
            </ToastProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
