/** 主图蜡烛（K 线）几何计算，抽成纯函数便于测试。 */

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
