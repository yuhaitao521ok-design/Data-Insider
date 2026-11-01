/**
 * 滚动到指定区块，并自动减去「吸顶头部」的实际高度。
 *
 * 手机上头部会换成两行（logo + 搜索框），高度和桌面不同，
 * 所以不能写死 offset，也不能直接用 scrollIntoView（会被吸顶栏挡住标题）。
 */
export function scrollToSection(id: string, extraGap = 12): boolean {
  if (typeof window === "undefined") return false;

  const element = document.getElementById(id);
  if (!element) return false;

  const header = document.querySelector("header");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const top = element.getBoundingClientRect().top + window.scrollY - headerHeight - extraGap;

  window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  return true;
}

/**
 * 立即滚一次，随后在图表数据加载完成 / 骨架屏换成真实内容导致布局变化时再校正。
 *
 * 场景：点板块热力 → 选中后图表开始 loading（骨架屏高度和真实图表不同），
 * 如果只滚一次，加载完成后位置会漂；这里在 300ms / 700ms 各校正一次。
 */
export function scrollToSectionWithRetry(id: string, extraGap = 12): void {
  if (typeof window === "undefined") return;

  // 先立刻滚，不等数据（避免用户觉得"点了没反应"）
  scrollToSection(id, extraGap);

  for (const delay of [300, 700]) {
    window.setTimeout(() => {
      const element = document.getElementById(id);
      if (!element) return;

      const header = document.querySelector("header");
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const target = Math.max(
        element.getBoundingClientRect().top + window.scrollY - headerHeight - extraGap,
        0,
      );

      // 已经对准（±24px）就不再打扰用户
      if (Math.abs(window.scrollY - target) < 24) return;
      window.scrollTo({ top: target, behavior: "smooth" });
    }, delay);
  }
}
