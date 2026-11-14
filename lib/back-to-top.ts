/**
 * 「回到顶部」按钮的纯逻辑：显示阈值与阅读进度。
 *
 * 抽成纯函数，既方便单测（tests/back-to-top.test.ts），也避免组件里散落魔数。
 */

/** 滚动超过这个距离（px）才显示按钮 */
export const BACK_TO_TOP_THRESHOLD = 420;

export function shouldShowBackToTop(
  scrolled: number,
  threshold: number = BACK_TO_TOP_THRESHOLD,
): boolean {
  if (!Number.isFinite(scrolled)) return false;
  return scrolled > threshold;
}

/** 当前滚动进度（0–1）；没有可滚动空间（短页面）时返回 0，避免除零得到 NaN */
export function scrollProgress(scrolled: number, scrollable: number): number {
  if (!Number.isFinite(scrolled) || !Number.isFinite(scrollable) || scrollable <= 0) return 0;
  return Math.min(Math.max(scrolled / scrollable, 0), 1);
}
