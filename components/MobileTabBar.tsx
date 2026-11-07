"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useNavStyle } from "@/lib/nav-style";

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

interface NavShared {
  pathname: string;
  pressed: string | null;
  ripples: Ripple[];
  onPress: (key: string) => void;
  onRelease: () => void;
  label: (text: string) => string;
}

function TabIcon({ tab, size = 22 }: { tab: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {tab === "market" && (
        <path
          d="M4 16.5 8.5 10l3.6 4.2L16.5 7.5H20"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {tab === "earnings" && (
        <>
          <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {tab === "research" && (
        <>
          <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M8 15v-4M12 15V7M16 15v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
      {tab === "backtest" && (
        <>
          <path d="M4 17l5-6 4 3 7-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="11" r="1.4" fill="currentColor" />
        </>
      )}
      {tab === "institutions" && (
        <>
          <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 19c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M16 6.5a2.8 2.8 0 0 1 0 5.4M17.5 18.8c0-2 .7-3.4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function RippleLayer({ ripples, tabKey }: { ripples: Ripple[]; tabKey: string }) {
  return (
    <>
      {ripples
        .filter((item) => item.key === tabKey)
        .map((item) => (
          <span
            key={item.id}
            aria-hidden="true"
            className="tab-ripple pointer-events-none absolute left-1/2 top-[34%] h-12 w-12 rounded-full bg-accent/35"
          />
        ))}
    </>
  );
}

/** 风格 A：水晶滑块 —— 毛玻璃底栏 + 随页面滑动的水晶指示块 */
function CrystalNav({ pathname, pressed, ripples, onPress, onRelease, label }: NavShared) {
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [tile, setTile] = useState({ left: 0, width: 0, ready: false });

  const activeIndex = (() => {
    const index = TABS.findIndex((tab) => tab.href === pathname);
    return index < 0 ? 0 : index;
  })();

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
      ready: true,
    });
  }, [activeIndex]);

  useEffect(() => {
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <nav
      data-nav-style="crystal"
      className="tab-glass fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={label("移动端导航")}
    >
      <div className="mx-auto max-w-lg px-2.5 pb-2 pt-2">
        <div ref={rowRef} className="relative flex items-stretch">
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
                onPointerDown={() => onPress(tab.key)}
                onPointerUp={onRelease}
                onPointerLeave={onRelease}
                onPointerCancel={onRelease}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onPress(tab.key);
                }}
                onKeyUp={onRelease}
                className={`group relative flex flex-1 select-none flex-col items-center gap-1 overflow-hidden rounded-lg px-1 pb-2.5 pt-2 text-[12px] leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  current ? "font-medium text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <RippleLayer ripples={ripples} tabKey={tab.key} />
                <span className={`relative transition-transform duration-200 ease-out ${isPressed ? "scale-110" : ""}`}>
                  <TabIcon tab={tab.key} />
                </span>
                <span className="relative w-full truncate text-center whitespace-nowrap">{label(tab.label)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** 风格 B：胶囊徽标 —— 悬浮胶囊容器 + 圆角方形图标徽标 + 渐变高亮（参考用户附图） */
function CapsuleNav({ pathname, pressed, ripples, onPress, onRelease, label }: NavShared) {
  return (
    <nav
      data-nav-style="capsule"
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={label("移动端导航")}
    >
      <div className="mx-auto max-w-lg px-3 pb-2.5 pt-2">
        <div className="tab-capsule relative flex items-stretch rounded-full px-1.5 py-1.5">
          {TABS.map((tab) => {
            const current = pathname === tab.href;
            const isPressed = pressed === tab.key;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                data-tab={tab.key}
                aria-current={current ? "page" : undefined}
                onPointerDown={() => onPress(tab.key)}
                onPointerUp={onRelease}
                onPointerLeave={onRelease}
                onPointerCancel={onRelease}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onPress(tab.key);
                }}
                onKeyUp={onRelease}
                className={`relative flex flex-1 select-none flex-col items-center gap-1 overflow-hidden rounded-full py-1.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  current ? "text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {/* 选中项的大圆角高亮 */}
                {current && (
                  <span aria-hidden="true" className="tab-pill-active pointer-events-none absolute inset-0 rounded-full" />
                )}
                <RippleLayer ripples={ripples} tabKey={tab.key} />

                <span
                  className={`tab-badge relative flex h-7 w-7 items-center justify-center rounded-[10px] transition-transform duration-200 ease-out ${
                    current ? "tab-badge-active text-white" : "text-muted-foreground"
                  } ${isPressed ? "scale-110" : ""}`}
                >
                  <TabIcon tab={tab.key} size={17} />
                </span>
                <span className="relative w-full truncate text-center text-[11.5px] leading-none whitespace-nowrap">
                  {label(tab.label)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** 移动端底部标签栏：风格可在「水晶滑块 / 胶囊徽标」之间切换（顶部导航右侧） */
export default function MobileTabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [navStyle] = useNavStyle();
  const [pressed, setPressed] = useState<string | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  const spawnRipple = useCallback((key: string) => {
    const id = (seq.current += 1);
    setRipples((prev) => [...prev.slice(-3), { key, id }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((item) => item.id !== id));
    }, 640);
  }, []);

  const onPress = useCallback(
    (key: string) => {
      setPressed(key);
      spawnRipple(key);
    },
    [spawnRipple],
  );

  const onRelease = useCallback(() => setPressed(null), []);

  const shared: NavShared = {
    pathname,
    pressed,
    ripples,
    onPress,
    onRelease,
    label: t,
  };

  return navStyle === "capsule" ? <CapsuleNav {...shared} /> : <CrystalNav {...shared} />;
}
