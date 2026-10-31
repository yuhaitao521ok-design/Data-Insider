import { bollinger, rsi, sma } from "@/lib/indicators";
import { formatNumber, formatPercent } from "@/lib/format";
import type { ChartPoint, ChartMeta } from "@/lib/types";

/**
 * 技术面摘要：把图里的均线 / RSI / BOLL / 量能 / 波动率 / 位置做成「一句结论 + 几行状态」。
 *
 * 与图表指标的区别：图表指标是逐点数值（要自己看图判断），这里是默认固定参数、
 * 自动给出的多空结论，并且包含指标菜单里没有的 ATR、量比、连涨天数、距 52 周高低。
 */

export type TechnicalTone = "up" | "down" | "neutral";

export interface TechnicalItem {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone: TechnicalTone;
}

export interface TechnicalSummary {
  verdict: "bullish" | "neutral" | "bearish";
  verdictLabel: string;
  /** -100 ~ 100，正数偏多 */
  score: number;
  items: TechnicalItem[];
  /** 数据点是否足够做完整判断（≥ 20 根） */
  enough: boolean;
}

const last = (values: (number | null)[]): number | null => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index];
  }
  return null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 平均真实波幅（ATR，用收盘价归一化为百分比） */
export function atrPercent(points: ChartPoint[], period = 14): number | null {
  if (points.length < period + 1) return null;

  let sum = 0;
  const start = points.length - period;
  for (let index = start; index < points.length; index += 1) {
    const current = points[index];
    const previousClose = points[index - 1]?.close ?? current.close;
    const high = current.high ?? current.close;
    const low = current.low ?? current.close;
    const range = Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
    sum += range;
  }

  const atr = sum / period;
  const price = points[points.length - 1].close;
  return price > 0 ? (atr / price) * 100 : null;
}

/** 量比：最后一根成交量 / 之前 N 根的均量 */
export function volumeRatio(points: ChartPoint[], period = 20): number | null {
  if (points.length < 3) return null;

  const lastPoint = points[points.length - 1];
  const history = points.slice(Math.max(0, points.length - 1 - period), points.length - 1);
  const volumes = history
    .map((point) => point.volume)
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (volumes.length < 3 || !lastPoint.volume || lastPoint.volume <= 0) return null;

  const average = volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
  return average > 0 ? lastPoint.volume / average : null;
}

/** 连续上涨 / 下跌根数（正数=连涨，负数=连跌，0=无连续） */
export function closeStreak(points: ChartPoint[]): number {
  if (points.length < 3) return 0;

  let streak = 0;
  for (let index = points.length - 1; index > 0; index -= 1) {
    const diff = points[index].close - points[index - 1].close;
    if (diff === 0) break;

    const direction = diff > 0 ? 1 : -1;
    if (streak === 0) streak = direction;
    else if (Math.sign(streak) !== direction) break;
    else streak += direction;
  }
  return streak;
}

