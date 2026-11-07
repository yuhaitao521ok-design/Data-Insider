"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

const TABS = [
  { key: "market", href: "/", label: "行情" },
  { key: "earnings", href: "/earnings", label: "财报站" },
  { key: "research", href: "/research", label: "量化研究" },
  { key: "backtest", href: "/backtest", label: "回测" },
  { key: "institutions", href: "/institutions", label: "机构持仓" },
] as const;

interface Ripple {
  key: string;
  id: number;
}

/**
 * 移动端底部标签栏：水晶指示块 + 毛玻璃底栏。
 *
 * 挂在 RootLayout 下（而不是 PageShell），路由切换时组件不会卸载重挂，
 * 指示块只会平滑滑到下一个标签，不会从屏幕左侧跳入。
 *
 * 反馈规则：
 *  - 按下：指示块压紧（scale + 内阴影）+ 水波纹 + 文字变主题色；
 *  - 按钮本身不做缩放（缩放会让文字在过渡期间被栅格化失真）；
 *  - 首次测量完成前指示块关闭过渡，避免从 left:0 滑入。
 */
export default function MobileTabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const seq = useRef(0);
  const [tile, setTile] = useState({ left: 0, width: 0, ready: false });
  const [pressed, setPressed] = useState<string | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const activeIndex = (() => {
    const index = TABS.findIndex((tab) => tab.href === pathname);
    return index < 0 ? 0 : index;
  })();

  /** 测量当前标签位置，让水晶块滑到它下面 */
  const measure = useCallback(() => {
    const row = rowRef.current;
    const item = itemRefs.current[activeIndex];
    if (!row || !item) return;
    const rowBox = row.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    if (itemBox.width <= 0) return;
    setTile({
      left: itemBox.left - rowBox.left + 6,
      width: Math.max(itemBox.width - 12, 0),
      // 测量成功后才允许过渡动画
      ready: true,
    });
  }, [activeIndex]);

  useEffect(() => {
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    // 字体加载完成后宽度可能变化，再测一次
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(() => measure()).catch(() => undefined);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const spawnRipple = useCallback((key: string) => {
    const id = (seq.current += 1);
    setRipples((prev) => [...prev.slice(-3), { key, id }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((item) => item.id !== id));
    }, 640);
  }, []);

  const release = useCallback(() => setPressed(null), []);

  return (
    <nav
      className="tab-glass fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("移动端导航")}
    >
      <div className="mx-auto max-w-lg px-2.5 pb-2 pt-2">
        <div ref={rowRef} className="relative flex items-stretch">
          {/* 滑动的水晶指示块：首次测量完成前不启用过渡，避免从 left:0 滑入 */}
          <div
            aria-hidden="true"
            className={`tab-tile pointer-events-none absolute bottom-1 top-1 rounded-lg ${
              tile.ready
                ? "transition-[left,width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                : "transition-none"
            } ${pressed ? "tab-tile-pressed" : ""} ${tile.ready ? "opacity-100" : "opacity-0"}`}
            style={{ left: tile.left, width: tile.width }}
          />

          {TABS.map((tab, index) => {
            const current = pathname === tab.href;
            const isPressed = pressed === tab.key;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                data-tab={tab.key}
                aria-current={current ? "page" : undefined}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                onPointerDown={() => {
                  setPressed(tab.key);
                  spawnRipple(tab.key);
                }}
                onPointerUp={release}
                onPointerLeave={release}
                onPointerCancel={release}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setPressed(tab.key);
                    spawnRipple(tab.key);
                  }
                }}
                onKeyUp={release}
                className={`group relative flex flex-1 select-none flex-col items-center gap-1 overflow-hidden rounded-lg px-1 pb-2.5 pt-2 text-[12px] leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  current
                    ? "font-medium text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {ripples
                  .filter((item) => item.key === tab.key)
                  .map((item) => (
                    <span
                      key={item.id}
                      aria-hidden="true"
                      className="tab-ripple pointer-events-none absolute left-1/2 top-[32%] h-12 w-12 rounded-full bg-accent/35"
                    />
                  ))}

                <span
                  className={`relative transition-transform duration-200 ease-out ${
                    isPressed ? "scale-110" : ""
                  }`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    {tab.key === "market" && (
                      <path
                        d="M4 16.5 8.5 10l3.6 4.2L16.5 7.5H20"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {tab.key === "earnings" && (
                      <>
                        <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </>
                    )}
                    {tab.key === "research" && (
                      <>
                        <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        <path d="M8 15v-4M12 15V7M16 15v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </>
                    )}
                    {tab.key === "backtest" && (
                      <>
                        <path d="M4 17l5-6 4 3 7-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="9" cy="11" r="1.4" fill="currentColor" />
                      </>
                    )}
                    {tab.key === "institutions" && (
                      <>
                        <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M3.5 19c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M16 6.5a2.8 2.8 0 0 1 0 5.4M17.5 18.8c0-2 .7-3.4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </>
                    )}
                  </svg>
                </span>
                <span className="relative">{t(tab.label)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
