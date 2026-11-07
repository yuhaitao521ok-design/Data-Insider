import { useEffect, useState } from "react";

/**
 * 底部导航风格：
 *  - crystal：水晶滑块（毛玻璃底栏 + 随页面滑动的水晶指示块）
 *  - capsule：胶囊徽标（悬浮胶囊容器 + 圆角方形图标徽标 + 渐变高亮）
 *
 * 配置写 localStorage 并广播事件，MobileTabBar / NavStyleSwitcher 实时同步。
 */
export type NavStyle = "crystal" | "capsule";

export const NAV_STYLE_KEY = "data-insider:nav-style:v1";
export const DEFAULT_NAV_STYLE: NavStyle = "crystal";

const EVENT = "navstylechange";

export function isNavStyle(value: unknown): value is NavStyle {
  return value === "crystal" || value === "capsule";
}

export function readNavStyle(): NavStyle {
  try {
    const raw = window.localStorage.getItem(NAV_STYLE_KEY);
    return isNavStyle(raw) ? raw : DEFAULT_NAV_STYLE;
  } catch {
    return DEFAULT_NAV_STYLE;
  }
}

export function writeNavStyle(style: NavStyle): void {
  try {
    window.localStorage.setItem(NAV_STYLE_KEY, style);
  } catch {
    // 隐私模式下写入失败可忽略
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: style }));
}

export function subscribeNavStyle(callback: (style: NavStyle) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<NavStyle>).detail;
    if (isNavStyle(detail)) callback(detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** 读取 + 订阅切换（挂载后才读取，SSR 期间返回默认值） */
export function useNavStyle(): [NavStyle, (style: NavStyle) => void] {
  const [style, setStyle] = useState<NavStyle>(DEFAULT_NAV_STYLE);

  useEffect(() => {
    setStyle(readNavStyle());
    return subscribeNavStyle(setStyle);
  }, []);

  return [style, writeNavStyle];
}
