import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Poppins,
  Fraunces,
  Cormorant_Garamond,
} from "next/font/google";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Poppins is scoped to the marketing landing page via the `font-poppins`
// utility; the staff dashboards keep Geist.
const poppins = Poppins({
  variable: "--font-poppins-src",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// The hero wordmark (ROSE / BLOOM). Fraunces is a display serif with soft,
// warm terminals — it holds its weight at huge sizes where a hairline didone
// goes thin and washed out against the red.
const fraunces = Fraunces({
  variable: "--font-display-src",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
});

// Numerals only ("50K+" and friends) — a different rhythm from the wordmark
// so the stat reads as its own voice instead of shrunken heading text.
const cormorant = Cormorant_Garamond({
  variable: "--font-numeric-src",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  applicationName: "Red Rose",
  title: {
    default: "Red Rose Sweets",
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
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${fraunces.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
