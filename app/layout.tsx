import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Insider · 美股多周期行情",
  description:
    "从 Yahoo Finance、Nasdaq 与 Perplexity 获取美股报价，支持 1D / 5D / 1M / 3M / 6M / 1Y / 5Y / MAX 多周期走势与 AI 解读。",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** 在首帧前确定主题，避免亮/暗闪烁 */
const themeScript = `(function(){try{var s=localStorage.getItem("data-insider:theme");var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

