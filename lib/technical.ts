import { bollinger, macd, rsi, sma } from "@/lib/indicators";
import { adxSeries, rocSeries } from "@/lib/backtest-indicators";
import { formatNumber, formatPercent } from "@/lib/format";
import type { ChartPoint, ChartMeta } from "@/lib/types";

/**
 * 技术面摘要：多维度打分 + 短期 / 长期双视角。
 *
 * 与图表指标的区别：图表指标是逐点数值（要自己看图判断），这里是固定参数、
 * 自动给出的多空结论；每个维度带「视角归属（短 / 长 / 共同）+ 打分上限」，
 * 短期与长期分别归一化，再合成综合结论，并给出主要依据。
 *
 * 打分纪律：分与色调必须同向（正分 = 看多色调）；信息类维度（BOLL / ATR）
 * 不参与打分，只提供上下文。
 */

export type TechnicalTone = "up" | "down" | "neutral";
export type TechnicalHorizon = "short" | "long" | "both";

export interface TechnicalItem {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone: TechnicalTone;
  /** 该维度归属的视角 */
  horizon: TechnicalHorizon;
  /** 本次打分（正多负空，信息项为 0） */
  points: number;
  /** 打分上限（归一化用，信息项为 0） */
  maxPoints: number;
}

export type Verdict = "bullish" | "neutral" | "bearish";

export interface HorizonView {
  /** -100 ~ 100，正数偏多 */
  score: number;
  verdict: Verdict;
  verdictLabel: string;
  /** 主要依据（按影响力排序，最多 2 条） */
  drivers: string[];
}

export interface TechnicalSummary {
  /** 数据点是否足够做完整判断 */
  enough: boolean;
  items: TechnicalItem[];
  /** 短期（约 1–4 周）看法 */
  shortTerm: HorizonView;
  /** 长期（约 3–6 月）看法 */
  longTerm: HorizonView;
  /** 综合（短长各半） */
  overall: HorizonView;
  /** 兼容旧字段：等于 overall 的分数 / 结论 */
  score: number;
  verdict: Verdict;
  verdictLabel: string;
}

const last = (values: (number | null)[]): number | null => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index];
  }
  return null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const verdictOf = (score: number): Verdict =>
  score >= 25 ? "bullish" : score <= -25 ? "bearish" : "neutral";

const verdictLabelOf = (verdict: Verdict): string =>
  verdict === "bullish" ? "偏多" : verdict === "bearish" ? "偏空" : "中性";

const toneOf = (points: number): TechnicalTone =>
  points > 0 ? "up" : points < 0 ? "down" : "neutral";

/* ------------------------------- 辅助指标 ------------------------------- */

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

