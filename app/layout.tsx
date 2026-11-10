import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";
import { BRAND } from './lib/brand';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The landing page's own faces (wordmark, serif, body) live in app/fonts.ts and
// are applied on that page only, so the dashboards don't preload them.

export const metadata: Metadata = {
  applicationName: "Red Rose",
  title: {
    default: BRAND.fullName,
    template: "%s · Red Rose",
  },
  description: "Order Red Rose sweets from your table, right from your phone.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Red Rose",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#b01e28",
  width: "device-width",
  initialScale: 1,
  // No maximumScale / userScalable: pinch-zoom must stay available. Capping it
  // locks out anyone who relies on zoom to read, and iOS ignores the cap anyway
  // while still counting it against accessibility.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
