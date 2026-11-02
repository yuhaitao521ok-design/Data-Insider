import { bollinger, rsi, sma } from "@/lib/indicators";
import type { ChartPoint } from "@/lib/types";

/** 轻量回测引擎：MA 交叉 / RSI / BOLL，全部本地计算。 */

export const STRATEGY_KEYS = ["ma-cross", "rsi-reversal", "boll-breakout"] as const;
export type StrategyKey = (typeof STRATEGY_KEYS)[number];

export interface BacktestParams {
  strategy: StrategyKey;
  /** MA 快线 */
  fast: number;
  /** MA 慢线 / RSI 周期 / BOLL 周期 */
  slow: number;
  /** RSI 超卖（买入阈值） */
  oversold: number;
  /** RSI 超买（卖出阈值） */
  overbought: number;
  /** BOLL 标准差倍数 */
  multiplier: number;
  /** 手续费，单位 bp（万分之） */
  feeBps: number;
}

export const DEFAULT_PARAMS: BacktestParams = {
  strategy: "ma-cross",
  fast: 10,
  slow: 30,
  oversold: 30,
  overbought: 70,
  multiplier: 2,
  feeBps: 5,
};

export interface Trade {
  entryDate: number;
  entryPrice: number;
  exitDate: number;
  exitPrice: number;
  /** 百分比 */
  pnlPercent: number;
  days: number;
  reason: string;
}

export interface BacktestResult {
  /** 策略净值（起点 100） */
  equity: { t: number; value: number }[];
  /** 买入持有净值 */
  benchmark: { t: number; value: number }[];
  trades: Trade[];
  stats: {
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

/** 生成持仓信号：1 = 持有，0 = 空仓 */
function buildSignals(points: ChartPoint[], params: BacktestParams): number[] {
  const closes = points.map((point) => point.close);
  const signals = new Array<number>(points.length).fill(0);

  if (params.strategy === "ma-cross") {
    const fast = sma(closes, Math.max(2, Math.round(params.fast)));
    const slow = sma(closes, Math.max(3, Math.round(params.slow)));
    for (let index = 0; index < points.length; index += 1) {
      const f = fast[index];
      const s = slow[index];
      signals[index] = f !== null && s !== null && f > s ? 1 : 0;
    }
    return signals;
  }

  if (params.strategy === "rsi-reversal") {
    const values = rsi(closes, Math.max(2, Math.round(params.slow)));
    let holding = 0;
    for (let index = 0; index < points.length; index += 1) {
      const value = values[index];
      if (value === null) {
        signals[index] = 0;
        continue;
      }
      if (!holding && value <= params.oversold) holding = 1;
      else if (holding && value >= params.overbought) holding = 0;
      signals[index] = holding;
    }
    return signals;
  }

  const bands = bollinger(
    closes,
    Math.max(2, Math.round(params.slow)),
    Math.max(0.5, params.multiplier),
  );
  let holding = 0;
  for (let index = 0; index < points.length; index += 1) {
    const upper = bands.upper[index];
    const middle = bands.middle[index];
    const close = closes[index];
    if (upper === null || middle === null) {
      signals[index] = 0;
      continue;
    }
    if (!holding && close > upper) holding = 1;
    else if (holding && close < middle) holding = 0;
    signals[index] = holding;
  }
  return signals;
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

const TRADING_DAYS = 252;

/** 执行回测：按收盘价成交，买卖各收一次手续费 */

export function runBacktest(points: ChartPoint[], params: BacktestParams): BacktestResult {
  const empty: BacktestResult = {
    equity: [],
    benchmark: [],
    trades: [],
    stats: {
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

  let equity = 100;
  let holding = false;
  let entryPrice = 0;
  let entryDate = 0;
  let entryIndex = 0;
  let heldDays = 0;
  const equitySeries: { t: number; value: number }[] = [];
  const trades: Trade[] = [];
  const dailyReturns: number[] = [];
  let previousEquity = 100;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const signal = signals[index];

    if (signal === 1 && !holding) {
      holding = true;
      entryPrice = point.close;
      entryDate = point.t;
      entryIndex = index;
      equity *= 1 - fee;
    } else if (signal === 0 && holding) {
      const gross = point.close;
      const pnlPercent = (gross / entryPrice - 1) * 100 - fee * 200;
      equity *= (1 + (gross / entryPrice - 1)) * (1 - fee);
      trades.push({
        entryDate,
        entryPrice,
        exitDate: point.t,
        exitPrice: gross,
        pnlPercent,
        days: index - entryIndex,
        reason: params.strategy === "rsi-reversal" ? "RSI 出场" : params.strategy === "boll-breakout" ? "跌破中轨" : "均线死叉",
      });
      holding = false;
    } else if (holding && index > 0) {
      equity *= point.close / points[index - 1].close;
    }

    if (holding) heldDays += 1;
    equitySeries.push({ t: point.t, value: Number(equity.toFixed(4)) });
    dailyReturns.push(previousEquity > 0 ? equity / previousEquity - 1 : 0);
    previousEquity = equity;
  }

  // 结尾仍持仓 → 计为未平仓，收益率按最后价格计算（不计入 trades）
  const benchmark = points.map((point) => ({
    t: point.t,
    value: Number(((point.close / points[0].close) * 100).toFixed(4)),
  }));

  const last = equitySeries[equitySeries.length - 1]?.value ?? 100;
  const totalReturn = last - 100;
  const benchmarkReturn = (benchmark[benchmark.length - 1]?.value ?? 100) - 100;
  const years = points.length / TRADING_DAYS;
  const cagr = years > 0 && last > 0 ? ((last / 100) ** (1 / years) - 1) * 100 : null;

  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(TRADING_DAYS) : null;

  const wins = trades.filter((trade) => trade.pnlPercent > 0).length;

  return {
    equity: equitySeries,
    benchmark,
    trades,
    stats: {
      totalReturn,
      benchmarkReturn,
      cagr,
      maxDrawdown: drawdownOf(equitySeries.map((item) => item.value)),
      sharpe,
      winRate: trades.length > 0 ? (wins / trades.length) * 100 : null,
      tradeCount: trades.length,
      avgDays: trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.days, 0) / trades.length : null,
      exposure: (heldDays / points.length) * 100,
    },
  };
}
