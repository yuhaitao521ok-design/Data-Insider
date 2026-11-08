import type { ChartPoint, IntervalKey } from "@/lib/types";

/** 回测引擎：多策略（见 backtest-catalog）自由组合，全部本地计算。 */

import {
  STRATEGIES,
  STRATEGY_MAP,
  type StrategyMeta,
  type StrategyParams,
} from "@/lib/backtest-catalog";
import { barsPerYear } from "@/lib/backtest-frame";

export const STRATEGY_KEYS = STRATEGIES.map((item) => item.key);
export type StrategyKey = string;

/** 多策略联动方式：any = 任一给出买入即持有；all = 全部看多才持有 */
export type CombineMode = "any" | "all";

export { STRATEGIES };

export interface BacktestParams {
  /** 启用的策略（至少一个） */
  strategies: StrategyKey[];
  combineMode: CombineMode;
  /** 初始资金（美元） */
  initialCapital: number;
  /** MA / EMA 快线 */
  fast: number;
  /** MA / EMA 慢线、RSI 周期、BOLL 周期、Donchian 回看 */
  slow: number;
  /** RSI 超卖 */
  oversold: number;
  /** RSI 超买 */
  overbought: number;
  /** BOLL 标准差倍数 */
  multiplier: number;
  /** MACD 信号周期 */
  signal: number;
  /** Donchian 出场回看（跌破 N 日最低） */
  exitLookback: number;
  /** 动量 / ADX / 反弹等阈值 */
  threshold: number;
  /** 手续费，单位 bp（万分之） */
  feeBps: number;
}

export const DEFAULT_PARAMS: BacktestParams = {
  strategies: ["ma-cross"],
  combineMode: "any",
  initialCapital: 10_000,
  fast: 10,
  slow: 30,
  oversold: 30,
  overbought: 70,
  multiplier: 2,
  signal: 9,
  exitLookback: 10,
  threshold: 25,
  feeBps: 5,
};

export interface Trade {
  entryDate: number;
  entryPrice: number;
  exitDate: number;
  exitPrice: number;
  /** 买入股数 */
  shares: number;
  /** 盈亏金额（已扣手续费） */
  pnl: number;
  /** 百分比 */
  pnlPercent: number;
  /** 持有天数（自然日，与所选 K 线周期无关） */
  days: number;
  /** 持有多少根 K 线 */
  bars: number;
  /** 出场原因（展示用） */
  reason: string;
  /** 触发离场的策略标签（多策略联动时可能多个） */
  reasonLabels: string[];
}

export interface BacktestResult {
  /** 策略净值（金额） */
  equity: { t: number; value: number }[];
  /** 买入持有净值（金额） */
  benchmark: { t: number; value: number }[];
  /** 标的收盘价（用于叠加价格轴） */
  price: { t: number; value: number }[];
  /** 回撤序列（百分比，<= 0），与净值同长，用于水下图 */
  drawdown: { t: number; value: number }[];
  trades: Trade[];
  stats: {
    initialCapital: number;
    finalValue: number | null;
    profit: number | null;
    totalReturn: number | null;
    benchmarkReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    /** 最长回撤持续天数（峰值到收复，自然日） */
    maxDrawdownDays: number | null;
    sharpe: number | null;
    winRate: number | null;
    tradeCount: number;
    avgDays: number | null;
    exposure: number | null;
  };
}

/**
 * 合并策略参数：策略自带 defaults 时，若用户仍停留在全局默认值，
 * 则用策略自己的建议值；用户改过（!= 全局默认）则尊重用户输入。
 * 这让「绝对动量」「连跌反转」这类阈值语义不同的策略在默认参数下也能正常触发。
 */
export function resolveStrategyParams(
  meta: StrategyMeta,
  params: BacktestParams,
): StrategyParams {
  const base = toStrategyParams(params);
  if (!meta.defaults) return base;
  const resolved = { ...base };
  for (const [key, value] of Object.entries(meta.defaults)) {
    if (typeof value !== "number") continue;
    const paramKey = key as keyof BacktestParams;
    const userValue = params[paramKey] as number;
    const globalDefault = DEFAULT_PARAMS[paramKey] as number;
    if (userValue === globalDefault) {
      resolved[key as keyof StrategyParams] = value;
    }
  }
  return resolved;
}

/** 各策略在当前数据上的「看多占比」（帮助理解联动效果与参数是否合理） */
export function computeSignalDuties(
  points: ChartPoint[],
  params: BacktestParams,
): { key: string; label: string; duty: number }[] {
  const enabled = params.strategies.length > 0 ? params.strategies : ["ma-cross"];
  return enabled.flatMap((key) => {
    const meta = STRATEGY_MAP[key];
    if (!meta || points.length === 0) return [];
    const signal = meta.signal(points, resolveStrategyParams(meta, params));
    const duty = signal.reduce((sum, value) => sum + value, 0) / signal.length;
    return [{ key: meta.key, label: meta.label, duty }];
  });
}

