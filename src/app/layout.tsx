import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "مسابقة الكتابة · תחרות הכתיבה",
  description: "إدارة مسابقتي الكتابة · ניהול תחרויות הכתיבה",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF8F1" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
