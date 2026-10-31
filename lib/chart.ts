/** 主图蜡烛（K 线）几何计算，抽成纯函数便于测试。 */

import type { ChartSessions } from "@/lib/types";

export interface CandleInput {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
}

export interface CandleShape {
  x: number;
  width: number;
  up: boolean;
  bodyTop: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
}

export interface CandleLayout {
  xFor: (index: number) => number;
  yFor: (value: number) => number;
  /** 相邻两根的横向间距 */
  step: number;
}

/** 实体宽度：间距的 62%，限制在 1–14px，保证密集数据也能看清 */
export function candleWidth(step: number): number {
  return Math.max(1, Math.min(14, step * 0.62));
}

export function buildCandles(points: CandleInput[], layout: CandleLayout): CandleShape[] {
  const width = candleWidth(layout.step);

  return points.map((point, index) => {
    const open = point.open ?? point.close;
    const high = Math.max(point.high ?? Math.max(open, point.close), open, point.close);
    const low = Math.min(point.low ?? Math.min(open, point.close), open, point.close);
    const openY = layout.yFor(open);
    const closeY = layout.yFor(point.close);

    return {
      x: layout.xFor(index),
      width,
      up: point.close >= open,
      bodyTop: Math.min(openY, closeY),
      bodyHeight: Math.max(1, Math.abs(closeY - openY)),
      wickTop: layout.yFor(high),
      wickBottom: layout.yFor(low),
    };
  });
}

export interface BarChange {
  /** 相对基准价的涨跌额 */
  change: number | null;
  /** 涨跌幅（百分比数值） */
  changePercent: number | null;
  /** 计算基准：上一根的收盘价，首根用传入的兜底基准（如昨收）或当根开盘价 */
  base: number | null;
}

/**
 * 单根 K 线（或折线数据点）的涨跌：以上一根收盘价为基准，
 * 第一根没有「上一根」，优先用传入的兜底基准（分时图的昨收），否则退回当根开盘价。
 */
export function barChange(
  points: { open: number | null; close: number }[],
  index: number,
  fallbackBase: number | null = null,
): BarChange {
  const point = points[index];
  if (!point) return { change: null, changePercent: null, base: null };

  const previous = index > 0 ? points[index - 1]?.close ?? null : fallbackBase;
  const base = previous ?? point.open ?? null;
  if (base === null || !Number.isFinite(base) || base === 0) {
    return { change: null, changePercent: null, base: null };
  }

  const change = point.close - base;
  return { change, changePercent: (change / base) * 100, base };
}

/* -------------------------------------------------------------------------- */
/*                          盘前 / 盘后时段（分时图）                          */
/* -------------------------------------------------------------------------- */

export interface SessionBand {
  key: "pre" | "post";
  label: string;
  x0: number;
  x1: number;
}

const SESSION_BAND_LABEL: Record<SessionBand["key"], string> = {
  pre: "盘前",
  post: "盘后",
};

/**
 * 把盘前 / 盘后时间范围换算成图上的横向区间（用于绘制阴影与标签）。
 * `pad` 是半根 K 线的宽度，避免阴影把首尾柱体切掉。
 */
export function buildSessionBands(
  sessions: ChartSessions | undefined,
  points: { t: number }[],
  xFor: (index: number) => number,
  pad = 0,
): SessionBand[] {
  if (!sessions || points.length === 0) return [];

  const bands: SessionBand[] = [];

  const add = (key: SessionBand["key"], range?: [number, number] | null) => {
    if (!range) return;
    const [start, end] = range;

    let first = -1;
    let last = -1;
    for (let index = 0; index < points.length; index += 1) {
      const { t } = points[index];
      if (t < start || t > end) continue;
      if (first === -1) first = index;
      last = index;
    }
    if (first === -1 || last === -1) return;

    const x0 = xFor(first) - pad;
    const x1 = xFor(last) + pad;
    if (x1 - x0 < 0.5) return;

    bands.push({ key, label: SESSION_BAND_LABEL[key], x0, x1 });
  };

  add("pre", sessions.pre);
  add("post", sessions.post);
  return bands;
}

/** 判断某个时间点属于盘前 / 常规 / 盘后，用于淡化扩展时段的 K 线 */
export function sessionOfTime(
  t: number,
  sessions: ChartSessions | undefined,
): "pre" | "regular" | "post" {
  if (!sessions) return "regular";
  const inRange = (range?: [number, number] | null) =>
    Boolean(range && t >= range[0] && t <= range[1]);

  if (inRange(sessions.pre)) return "pre";
  if (inRange(sessions.post)) return "post";
  return "regular";
}

/* -------------------------------------------------------------------------- */
/*                            图表缩放（滚轮 / 视窗）                          */
/* -------------------------------------------------------------------------- */

export interface ZoomWindow {
  /** 可视区间起始下标（含） */
  start: number;
  /** 可视区间结束下标（含） */
  end: number;
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** 全量区间（未缩放） */
export function fullWindow(total: number): ZoomWindow {
  return { start: 0, end: Math.max(0, total - 1) };
}

/**
 * 以指针位置为锚点缩放视窗。
 *
 * - `pointerRatio`：指针在绘图区里的横向比例（0 = 最左，1 = 最右）
 * - `deltaY < 0`（向上滚）= 放大（可视点数变少）；反之缩小
 * - 可视点数限制在 [minSpan, total-1]，并且不会移出数据范围
 */
export function zoomViewport(
  current: ZoomWindow,
  total: number,
  pointerRatio: number,
  deltaY: number,
  minSpan = 12,
): ZoomWindow {
  const maxSpan = Math.max(1, total - 1);
  if (maxSpan <= 1) return fullWindow(total);

  const ratio = clampNumber(pointerRatio, 0, 1);
  const span = clampNumber(current.end - current.start, 1, maxSpan);
  // 一格滚轮约 100；触控板会给出更小的值，这里按步数叠加，最多一次 4 步
  const steps = clampNumber(Math.abs(deltaY) / 100, 1, 4);
  const factor = Math.pow(deltaY < 0 ? 0.82 : 1.22, steps);
  const lowestSpan = Math.min(Math.max(minSpan, 1), maxSpan);
  const nextSpan = clampNumber(span * factor, lowestSpan, maxSpan);

  // 锚点处的数据下标在缩放前后保持在同一横向位置
  const anchor = current.start + ratio * span;
  const start = clampNumber(anchor - ratio * nextSpan, 0, Math.max(0, maxSpan - nextSpan));

  return { start: Math.round(start), end: Math.round(start + nextSpan) };
}

/** 平移视窗（shift + 滚轮 / 拖动），保持跨度不变 */
export function panViewport(
  current: ZoomWindow,
  total: number,
  deltaRatio: number,
): ZoomWindow {
  const maxSpan = Math.max(1, total - 1);
  const span = clampNumber(current.end - current.start, 1, maxSpan);
  const start = clampNumber(current.start + deltaRatio * span, 0, Math.max(0, maxSpan - span));
  return { start: Math.round(start), end: Math.round(start + span) };
}

/** 把视窗夹回有效范围（数据点变少时用） */
export function clampViewport(current: ZoomWindow, total: number, minSpan = 12): ZoomWindow {
  const maxSpan = Math.max(1, total - 1);
  const span = clampNumber(current.end - current.start, Math.min(minSpan, maxSpan), maxSpan);
  const start = clampNumber(current.start, 0, Math.max(0, maxSpan - span));
  return { start: Math.round(start), end: Math.round(start + span) };
}