export interface SignalSeries {
  key: string;
  label: string;
  series: number[];
}

/** 每个策略各自的信号序列（用于组合 + 出场归因） */
export function buildSignalMatrix(points: ChartPoint[], params: BacktestParams): SignalSeries[] {
  const enabled = params.strategies.length > 0 ? params.strategies : ["ma-cross"];
  return enabled.flatMap((key) => {
    const meta = STRATEGY_MAP[key];
    if (!meta) return [];
    return [
      {
        key: meta.key,
        label: strategyLabel(meta.key),
        series: meta.signal(points, resolveStrategyParams(meta, params)),
      },
    ];
  });
}

/** 组合策略信号：any = 并集（任一策略看多即持有），all = 交集（全部看多才持有） */
export function buildSignals(points: ChartPoint[], params: BacktestParams): number[] {
  const matrix = buildSignalMatrix(points, params);
  if (matrix.length === 0) return new Array(points.length).fill(0);
  if (matrix.length === 1) return matrix[0].series;

  return points.map((_, index) => {
    if (params.combineMode === "all") {
      return matrix.every((item) => item.series[index] === 1) ? 1 : 0;
    }
    return matrix.some((item) => item.series[index] === 1) ? 1 : 0;
  });
}

/**
 * 出场归因：在 `index` 这根 K 线离场时，是哪些策略导致的。
 *  - 单策略：该策略本身
 *  - all（全部共振）：出场时仍看空的策略 = 破坏共振的人
 *  - any（任一信号）：这一根刚刚由多转空的策略 = 直接触发离场的人
 */
export function exitReasonFor(
  matrix: SignalSeries[],
  index: number,
  combineMode: CombineMode,
): string[] {
  if (matrix.length === 0) return [];
  if (matrix.length === 1) return [matrix[0].label];

  if (combineMode === "all") {
    const bearish = matrix.filter((item) => item.series[index] !== 1).map((item) => item.label);
    return bearish.length > 0 ? bearish : matrix.map((item) => item.label);
  }

  const flipped = matrix
    .filter((item) => index > 0 && item.series[index - 1] === 1 && item.series[index] === 0)
    .map((item) => item.label);
  if (flipped.length > 0) return flipped;
  // 理论少见：这一根没有策略翻空却离场（数据缺口等），退化为“全部转空”
  return matrix.map((item) => item.label);
}

function toStrategyParams(params: BacktestParams) {
  return {
    fast: params.fast,
    slow: params.slow,
    oversold: params.oversold,
    overbought: params.overbought,
    multiplier: params.multiplier,
    signal: params.signal,
    exitLookback: params.exitLookback,
    threshold: params.threshold,
  };
}

export function strategyLabel(key: StrategyKey): string {
  return STRATEGY_MAP[key]?.label ?? key;
}

/** 出场原因展示：最多列 2 个策略，多于 2 个时折叠 */
function formatExitReason(labels: string[]): string {
  if (labels.length === 0) return "策略离场";
  const shown = labels.slice(0, 2).join(" / ");
  const extra = labels.length > 2 ? ` 等${labels.length - 2}项` : "";
  return `${shown}${extra} · 离场`;
}

interface DrawdownInfo {
  /** 回撤百分比序列（<= 0） */
  series: { t: number; value: number }[];
  /** 最长回撤持续天数（峰值 → 收复，自然日；未收复算到最后一根） */
  longestDays: number | null;
}

export function drawdownInfo(points: { t: number; value: number }[]): DrawdownInfo {
  if (points.length < 2) return { series: [], longestDays: null };
  let peak = points[0].value;
  let peakTime = points[0].t;
  let inDrawdown = false;
  let longest = 0;
  const series = points.map((point) => {
    if (point.value >= peak) {
      if (inDrawdown) {
        // 回到前高即算收复（峰值 → 收复当天，含收复日）
        longest = Math.max(longest, Math.round((point.t - peakTime) / 86_400));
        inDrawdown = false;
      }
      peak = point.value;
      peakTime = point.t;
    } else {
      inDrawdown = true;
    }
    const dd = peak > 0 ? (point.value / peak - 1) * 100 : 0;
    return { t: point.t, value: Number(dd.toFixed(3)) };
  });
  if (inDrawdown) {
    // 至今未收复：算到最后一根
    const last = points[points.length - 1];
    longest = Math.max(longest, Math.round((last.t - peakTime) / 86_400));
  }
  return { series, longestDays: longest > 0 ? longest : null };
}

