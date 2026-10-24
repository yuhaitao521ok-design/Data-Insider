import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Insider · 美股多周期行情",
  description: "从 Yahoo Finance 与 Perplexity 获取美股实时报价，支持 1D / 5D / 1M / 3M / 6M / 1Y / 5Y / MAX 多周期走势与 AI 解读。",
};

export const viewport: Viewport = {
  themeColor: "#070b12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