export function buildTechnicalSummary(
  points: ChartPoint[],
  meta?: Pick<ChartMeta, "week52High" | "week52Low" | "price"> | null,
): TechnicalSummary {
  if (points.length < 20) {
    return { verdict: "neutral", verdictLabel: "数据不足", score: 0, enough: false, items: [] };
  }

  const closes = points.map((point) => point.close);
  const price = closes[closes.length - 1];

  const ma5 = last(sma(closes, 5));
  const ma20 = last(sma(closes, 20));
  const ma60 = last(sma(closes, 60));
  const rsi14 = last(rsi(closes, 14));
  const bands = bollinger(closes, 20, 2);
  const upper = last(bands.upper);
  const lower = last(bands.lower);
  const ratio = volumeRatio(points);
  const atr = atrPercent(points);
  const streak = closeStreak(points);

  let score = 0;
  const items: TechnicalItem[] = [];

  /* ------------------------------- 均线排列 ------------------------------- */
  if (ma5 !== null && ma20 !== null && ma60 !== null) {
    const bullish = ma5 > ma20 && ma20 > ma60;
    const bearish = ma5 < ma20 && ma20 < ma60;
    score += bullish ? 2 : bearish ? -2 : 0;
    items.push({
      key: "ma",
      label: "均线",
      value: bullish ? "多头排列" : bearish ? "空头排列" : price >= ma20 ? "价格在 MA20 上方" : "价格在 MA20 下方",
      hint: `MA5 ${formatNumber(ma5, 2)} · MA20 ${formatNumber(ma20, 2)} · MA60 ${formatNumber(ma60, 2)}`,
      tone: bullish ? "up" : bearish ? "down" : price >= ma20 ? "up" : "down",
    });
  } else if (ma20 !== null) {
    const above = price >= ma20;
    score += above ? 0.5 : -0.5;
    items.push({
      key: "ma",
      label: "均线",
      value: above ? "价格在 MA20 上方" : "价格在 MA20 下方",
      hint: `MA20 ${formatNumber(ma20, 2)}（MA60 需要更多数据点）`,
      tone: above ? "up" : "down",
    });
  }

  /* --------------------------------- RSI --------------------------------- */
  if (rsi14 !== null) {
    const overbought = rsi14 >= 70;
    const oversold = rsi14 <= 30;
    const strong = rsi14 >= 55;
    const weak = rsi14 <= 45;
    score += overbought ? 0.5 : oversold ? -0.5 : strong ? 1.5 : weak ? -1.5 : 0;
    items.push({
      key: "rsi",
      label: "RSI(14)",
      value: `${formatNumber(rsi14, 1)} ${overbought ? "超买" : oversold ? "超卖" : strong ? "偏强" : weak ? "偏弱" : "中性"}`,
      hint: overbought ? "≥70，注意回调风险" : oversold ? "≤30，关注反弹" : "40–70 为常态区间",
      tone: overbought ? "down" : oversold ? "up" : strong ? "up" : weak ? "down" : "neutral",
    });
  }

  /* -------------------------------- BOLL -------------------------------- */
  if (upper !== null && lower !== null && upper > lower) {
    const position = clamp(((price - lower) / (upper - lower)) * 100, 0, 100);
    const bandwidth = ((upper - lower) / ((upper + lower) / 2)) * 100;
    score += position >= 80 ? 1 : position >= 50 ? 0.5 : position >= 20 ? -0.5 : -1;
    items.push({
      key: "boll",
      label: "BOLL 位置",
      value: `${formatNumber(position, 0)}% ${position >= 80 ? "上轨附近" : position >= 50 ? "中轨上方" : position >= 20 ? "中轨下方" : "下轨附近"}`,
      hint: `带宽 ${formatPercent(bandwidth, 1)}（越宽波动越大）`,
      tone: position >= 50 ? "up" : "down",
    });
  }

  /* -------------------------------- 量能 -------------------------------- */
  if (ratio !== null) {
    items.push({
      key: "volume",
      label: "量能",
      value: `${formatNumber(ratio, 2)}× 20 日均量`,
      hint: ratio >= 1.2 ? "放量" : ratio <= 0.8 ? "缩量" : "量能平稳",
      tone: "neutral",
    });
  }

  /* ------------------------------- 波动率 ------------------------------- */
  if (atr !== null) {
    items.push({
      key: "atr",
      label: "波动 ATR",
      value: formatPercent(atr, 2),
      hint: "近 14 根平均真实波幅（占价格）",
      tone: atr >= 4 ? "down" : "neutral",
    });
  }

  /* ------------------------------ 52 周位置 ------------------------------ */
  const high = meta?.week52High ?? null;
  const low = meta?.week52Low ?? null;
  if (high !== null && low !== null && high > low) {
    const fromHigh = ((price - high) / high) * 100;
    const fromLow = ((price - low) / low) * 100;
    if (fromHigh >= -3) score += 0.5;
    else if (fromLow <= 3) score -= 0.5;
    items.push({
      key: "range",
      label: "52 周位置",
      value: `距高 ${formatPercent(fromHigh, 1)}`,
      hint: `距低 ${formatPercent(fromLow, 1)}`,
      tone: fromHigh >= -3 ? "up" : fromLow <= 3 ? "down" : "neutral",
    });
  }

  /* ------------------------------- 连涨连跌 ------------------------------ */
  if (Math.abs(streak) >= 2) {
    items.push({
      key: "streak",
      label: "连续",
      value: `${Math.abs(streak)} 连${streak > 0 ? "涨" : "跌"}`,
      hint: streak > 0 ? "短期动能偏强" : "短期动能偏弱",
      tone: streak > 0 ? "up" : "down",
    });
  }

  const normalized = clamp(Math.round((score / 5) * 100), -100, 100);
  const verdict = normalized >= 25 ? "bullish" : normalized <= -25 ? "bearish" : "neutral";

  return {
    verdict,
    verdictLabel: verdict === "bullish" ? "偏多" : verdict === "bearish" ? "偏空" : "中性",
    score: normalized,
    items,
    enough: true,
  };
}
