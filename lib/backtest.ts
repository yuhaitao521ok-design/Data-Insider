import { bollinger, ema, macd, rsi, sma } from "@/lib/indicators";
import type { ChartPoint } from "@/lib/types";

/** 轻量回测引擎：6 个信号策略，支持多策略联动，全部本地计算。 */

export const STRATEGY_KEYS = [
  "ma-cross",
  "ema-cross",
  "rsi-reversal",
  "boll-breakout",
  "macd-cross",
  "donchian",
] as const;

export type StrategyKey = (typeof STRATEGY_KEYS)[number];

/** 多策略联动方式：any = 任一给出买入即持有；all = 全部看多才持有 */
export type CombineMode = "any" | "all";

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
  days: number;
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
type SignalFn = (points: ChartPoint[], params: BacktestParams) => number[];

function upper(points: ChartPoint[]) {
  return points.map((point) => (point.high ?? point.close) as number);
}
function lower(points: ChartPoint[]) {
  return points.map((point) => (point.low ?? point.close) as number);
}

const SIGNALS: Record<StrategyKey, SignalFn> = {
  "ma-cross": (points, params) => {
    const closes = points.map((point) => point.close);
    const fast = sma(closes, Math.max(2, Math.round(params.fast)));
    const slow = sma(closes, Math.max(3, Math.round(params.slow)));
    return points.map((_, index) => {
      const f = fast[index];
      const s = slow[index];
      return f !== null && s !== null && f > s ? 1 : 0;
    });
  },

  "ema-cross": (points, params) => {
    const closes = points.map((point) => point.close);
    const fast = ema(closes, Math.max(2, Math.round(params.fast)));
    const slow = ema(closes, Math.max(3, Math.round(params.slow)));
    return points.map((_, index) => {
      const f = fast[index];
      const s = slow[index];
      return f !== null && s !== null && f > s ? 1 : 0;
    });
  },

  "rsi-reversal": (points, params) => {
    const closes = points.map((point) => point.close);
    const values = rsi(closes, Math.max(2, Math.round(params.slow)));
    let holding = 0;
    return points.map((_, index) => {
      const value = values[index];
      if (value === null) return 0;
      if (!holding && value <= params.oversold) holding = 1;
      else if (holding && value >= params.overbought) holding = 0;
      return holding;
    });
  },

  "boll-breakout": (points, params) => {
    const closes = points.map((point) => point.close);
    const bands = bollinger(
      closes,
      Math.max(2, Math.round(params.slow)),
      Math.max(0.5, params.multiplier),
    );
    let holding = 0;
    return points.map((_, index) => {
      const upperBand = bands.upper[index];
      const middle = bands.middle[index];
      const close = closes[index];
      if (upperBand === null || middle === null) return 0;
      if (!holding && close > upperBand) holding = 1;
      else if (holding && close < middle) holding = 0;
      return holding;
    });
  },

  "macd-cross": (points, params) => {
    const closes = points.map((point) => point.close);
    const result = macd(
      closes,
      Math.max(2, Math.round(params.fast)),
      Math.max(3, Math.round(params.slow)),
      Math.max(2, Math.round(params.signal)),
    );
    return points.map((_, index) => {
      const dif = result.macd[index];
      const dea = result.signal[index];
      return dif !== null && dea !== null && dif > dea ? 1 : 0;
    });
  },

  donchian: (points, params) => {
    const lookback = Math.max(3, Math.round(params.slow));
    const exitLookback = Math.max(2, Math.round(params.exitLookback));
    const highs = upper(points);
    const lows = lower(points);
    let holding = 0;

    return points.map((_, index) => {
      if (index < lookback) return 0;
      const windowHigh = Math.max(...highs.slice(index - lookback, index));
      const exitLow = Math.min(...lows.slice(Math.max(0, index - exitLookback), index));
      const close = points[index].close;
      if (!holding && close >= windowHigh) holding = 1;
      else if (holding && close <= exitLow) holding = 0;
      return holding;
    });
  },
};

export function strategyLabel(key: StrategyKey): string {
  switch (key) {
    case "ma-cross":
      return "均线交叉";
    case "ema-cross":
      return "EMA 交叉";
    case "rsi-reversal":
      return "RSI 反转";
    case "boll-breakout":
      return "BOLL 突破";
    case "macd-cross":
      return "MACD 金叉";
    case "donchian":
      return "唐奇安突破";
  }
}

/** 组合策略信号：any = 取并集，all = 取交集 */
export function buildSignals(points: ChartPoint[], params: BacktestParams): number[] {
  const enabled: StrategyKey[] =
    params.strategies.length > 0 ? params.strategies : ["ma-cross"];
  const perStrategy = enabled.map((key) => SIGNALS[key](points, params));

  if (perStrategy.length === 1) return perStrategy[0];

  return points.map((_, index) => {
    if (params.combineMode === "all") {
      return perStrategy.every((series) => series[index] === 1) ? 1 : 0;
    }
    return perStrategy.some((series) => series[index] === 1) ? 1 : 0;
  });
}

export function strategyExitReason(params: BacktestParams): string {
  const first = params.strategies[0] ?? "ma-cross";
  const map: Record<StrategyKey, string> = {
    "ma-cross": "均线死叉",
    "ema-cross": "EMA 死叉",
    "rsi-reversal": "RSI 出场",
    "boll-breakout": "跌破中轨",
    "macd-cross": "MACD 死叉",
    donchian: "跌破低点",
  };
  return map[first];
}

const TRADING_DAYS = 252;

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

/** 执行回测：全仓进出，按收盘价成交，买卖各收一次手续费 */
export function runBacktest(points: ChartPoint[], params: BacktestParams): BacktestResult {
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
        days: index - entryIndex,
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
  const years = points.length / TRADING_DAYS;
  const cagr = years > 0 && finalValue > 0 ? ((finalValue / initial) ** (1 / years) - 1) * 100 : null;

  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / Math.max(1, dailyReturns.length);
  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(TRADING_DAYS) : null;
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