function drawdownOf(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    if (peak > 0) worst = Math.min(worst, (value / peak - 1) * 100);
  }
  return worst;
}

/**
 * 执行回测：全仓进出，按收盘价成交，买卖各收一次手续费。
 * `interval` 决定年化 / 夏普的换算口径（默认日线）。
 */
export function runBacktest(
  points: ChartPoint[],
  params: BacktestParams,
  interval: IntervalKey = "1d",
): BacktestResult {
  const periodsPerYear = barsPerYear(interval);
  const initial = Math.max(100, params.initialCapital || 10_000);
  const empty: BacktestResult = {
    equity: [],
    benchmark: [],
    price: [],
    drawdown: [],
    trades: [],
    stats: {
      initialCapital: initial,
      finalValue: null,
      profit: null,
      totalReturn: null,
      benchmarkReturn: null,
      cagr: null,
      maxDrawdown: null,
      maxDrawdownDays: null,
      sharpe: null,
      winRate: null,
      tradeCount: 0,
      avgDays: null,
      exposure: null,
    },
  };
  if (points.length < 30) return empty;

  const fee = Math.max(0, params.feeBps) / 10_000;
  const matrix = buildSignalMatrix(points, params);
  const signals =
    matrix.length === 0
      ? new Array<number>(points.length).fill(0)
      : matrix.length === 1
        ? matrix[0].series
        : points.map((_, index) =>
            params.combineMode === "all"
              ? matrix.every((item) => item.series[index] === 1)
                ? 1
                : 0
              : matrix.some((item) => item.series[index] === 1)
                ? 1
                : 0,
          );

  let cash = initial;
  let shares = 0;
  let entryPrice = 0;
  let entryDate = 0;
  let entryIndex = 0;
  let heldDays = 0;
  const equitySeries: { t: number; value: number }[] = [];
  const priceSeries: { t: number; value: number }[] = [];
  const trades: Trade[] = [];
  const dailyReturns: number[] = [];
  let previousEquity = initial;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const signal = signals[index];

    if (signal === 1 && shares === 0) {
      // 全仓买入（扣手续费）
      const budget = cash * (1 - fee);
      shares = budget / point.close;
      cash = 0;
      entryPrice = point.close;
      entryDate = point.t;
      entryIndex = index;
    } else if (signal === 0 && shares > 0) {
      const gross = shares * point.close;
      cash = gross * (1 - fee);
      const cost = shares * entryPrice;
      const pnl = cash - cost;
      const reasonLabels = exitReasonFor(matrix, index, params.combineMode);
      trades.push({
        entryDate,
        entryPrice,
        exitDate: point.t,
        exitPrice: point.close,
        shares: Number(shares.toFixed(4)),
        pnl: Number(pnl.toFixed(2)),
        pnlPercent: cost > 0 ? (pnl / cost) * 100 : 0,
        days: Math.max(1, Math.round((point.t - entryDate) / 86_400)),
        bars: index - entryIndex,
        reason: formatExitReason(reasonLabels),
        reasonLabels,
      });
      shares = 0;
    }

    if (shares > 0) heldDays += 1;
    const equity = cash + shares * point.close;
    equitySeries.push({ t: point.t, value: Number(equity.toFixed(2)) });
    priceSeries.push({ t: point.t, value: point.close });
    dailyReturns.push(previousEquity > 0 ? equity / previousEquity - 1 : 0);
    previousEquity = equity;
  }

  const benchmark = points.map((point) => ({
    t: point.t,
    value: Number((initial * (point.close / points[0].close)).toFixed(2)),
  }));

  const finalValue = equitySeries[equitySeries.length - 1]?.value ?? initial;
  const profit = finalValue - initial;
  const totalReturn = (finalValue / initial - 1) * 100;
  const benchmarkReturn = (points[points.length - 1].close / points[0].close - 1) * 100;
  const years = points.length / periodsPerYear;
  const cagr = years > 0 && finalValue > 0 ? ((finalValue / initial) ** (1 / years) - 1) * 100 : null;

  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / Math.max(1, dailyReturns.length);
  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(periodsPerYear) : null;
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const dd = drawdownInfo(equitySeries);

  return {
    equity: equitySeries,
    benchmark,
    price: priceSeries,
    drawdown: dd.series,
    trades,
    stats: {
      initialCapital: initial,
      finalValue,
      profit,
      totalReturn,
      benchmarkReturn,
      cagr,
      maxDrawdown: drawdownOf(equitySeries.map((item) => item.value)),
      maxDrawdownDays: dd.longestDays,
      sharpe,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : null,
      tradeCount: trades.length,
      avgDays:
        trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.days, 0) / trades.length : null,
      exposure: (heldDays / points.length) * 100,
    },
  };
}