/** 区间涨跌幅（%） */
function changePercent(values: number[], period: number): number | null {
  if (values.length <= period) return null;
  const previous = values[values.length - 1 - period];
  const current = values[values.length - 1];
  if (!previous || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** 某一视角的打分汇总：按打分上限归一化，按影响力给出主要依据 */
function summarize(items: TechnicalItem[], horizon: "short" | "long" | "overall"): HorizonView {
  const relevant = items.filter(
    (item) =>
      item.maxPoints > 0 &&
      (horizon === "overall" || item.horizon === horizon || item.horizon === "both"),
  );
  const sum = relevant.reduce((total, item) => total + item.points, 0);
  const max = relevant.reduce((total, item) => total + item.maxPoints, 0);
  const score = max > 0 ? clamp(Math.round((sum / max) * 100), -100, 100) : 0;
  const verdict = verdictOf(score);
  const drivers = relevant
    .filter((item) => item.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 2)
    .map((item) => item.label);
  return { score, verdict, verdictLabel: verdictLabelOf(verdict), drivers };
}

/* ------------------------------ 多维度打分 ------------------------------ */

export function buildTechnicalSummary(
  points: ChartPoint[],
  meta?: Pick<ChartMeta, "week52High" | "week52Low" | "price"> | null,
): TechnicalSummary {
  const closes = points.map((point) => point.close);
  const price = closes[closes.length - 1] ?? 0;

  const items: TechnicalItem[] = [];

  /* ============ 短期（约 1–4 周）============ */
  const ma5 = last(sma(closes, 5));
  const ma20 = last(sma(closes, 20));
  const ma60 = last(sma(closes, 60));

  if (ma5 !== null && ma20 !== null) {
    const spread = ma20 > 0 ? ((ma5 - ma20) / ma20) * 100 : 0;
    const pointsValue = spread >= 1 ? 1.5 : spread <= -1 ? -1.5 : spread > 0 ? 0.75 : spread < 0 ? -0.75 : 0;
    items.push({
      key: "ma-short",
      label: "短期均线",
      value: spread >= 1 ? "MA5 上穿 MA20" : spread <= -1 ? "MA5 下穿 MA20" : spread >= 0 ? "MA5 略高" : "MA5 略低",
      hint: `MA5 ${formatNumber(ma5, 2)} · MA20 ${formatNumber(ma20, 2)}`,
      tone: toneOf(pointsValue),
      horizon: "short",
      points: pointsValue,
      maxPoints: 1.5,
    });
  }

  const rsi14 = last(rsi(closes, 14));
  if (rsi14 !== null) {
    const pointsValue = rsi14 >= 55 ? 1.5 : rsi14 <= 45 ? -1.5 : 0;
    const zone = rsi14 >= 70 ? "超买" : rsi14 <= 30 ? "超卖" : rsi14 >= 55 ? "偏强" : rsi14 <= 45 ? "偏弱" : "中性";
    items.push({
      key: "rsi",
      label: "RSI 动量",
      value: `${formatNumber(rsi14, 1)} ${zone}`,
      hint:
        rsi14 >= 70
          ? "动能强但已超买，注意回调风险"
          : rsi14 <= 30
            ? "动能弱但已超卖，关注反弹机会"
            : "55 以上偏强、45 以下偏弱",
      tone: toneOf(pointsValue),
      horizon: "short",
      points: pointsValue,
      maxPoints: 1.5,
    });
  }

  const roc20 = last(rocSeries(closes, 20));
  if (roc20 !== null) {
    const pointsValue = roc20 >= 2 ? 1 : roc20 <= -2 ? -1 : 0;
    items.push({
      key: "roc-short",
      label: "短期动量",
      value: `${roc20 > 0 ? "+" : ""}${formatNumber(roc20, 1)}% / 20日`,
      hint: "近 20 根涨跌幅，±2% 以上算明显",
      tone: toneOf(pointsValue),
      horizon: "short",
      points: pointsValue,
      maxPoints: 1,
    });
  }

  const ratio = volumeRatio(points);
  const streak = closeStreak(points);
  const todayUp = closes.length >= 2 && price > closes[closes.length - 2];
  if (ratio !== null) {
    const active = ratio >= 1.2;
    const pointsValue = active ? (todayUp ? 1 : -1) : 0;
    items.push({
      key: "volume",
      label: "量能配合",
      value: `${formatNumber(ratio, 2)}× 20日均量`,
      hint: active ? (todayUp ? "放量上行，量价配合" : "放量下行，抛压明显") : ratio <= 0.8 ? "缩量观望" : "量能平稳",
      tone: toneOf(pointsValue),
      horizon: "short",
      points: pointsValue,
      maxPoints: 1,
    });
  }

  if (Math.abs(streak) >= 3) {
    const pointsValue = streak > 0 ? 0.5 : -0.5;
    items.push({
      key: "streak",
      label: "连涨连跌",
      value: `${Math.abs(streak)} 连${streak > 0 ? "涨" : "跌"}`,
      hint: streak > 0 ? "短期动能偏强，注意追高风险" : "短期动能偏弱，可能超跌",
      tone: toneOf(pointsValue),
      horizon: "short",
      points: pointsValue,
      maxPoints: 0.5,
    });
  }

  /* ============ 长期（约 3–6 月）============ */
  if (ma20 !== null && ma60 !== null) {
    const spread = ma60 > 0 ? ((ma20 - ma60) / ma60) * 100 : 0;
    const pointsValue = spread >= 1 ? 1.5 : spread <= -1 ? -1.5 : spread > 0 ? 0.75 : spread < 0 ? -0.75 : 0;
    items.push({
      key: "ma-long",
      label: "长期均线",
      value: spread >= 1 ? "MA20 上穿 MA60" : spread <= -1 ? "MA20 下穿 MA60" : spread >= 0 ? "MA20 略高" : "MA20 略低",
      hint: `MA20 ${formatNumber(ma20, 2)} · MA60 ${formatNumber(ma60, 2)}`,
      tone: toneOf(pointsValue),
      horizon: "long",
      points: pointsValue,
      maxPoints: 1.5,
    });
  }

  const macdResult = macd(closes, 12, 26, 9);
  const dif = last(macdResult.macd);
  const dea = last(macdResult.signal);
  if (dif !== null && dea !== null) {
    const hist = dif - dea;
    const pointsValue = dif > dea ? (hist > 0 ? 1.5 : 0.75) : hist < 0 ? -1.5 : -0.75;
    items.push({
      key: "macd",
      label: "MACD",
      value: dif > dea ? (hist > 0 ? "金叉且柱体放大" : "金叉但柱体收敛") : hist < 0 ? "死叉且柱体放大" : "死叉但柱体收敛",
      hint: `DIF ${formatNumber(dif, 2)} · DEA ${formatNumber(dea, 2)}`,
      tone: toneOf(pointsValue),
      horizon: "long",
      points: pointsValue,
      maxPoints: 1.5,
    });
  }

  const adx = adxSeries(points, 14);
  const adxValue = last(adx.adx);
  const plusDi = last(adx.plusDi);
  const minusDi = last(adx.minusDi);
  if (adxValue !== null && plusDi !== null && minusDi !== null) {
    const up = plusDi > minusDi;
    const pointsValue = adxValue >= 25 ? (up ? 1 : -1) : adxValue < 20 ? 0 : up ? 0.5 : -0.5;
    items.push({
      key: "adx",
      label: "趋势强度",
      value: `ADX ${formatNumber(adxValue, 1)}`,
      hint: adxValue >= 25 ? (up ? "趋势明确且向上" : "趋势明确且向下") : adxValue < 20 ? "趋势不明，震荡为主" : "趋势初起",
      tone: toneOf(pointsValue),
      horizon: "long",
      points: pointsValue,
      maxPoints: 1,
    });
  }

  const roc120 = last(rocSeries(closes, 120));
  if (roc120 !== null) {
    const pointsValue =
      roc120 >= 10 ? 1.5 : roc120 >= 3 ? 0.75 : roc120 <= -10 ? -1.5 : roc120 <= -3 ? -0.75 : 0;
    items.push({
      key: "roc-long",
      label: "长期动量",
      value: `${roc120 > 0 ? "+" : ""}${formatNumber(roc120, 1)}% / 120日`,
      hint: "近 120 根涨跌幅，长线强弱一目了然",
      tone: toneOf(pointsValue),
      horizon: "long",
      points: pointsValue,
      maxPoints: 1.5,
    });
  }

  const high = meta?.week52High ?? null;
  const low = meta?.week52Low ?? null;
  if (high !== null && low !== null && high > low) {
    const fromHigh = ((price - high) / high) * 100;
    const fromLow = ((price - low) / low) * 100;
    const pointsValue = fromHigh >= -3 ? 0.75 : fromLow <= 3 ? -0.75 : 0;
    items.push({
      key: "range",
      label: "52 周位置",
      value: `距高 ${formatPercent(fromHigh, 1)}`,
      hint: `距低 ${formatPercent(fromLow, 1)}${fromHigh >= -3 ? "，强势区" : fromLow <= 3 ? "，弱势区" : ""}`,
      tone: toneOf(pointsValue),
      horizon: "long",
      points: pointsValue,
      maxPoints: 0.75,
    });
  }

  /* ============ 信息项（不打分）============ */
  const bands = bollinger(closes, 20, 2);
  const upper = last(bands.upper);
  const lower = last(bands.lower);
  if (upper !== null && lower !== null && upper > lower) {
    const position = clamp(((price - lower) / (upper - lower)) * 100, 0, 100);
    const bandwidth = ((upper - lower) / ((upper + lower) / 2)) * 100;
    items.push({
      key: "boll",
      label: "BOLL 位置",
      value: `${formatNumber(position, 0)}% ${position >= 80 ? "上轨附近" : position >= 50 ? "中轨上方" : position >= 20 ? "中轨下方" : "下轨附近"}`,
      hint: `带宽 ${formatPercent(bandwidth, 1)}（越宽波动越大）`,
      tone: position >= 80 ? "up" : position <= 20 ? "down" : "neutral",
      horizon: "both",
      points: 0,
      maxPoints: 0,
    });
  }

  const atr = atrPercent(points);
  if (atr !== null) {
    items.push({
      key: "atr",
      label: "波动 ATR",
      value: formatPercent(atr, 2),
      hint: atr >= 4 ? "波动偏大，注意仓位" : "波动温和",
      tone: atr >= 4 ? "down" : "neutral",
      horizon: "both",
      points: 0,
      maxPoints: 0,
    });
  }

  if (points.length < 60) {
    return {
      enough: false,
      items,
      shortTerm: summarize(items, "short"),
      longTerm: summarize(items, "long"),
      overall: summarize(items, "overall"),
      score: 0,
      verdict: "neutral",
      verdictLabel: "数据不足",
    };
  }

  const shortTerm = summarize(items, "short");
  const longTerm = summarize(items, "long");
  const overallScore = clamp(
    Math.round((shortTerm.score + longTerm.score) / 2),
    -100,
    100,
  );
  const overallVerdict = verdictOf(overallScore);
  const drivers = [...shortTerm.drivers, ...longTerm.drivers].slice(0, 2);
  const overall: HorizonView = {
    score: overallScore,
    verdict: overallVerdict,
    verdictLabel: verdictLabelOf(overallVerdict),
    drivers,
  };

  return {
    enough: true,
    items,
    shortTerm,
    longTerm,
    overall,
    score: overall.score,
    verdict: overall.verdict,
    verdictLabel: overall.verdictLabel,
  };
}
