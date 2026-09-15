import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "弦间 · 个人吉他练习室",
  description: "收藏一份曲谱，留下一段练习。你的私人吉他练习室。",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
