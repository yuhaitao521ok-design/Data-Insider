/** 回测用的补充指标（stochastic / williams / CCI / ADX / TRIX / PPO / ROC / ATR / Keltner） */

import type { ChartPoint } from "@/lib/types";

const closes = (points: ChartPoint[]) => points.map((point) => point.close);
const highs = (points: ChartPoint[]) => points.map((point) => point.high ?? point.close);
const lows = (points: ChartPoint[]) => points.map((point) => point.low ?? point.close);

/** 简单移动平均 */
export function smaSeries(values: number[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return output;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) output[index] = sum / period;
  }
  return output;
}

/** 指数移动平均（用前 period 个 SMA 初始化） */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return output;
  const k = 2 / (period + 1);
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = previous;
  for (let index = period; index < values.length; index += 1) {
    previous = values[index] * k + previous * (1 - k);
    output[index] = previous;
  }
  return output;
}

/** 平均真实波幅 */
export function atrSeries(points: ChartPoint[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(points.length).fill(null);
  const h = highs(points);
  const l = lows(points);
  const c = closes(points);
  const ranges: number[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = index > 0 ? c[index - 1] : c[index];
    ranges.push(Math.max(h[index] - l[index], Math.abs(h[index] - previous), Math.abs(l[index] - previous)));
  }

  let sum = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    sum += ranges[index];
    if (index >= period) sum -= ranges[index - period];
    if (index >= period - 1) output[index] = sum / period;
  }
  return output;
}

/** 随机指标 %K */
export function stochasticK(points: ChartPoint[], period: number): (number | null)[] {
  const h = highs(points);
  const l = lows(points);
  const c = closes(points);
  return points.map((_, index) => {
    if (index < period - 1) return null;
    const windowHigh = Math.max(...h.slice(index - period + 1, index + 1));
    const windowLow = Math.min(...l.slice(index - period + 1, index + 1));
    const span = windowHigh - windowLow;
    if (span <= 0) return 50;
    return ((c[index] - windowLow) / span) * 100;
  });
}

/** 威廉指标 %R（-100 ~ 0） */
export function williamsR(points: ChartPoint[], period: number): (number | null)[] {
  return stochasticK(points, period).map((value) => (value === null ? null : value - 100));
}

/** 顺势指标 CCI */
export function cciSeries(points: ChartPoint[], period: number): (number | null)[] {
  const typical = points.map((point) => ((point.high ?? point.close) + (point.low ?? point.close) + point.close) / 3);
  const mean = smaSeries(typical, period);
  return points.map((_, index) => {
    const avg = mean[index];
    if (avg === null) return null;
    let deviation = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      deviation += Math.abs(typical[cursor] - avg);
    }
    const meanDeviation = deviation / period;
    if (meanDeviation <= 0) return 0;
    return (typical[index] - avg) / (0.015 * meanDeviation);
  });
}

export interface AdxResult {
  adx: (number | null)[];
  plusDi: (number | null)[];
  minusDi: (number | null)[];
}

/** 平均趋向指标 ADX（Wilder 平滑） */
export function adxSeries(points: ChartPoint[], period: number): AdxResult {
  const length = points.length;
  const h = highs(points);
  const l = lows(points);
  const plusDm: number[] = new Array(length).fill(0);
  const minusDm: number[] = new Array(length).fill(0);
  const tr: number[] = new Array(length).fill(0);

  for (let index = 1; index < length; index += 1) {
    const upMove = h[index] - h[index - 1];
    const downMove = l[index - 1] - l[index];
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[index] = Math.max(h[index] - l[index], Math.abs(h[index] - points[index - 1].close), Math.abs(l[index] - points[index - 1].close));
  }

  const smooth = (values: number[]) => {
    const output: (number | null)[] = new Array(length).fill(null);
    let sum = 0;
    for (let index = 1; index < Math.min(values.length, period + 1); index += 1) sum += values[index];
    if (period < values.length) output[period] = sum;
    for (let index = period + 1; index < values.length; index += 1) {
      sum = sum - sum / period + values[index];
      output[index] = sum;
    }
    return output;
  };

  const trSmooth = smooth(tr);
  const plusSmooth = smooth(plusDm);
  const minusSmooth = smooth(minusDm);

  const plusDi: (number | null)[] = new Array(length).fill(null);
  const minusDi: (number | null)[] = new Array(length).fill(null);
  const dx: number[] = new Array(length).fill(0);

  for (let index = 0; index < length; index += 1) {
    const t = trSmooth[index];
    const p = plusSmooth[index];
    const m = minusSmooth[index];
    if (t === null || p === null || m === null || t <= 0) continue;
    plusDi[index] = (p / t) * 100;
    minusDi[index] = (m / t) * 100;
    const sum = (plusDi[index] ?? 0) + (minusDi[index] ?? 0);
    dx[index] = sum > 0 ? (Math.abs((plusDi[index] ?? 0) - (minusDi[index] ?? 0)) / sum) * 100 : 0;
  }

  const adx: (number | null)[] = new Array(length).fill(null);
  let accumulator = 0;
  for (let index = 0; index < length; index += 1) {
    if (plusDi[index] === null) continue;
    accumulator += dx[index];
    if (index >= period && plusDi[index - period] !== null) accumulator -= dx[index - period];
    if (index >= period * 2 - 1) adx[index] = accumulator / period;
  }

  return { adx, plusDi, minusDi };
}

/** TRIX（三重指数平滑的变化率，%） */
export function trixSeries(values: number[], period: number): (number | null)[] {
  const first = emaSeries(values, period);
  const squeeze = (series: (number | null)[]) => {
    const output: number[] = [];
    const indexMap: number[] = [];
    series.forEach((value, index) => {
      if (value !== null) {
        output.push(value);
        indexMap.push(index);
      }
    });
    return { output, indexMap };
  };

  const s1 = squeeze(first);
  const s2 = squeeze(emaSeries(s1.output, period));
  const s3 = squeeze(emaSeries(s2.output, period));

  const output: (number | null)[] = new Array(values.length).fill(null);
  for (let index = 1; index < s3.output.length; index += 1) {
    const previous = s3.output[index - 1];
    if (previous <= 0) continue;
    const target = s2.indexMap[index];
    output[target] = ((s3.output[index] - previous) / previous) * 100;
  }
  return output;
}

/** PPO（MACD 归一化，%） */
export function ppoSeries(values: number[], fast: number, slow: number, signalPeriod: number) {
  const fastEma = emaSeries(values, fast);
  const slowEma = emaSeries(values, slow);
  const ppo: (number | null)[] = values.map((_, index) => {
    const f = fastEma[index];
    const s = slowEma[index];
    if (f === null || s === null || s <= 0) return null;
    return ((f - s) / s) * 100;
  });
  const compact = ppo.filter((value): value is number => value !== null);
  const signalCompact = emaSeries(compact, signalPeriod);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  let cursor = 0;
  ppo.forEach((value, index) => {
    if (value === null) return;
    signal[index] = signalCompact[cursor] ?? null;
    cursor += 1;
  });
  return { ppo, signal };
}

/** 变动率 ROC（%） */
export function rocSeries(values: number[], period: number): (number | null)[] {
  return values.map((value, index) => {
    if (index < period) return null;
    const previous = values[index - period];
    if (previous <= 0) return null;
    return ((value - previous) / previous) * 100;
  });
}

/** 中间价（高低均值） */
export function hl2(points: ChartPoint[]): number[] {
  return points.map((point) => ((point.high ?? point.close) + (point.low ?? point.close)) / 2);
}

export const priceCloses = closes;
export const priceHighs = highs;
export const priceLows = lows;
