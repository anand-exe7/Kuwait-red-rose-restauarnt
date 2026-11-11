import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import "./admin.css";

const lexend = Lexend({ subsets: ["latin"], variable: "--font-adm-num" });

export const metadata: Metadata = {
  title: { default: "Admin · Red Rose", template: "%s · Admin · Red Rose" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin-secure-portal-xyz-345">) {
  return <div className={`adm ${lexend.variable}`}>{children}</div>;
}
