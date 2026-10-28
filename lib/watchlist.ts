import type { Quote } from "@/lib/types";

/**
 * 自选股列表的显示顺序：
 *   manual       手动顺序（用户拖拽后的顺序，持久化）
 *   change-desc  按涨跌幅从高到低
 *   change-asc   按涨跌幅从低到高
 *
 * 排序只影响展示；用户在任何排序状态下拖拽后，都会把当前展示顺序固化为新的手动顺序。
 */

export const WATCHLIST_SORTS = ["manual", "change-desc", "change-asc"] as const;

export type WatchlistSort = (typeof WATCHLIST_SORTS)[number];

export function isWatchlistSort(value: unknown): value is WatchlistSort {
  return typeof value === "string" && (WATCHLIST_SORTS as readonly string[]).includes(value);
}

/** 按钮点击时循环切换：手动 → 跌幅在前（降序）→ 涨幅在前（升序）→ 手动 */
export function nextWatchlistSort(mode: WatchlistSort): WatchlistSort {
  if (mode === "manual") return "change-desc";
  if (mode === "change-desc") return "change-asc";
  return "manual";
}

export function sortWatchlistLabel(mode: WatchlistSort): string {
  if (mode === "change-desc") return "涨跌幅降序";
  if (mode === "change-asc") return "涨跌幅升序";
  return "手动排序";
}

/**
 * 按涨跌幅排序；没有报价（例如请求失败）的标的始终排在最后，
 * 涨跌幅相同的保持原有相对顺序。
 */
export function sortWatchlist(
  symbols: string[],
  quotes: Record<string, Quote | undefined>,
  mode: WatchlistSort,
): string[] {
  if (mode === "manual") return [...symbols];

  const direction = mode === "change-desc" ? -1 : 1;

  return [...symbols].sort((a, b) => {
    const left = quotes[a]?.changePercent ?? null;
    const right = quotes[b]?.changePercent ?? null;

    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return 0;
    return (left - right) * direction;
  });
}

/** 把 from 位置的元素移动到 to 位置（原地索引语义，越界或原地不动时返回原数组） */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * 根据指针位置计算应插入的目标下标。
 *
 * 列表可能是竖向（桌面侧栏）也可能是横向（移动端），用元素中心的分布方向判断；
 * 指针落在某个元素中心之前就插到该位置，否则落到末尾。
 */
export function dropIndexAt(
  rects: { left: number; top: number; width: number; height: number }[],
  pointer: { x: number; y: number },
): number {
  if (rects.length === 0) return 0;

  const lefts = rects.map((rect) => rect.left);
  const tops = rects.map((rect) => rect.top);
  const spreadX = Math.max(...lefts) - Math.min(...lefts);
  const spreadY = Math.max(...tops) - Math.min(...tops);
  const vertical = spreadY >= spreadX;

  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    const center = vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    const cursor = vertical ? pointer.y : pointer.x;
    if (cursor < center) return index;
  }

  return rects.length - 1;
}
