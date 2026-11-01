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
