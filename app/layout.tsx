import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";
import NumberInputGuard from "./components/NumberInputGuard";
import { BRAND } from './lib/brand';
import { siteOrigin } from './lib/publicUrl';

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
  description:
    "Red Rose Sweets — fresh baklava, maamoul, Arabic & French pastry and gift hampers in Al Qurain, Kuwait. Order online for same-day delivery.",
  keywords: [
    "Red Rose Sweets",
    "Kuwait sweets",
    "baklava Kuwait",
    "maamoul",
    "Arabic sweets Al Qurain",
    "French pastry Kuwait",
    "Medjool dates",
    "gift hampers Kuwait",
    "same-day sweets delivery Kuwait",
  ],
  // Absolute base for every canonical / OG / sitemap URL. Reads the configured
  // origin, falling back to the registered domain so it is never relative.
  metadataBase: new URL(siteOrigin()),
  openGraph: {
    type: "website",
    siteName: BRAND.fullName,
    locale: "en_KW",
    title: BRAND.fullName,
    description:
      "Fresh baklava, maamoul, Arabic & French pastry and gift hampers in Al Qurain, Kuwait — order online for same-day delivery.",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.fullName,
    description:
      "Fresh baklava, maamoul, Arabic & French pastry and gift hampers in Al Qurain, Kuwait — order online for same-day delivery.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Red Rose",
  },
  /* The shop's own logo is the favicon, everywhere.
     The old app/favicon.ico is gone on purpose: Next's file convention emits
     its <link rel="icon"> ahead of anything declared here, so while that file
     existed the browser kept picking it and nothing set below could win.
     /finallogo.jpeg is already loaded by the nav and the footer, so pointing
     the tab icon at it costs no extra request. */
  icons: {
    // ?v=2 busts the browser's sticky favicon cache after the logo was
    // regenerated. Bump the number again on any future logo change.
    icon: [
      { url: "/finallogo.jpeg?v=2", type: "image/jpeg" },
      { url: "/icon-192.png?v=2", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/finallogo.jpeg?v=2",
    apple: "/apple-touch-icon.png?v=2",
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
        {/* Wheel must never silently change a price or a stock count. */}
        <NumberInputGuard />
      </body>
    </html>
  );
}
