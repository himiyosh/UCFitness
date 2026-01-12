import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Fixed import
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import GlobalLoader from "@/components/GlobalLoader";
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
          <Suspense fallback={null}>
            <GlobalLoader />
          </Suspense>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
