import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Fixed import
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import SplashScreen from "@/components/SplashScreen";
import GlobalLoader from "@/components/GlobalLoader";
import PushNotificationManager from "@/components/PushNotificationManager";
import { Suspense } from "react";

const inter = Inter({ subsets: ["latin"] });


export const metadata: Metadata = {
  title: "UCFitness",
  description: "Fitbit Step Competition Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ToastProvider>
            <SplashScreen />
            <Suspense fallback={null}>
              <GlobalLoader />
            </Suspense>
            <PushNotificationManager />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
