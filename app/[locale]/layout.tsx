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
import LanguageSyncer from "@/components/LanguageSyncer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UCFitness",
  description: "Fitbit Step Competition Dashboard",
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
                <SplashScreen />
                <Suspense fallback={null}>
                  <GlobalLoader />
                </Suspense>

                <LanguageSyncer user={session?.user as any} />
                {children}
              </ThemeProvider>
            </ToastProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
