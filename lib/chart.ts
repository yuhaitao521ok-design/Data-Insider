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
