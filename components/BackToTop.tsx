"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { scrollProgress, shouldShowBackToTop } from "@/lib/back-to-top";
import { useI18n } from "@/lib/i18n";

/** 进度环半径（按钮内圆 32px，留 1.5px 描边余量） */
const RING_RADIUS = 13.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * 全站「回到顶部」悬浮按钮。
 *
 * - 项目所有页面都是文档流滚动（没有内部滚动容器），所以直接监听 window
 * - 滚动事件用 requestAnimationFrame 合并，长列表 / 图表页滚动时不掉帧
 * - 外圈是当前阅读进度，长页面能一眼看出还剩多少
 * - 手机端位置在底部 tab bar 之上（见 globals.css 的 .back-to-top）
 */
export default function BackToTop() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    const update = () => {
      frame.current = 0;
      const scrolled = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollProgress(scrolled, scrollable));
      setVisible(shouldShowBackToTop(scrolled));
    };

    const schedule = () => {
      if (frame.current) return;
      frame.current = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame.current) window.cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const backToTop = useCallback(() => {
    // 全局 CSS 设了 scroll-behavior: smooth，所以「减少动效」时必须用 instant 才会真的瞬移
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
  }, []);

  return (
    <button
      type="button"
      onClick={backToTop}
      aria-label={t("回到顶部")}
      title={t("回到顶部")}
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
      className={`back-to-top group fixed right-4 z-[45] flex items-center gap-2 rounded-full border border-border bg-popover/90 p-1.5 text-muted-foreground shadow-[var(--shadow-pop)] backdrop-blur transition-all duration-200 hover:border-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:pr-3 lg:right-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <svg
          viewBox="0 0 32 32"
          className="absolute inset-0 h-full w-full -rotate-90"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            stroke="currentColor"
            strokeOpacity="0.18"
            strokeWidth="2"
          />
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 19V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="m6 11.5 6-6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="hidden text-[12px] leading-none sm:inline">{t("回到顶部")}</span>
    </button>
  );
}
