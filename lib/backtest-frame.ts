/**
 * 回测口径（区间 + K 线周期）。
 *
 * 回测用哪根线，直接决定了信号频率与统计口径：
 *  - 日线（1d）是最常见的默认值：数据最完整、噪音可控，贴近「按天看盘」的中长线持仓；
 *  - 周线 / 月线适合 5 年以上的长周期配置，交易次数少、手续费占比低，但信号更滞后；
 *  - 小时线（60m）只适合 3–6 个月的短线研究：Yahoo 只提供约 730 天，噪音更大，
 *    且本回测没有滑点模型，结论仅供参考；
 *  - 分钟线不做回测支持（噪音与滑点会完全盖过策略本身）。
 */

import {
  RANGE_CONFIG,
  RANGE_INTERVALS,
  type IntervalKey,
  type RangeKey,
} from "@/lib/types";

/** 回测可选区间（从短到长） */
export const BACKTEST_RANGES: RangeKey[] = ["3M", "6M", "1Y", "5Y", "MAX"];

/** 回测可选的 K 线周期（分钟线噪音过大，不开放） */
export const BACKTEST_INTERVAL_CANDIDATES: IntervalKey[] = ["60m", "1d", "1wk", "1mo"];

/** 少于这个根数，指标还没走完一轮，回测结论没有意义（引擎本身要求 >= 30 根） */
export const MIN_BACKTEST_BARS = 40;

/** 每根 K 线代表多少「年」，用于年化收益 / 夏普换算（按美股 252 个交易日、6.5 小时交易时段） */
export const BARS_PER_YEAR: Record<IntervalKey, number> = {
  "1m": 252 * 390,
  "2m": 252 * 195,
  "5m": 252 * 78,
  "15m": 252 * 26,
  "30m": 252 * 13,
  "60m": 252 * 6.5,
  "90m": 252 * 4.33,
  "1d": 252,
  "5d": 50.4,
  "1wk": 52,
  "1mo": 12,
  "3mo": 4,
};

/** 各区间大约覆盖多少年（MAX 按 15 年估算，足够判断月线是否可用） */
const RANGE_YEARS: Record<RangeKey, number> = {
  "1D": 1 / 252,
  "5D": 5 / 252,
  "1M": 1 / 12,
  "3M": 0.25,
  "6M": 0.5,
  "1Y": 1,
  "5Y": 5,
  MAX: 15,
};

export function barsPerYear(interval: IntervalKey): number {
  return BARS_PER_YEAR[interval] ?? 252;
}

/** 粗略估算某个区间 + 周期能拿到多少根 K 线（用于过滤掉明显不足的组合） */
export function estimateBars(range: RangeKey, interval: IntervalKey): number {
  return Math.round((RANGE_YEARS[range] ?? 1) * barsPerYear(interval));
}

/** 该区间下可用的回测周期：数据源允许 + K 线根数足够 */
export function intervalsForBacktest(range: RangeKey): IntervalKey[] {
  const allowed = RANGE_INTERVALS[range] ?? ["1d"];
  const usable = BACKTEST_INTERVAL_CANDIDATES.filter(
    (interval) =>
      allowed.includes(interval) && estimateBars(range, interval) >= MIN_BACKTEST_BARS,
  );
  return usable.length > 0 ? usable : ["1d"];
}

/** 默认用日线；日线不可用时退到最细的可用周期 */
export function defaultBacktestInterval(range: RangeKey): IntervalKey {
  const usable = intervalsForBacktest(range);
  return usable.includes("1d") ? "1d" : usable[0];
}

/** 区间 + 周期的中文标签，例如「5年 · 日线」 */
export function backtestFrameLabel(range: RangeKey, interval: IntervalKey): string {
  return `${RANGE_CONFIG[range].label} · ${INTERVAL_LABELS[interval] ?? interval}`;
}

/** 周期标签（避免在 lib 里依赖 i18n 的 t()，界面渲染时再走翻译） */
const INTERVAL_LABELS: Record<string, string> = {
  "60m": "小时线",
  "1d": "日线",
  "1wk": "周线",
  "1mo": "月线",
};
