import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";

import { Suspense } from "react";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';

import "../globals.css";

import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { getFrameColor } from "@/lib/frame-utils";
import { getEquippedItems } from "@/lib/services/shop-service";
import { getThemeFromItemCode } from "@/lib/theme";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import GlobalLoader from "@/components/auth/GlobalLoader";
import LanguageSyncer from "@/components/layout/LanguageSyncer";
import BottomNavBar from "@/components/layout/BottomNavBar";
import SkipLink from '@/components/layout/SkipLink';
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

import type { Theme } from "@/lib/theme";

interface LayoutSessionUser {
  id?: string;
  language?: string | null;
}

interface ShellUser {
  username: string;
  name: string | null;
  image: string | null;
  titleName: string | null;
  titleEmoji: string | null;
  frameColor: string | null;
  theme: Theme | null;
}

const inter = Inter({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSansJp = Noto_Sans_JP({
  weight: ['400', '500', '700', '800', '900'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
  preload: false,
});

async function getShellUser(userId: string | undefined, locale: string): Promise<ShellUser | null> {
  if (!userId) return null;

  const [userResult, equippedItems] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("username, name, image")
      .eq("id", userId)
      .single(),
    getEquippedItems(userId).catch((error: unknown) => {
      reportError('app-shell:equipped-items', error, { userId });
      return null;
    }),
  ]);

  const dbUser = userResult.data;
  if (userResult.error && userResult.error.code !== 'PGRST116') {
    reportError('app-shell:user', userResult.error, { userId });
    throw new Error('Failed to load app shell user');
  }
  if (!dbUser?.username) return null;

  const titleItem = equippedItems?.TITLE;
  const frameItem = equippedItems?.ICON_FRAME;
  const titleName = titleItem
    ? (locale === "ja" ? titleItem.shop_items?.name_ja : titleItem.shop_items?.name_en) || null
    : null;
  const titleEmoji = titleItem?.shop_items?.preview_value || null;
  const frameColor = frameItem?.shop_items?.preview_value
    ? getFrameColor(frameItem.shop_items.preview_value)
    : null;
  const theme = equippedItems
    ? getThemeFromItemCode(equippedItems.THEME_COLOR?.shop_items?.item_code) ?? 'classic'
    : null;

  return {
    username: dbUser.username,
    name: dbUser.name || null,
    image: dbUser.image || null,
    titleName,
    titleEmoji,
    frameColor,
    theme,
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
  const skipToContent = locale === 'ja' ? 'メインコンテンツへ' : 'Skip to content';
  const sessionUser = session?.user as LayoutSessionUser | undefined;
  const languageUser = sessionUser
    ? { language: sessionUser.language ?? null }
    : undefined;

  // Ensure that the incoming `locale` is valid
  if (!['ja', 'en'].includes(locale)) {
    notFound();
  }

  // Provide all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();
  const shellUser = await getShellUser(sessionUser?.id, locale);

  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${notoSansJp.variable}`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <ToastProvider>
              <ThemeProvider initialTheme={shellUser?.theme ?? undefined}>
                {/* スキップナビゲーションリンク (WCAG 2.4.1) */}
                <SkipLink
                  label={skipToContent}
                  targetId="main-page-content"
                />
                <Suspense fallback={null}>
                  <GlobalLoader />
                </Suspense>

                <LanguageSyncer user={languageUser} />
                <div
                  id="main-content"
                  className={`relative flex min-h-screen flex-col ${shellUser ? "uc-auth-shell pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:flex-row lg:pb-0" : ""}`}
                  style={{ zIndex: 20 }}
                >
                  {shellUser && (
                    <DashboardSidebar
                      userName={shellUser.name}
                      userImage={shellUser.image}
                      username={shellUser.username}
                      titleName={shellUser.titleName}
                      titleEmoji={shellUser.titleEmoji}
                      frameColor={shellUser.frameColor}
                    />
                  )}
                  <div
                    id="main-page-content"
                    tabIndex={-1}
                    className={shellUser ? "uc-auth-content flex min-h-0 min-w-0 flex-1 flex-col" : "flex min-w-0 flex-1 flex-col"}
                  >
                    {children}
                  </div>
                </div>
                {/* モバイル用固定ボトムナビゲーション (認証済みユーザーのみ) */}
                {shellUser && <BottomNavBar />}
              </ThemeProvider>
            </ToastProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
