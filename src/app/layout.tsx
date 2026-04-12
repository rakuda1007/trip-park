import { AppHeader } from "@/components/app-header";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Trip Park",
    template: "%s | Trip Park",
  },
  description:
    "旅行・キャンプの計画を共有する Web アプリ（Next.js + Firebase）",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Trip Park",
  },
  formatDetection: {
    telephone: false,
  },
  applicationName: "Trip Park",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <AppHeader />
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
