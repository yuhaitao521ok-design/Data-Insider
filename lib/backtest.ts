import type { ChartPoint, IntervalKey } from "@/lib/types";

/** 回测引擎：多策略（见 backtest-catalog）自由组合，全部本地计算。 */

import { STRATEGIES, STRATEGY_MAP, type StrategyMeta } from "@/lib/backtest-catalog";
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
  reason: string;
}

export interface BacktestResult {
  /** 策略净值（金额） */
  equity: { t: number; value: number }[];
  /** 买入持有净值（金额） */
  benchmark: { t: number; value: number }[];
  /** 标的收盘价（用于叠加价格轴） */
  price: { t: number; value: number }[];
  trades: Trade[];
  stats: {
    initialCapital: number;
    finalValue: number | null;
    profit: number | null;
    totalReturn: number | null;
    benchmarkReturn: number | null;
    cagr: number | null;
    maxDrawdown: number | null;
    sharpe: number | null;
    winRate: number | null;
    tradeCount: number;
    avgDays: number | null;
    exposure: number | null;
  };
}

/** 单个策略的看多信号序列（1 = 看多，0 = 看空） */
/** 组合策略信号：any = 并集，all = 交集 */
export function buildSignals(points: ChartPoint[], params: BacktestParams): number[] {
  const enabled = params.strategies.length > 0 ? params.strategies : ["ma-cross"];
  const metas = enabled.flatMap((key) => {
    const meta = STRATEGY_MAP[key];
    return meta ? [meta] : [];
  });
  if (metas.length === 0) return new Array(points.length).fill(0);

  const perStrategy = metas.map((meta) => meta.signal(points, toStrategyParams(params)));
  if (perStrategy.length === 1) return perStrategy[0];

  return points.map((_, index) => {
    if (params.combineMode === "all") {
      return perStrategy.every((series) => series[index] === 1) ? 1 : 0;
    }
    return perStrategy.some((series) => series[index] === 1) ? 1 : 0;
  });
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

function strategyExitReason(params: BacktestParams): string {
  const first = params.strategies[0] ?? "ma-cross";
  return `${strategyLabel(first)} · 离场`;
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
    trades: [],
    stats: {
      initialCapital: initial,
      finalValue: null,
      profit: null,
      totalReturn: null,
      benchmarkReturn: null,
      cagr: null,
      maxDrawdown: null,
      sharpe: null,
      winRate: null,
      tradeCount: 0,
      avgDays: null,
      exposure: null,
    },
  };
  if (points.length < 30) return empty;

  const fee = Math.max(0, params.feeBps) / 10_000;
  const signals = buildSignals(points, params);
  const exitReason = strategyExitReason(params);

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
        reason: exitReason,
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

  return {
    equity: equitySeries,
    benchmark,
    price: priceSeries,
    trades,
    stats: {
      initialCapital: initial,
      finalValue,
      profit,
      totalReturn,
      benchmarkReturn,
      cagr,
      maxDrawdown: drawdownOf(equitySeries.map((item) => item.value)),
      sharpe,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : null,
      tradeCount: trades.length,
      avgDays:
        trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.days, 0) / trades.length : null,
      exposure: (heldDays / points.length) * 100,
    },
  };
}
