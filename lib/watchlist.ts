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

/* -------------------------------------------------------------------------- */
/*                              自选股增删与上限                              */
/* -------------------------------------------------------------------------- */

export type AddWatchlistStatus = "added" | "exists" | "full";

export interface AddWatchlistResult {
  list: string[];
  status: AddWatchlistStatus;
}

/**
 * 往自选股里加一只标的。
 *
 * 之前是「追加后 slice(0, 20)」——满 20 只时新标会被静默丢掉，用户以为没反应。
 * 现在拆成三种明确结果，UI 可以据此提示「已达上限」。
 */
export function addToWatchlist(
  list: string[],
  symbol: string,
  max: number,
): AddWatchlistResult {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return { list, status: "exists" };
  if (list.includes(normalized)) return { list, status: "exists" };
  if (list.length >= max) return { list, status: "full" };

  return { list: [...list, normalized], status: "added" };
}

/* -------------------------------------------------------------------------- */
/*                              自选股分组（标签）                            */
/* -------------------------------------------------------------------------- */

export interface WatchlistGroup {
  id: string;
  name: string;
}

/** 未分组的分组 id（不落库，仅内部使用） */
export const UNGROUPED_ID = "__ungrouped__";
export const UNGROUPED_NAME = "未分组";

/** 分组数量与名称长度上限 */
export const MAX_GROUPS = 12;
export const MAX_GROUP_NAME = 12;

/** 从 localStorage 读到的任意值里挑出合法分组（重名、超长、超量都会被清理） */
export function sanitizeGroups(raw: unknown): WatchlistGroup[] {
  if (!Array.isArray(raw)) return [];

  const groups: WatchlistGroup[] = [];
  const names = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") continue;

    const name = candidate.name.trim().slice(0, MAX_GROUP_NAME);
    if (!name || names.has(name.toLowerCase())) continue;

    names.add(name.toLowerCase());
    groups.push({ id: candidate.id.slice(0, 32) || `g${groups.length}`, name });
    if (groups.length >= MAX_GROUPS) break;
  }

  return groups;
}

/** 过滤「标的 → 分组」映射：只保留存在且合法的分组与代码 */
export function sanitizeAssignment(
  raw: unknown,
  groups: WatchlistGroup[],
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};

  const validIds = new Set(groups.map((group) => group.id));
  const assignment: Record<string, string> = {};

  for (const [symbol, groupId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof groupId !== "string" || !validIds.has(groupId)) continue;
    if (!/^[A-Z0-9.^=-]{1,12}$/.test(symbol)) continue;
    assignment[symbol] = groupId;
  }

  return assignment;
}

/** 新建分组；重名 / 超过上限 / 空名称时返回 null */
export function createGroup(
  name: string,
  groups: WatchlistGroup[],
  now = Date.now(),
): { group: WatchlistGroup; groups: WatchlistGroup[] } | null {
  const trimmed = name.trim().slice(0, MAX_GROUP_NAME);
  if (!trimmed) return null;
  if (groups.length >= MAX_GROUPS) return null;
  if (groups.some((group) => group.name.toLowerCase() === trimmed.toLowerCase())) return null;

  const group: WatchlistGroup = {
    id: `g${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: trimmed,
  };

  return { group, groups: [...groups, group] };
}

export interface WatchlistSection {
  id: string;
  name: string;
  symbols: string[];
}

/**
 * 把（已排序的）自选股按分组切成若干段。
 * - 分段内部保持传入顺序（所以「按涨跌幅排序」是在每个分组内生效）
 * - 未知分组归入「未分组」
 * - 没有任何分组时只返回一个「未分组」段（此时 UI 不显示分组标题）
 */
export function groupSections(
  symbols: string[],
  groups: WatchlistGroup[],
  assignment: Record<string, string>,
): WatchlistSection[] {
  const buckets = new Map<string, string[]>();
  buckets.set(UNGROUPED_ID, []);
  for (const group of groups) buckets.set(group.id, []);

  for (const symbol of symbols) {
    const groupId = assignment[symbol];
    const key = groupId && buckets.has(groupId) ? groupId : UNGROUPED_ID;
    buckets.get(key)!.push(symbol);
  }

  const sections: WatchlistSection[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    symbols: buckets.get(group.id) ?? [],
  }));

  const ungrouped = buckets.get(UNGROUPED_ID) ?? [];
  // 已经有分组时，空的「未分组」不必占位；分组本身即使为空也保留（方便往里拖）
  if (ungrouped.length > 0 || groups.length === 0) {
    sections.push({ id: UNGROUPED_ID, name: UNGROUPED_NAME, symbols: ungrouped });
  }

  return sections;
}
