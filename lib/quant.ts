import type { ChartPoint } from "@/lib/types";

/** 量化统计：全部在本地用日线计算，不引入第三方库。 */

export interface RiskMetrics {
  /** 区间总收益（%） */
  totalReturn: number | null;
  /** 年化收益（%） */
  annualReturn: number | null;
  /** 年化波动（%） */
  volatility: number | null;
  /** 夏普（无风险利率默认 0） */
  sharpe: number | null;
  /** 最大回撤（%，负值） */
  maxDrawdown: number | null;
  /** 上涨天数占比（%） */
  winRate: number | null;
  bestDay: number | null;
  worstDay: number | null;
  /** 年化波动之外的简单动量 */
  momentum: { d20: number | null; d60: number | null; d120: number | null };
}

const TRADING_DAYS = 252;

/** 日收益率序列（小数） */
export function dailyReturns(points: ChartPoint[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].close;
    const current = points[index].close;
    if (previous > 0 && current > 0) returns.push(current / previous - 1);
  }
  return returns;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** 从窗口起点开始的简单动量（%） */
export function momentum(points: ChartPoint[], lookback: number): number | null {
  if (points.length <= lookback) return null;
  const start = points[points.length - 1 - lookback].close;
  const end = points[points.length - 1].close;
  if (start <= 0) return null;
  return (end / start - 1) * 100;
}

/** 最大回撤（%，负值） */
export function maxDrawdown(points: ChartPoint[]): number | null {
  if (points.length < 2) return null;
  let peak = points[0].close;
  let worst = 0;
  for (const point of points) {
    if (point.close > peak) peak = point.close;
    if (peak > 0) {
      const drawdown = (point.close / peak - 1) * 100;
      if (drawdown < worst) worst = drawdown;
    }
  }
  return worst;
}

/** 汇总风险指标 */
export function riskMetrics(points: ChartPoint[]): RiskMetrics {
  const returns = dailyReturns(points);
  const totalReturn =
    points.length >= 2 && points[0].close > 0
      ? (points[points.length - 1].close / points[0].close - 1) * 100
      : null;

  const years = returns.length / TRADING_DAYS;
  const annualReturn =
    totalReturn === null || years <= 0
      ? null
      : ((1 + totalReturn / 100) ** (1 / years) - 1) * 100;

  const dailyStd = stdDev(returns);
  const volatility = dailyStd > 0 ? dailyStd * Math.sqrt(TRADING_DAYS) * 100 : null;
  const sharpe =
    volatility === null || volatility === 0
      ? null
      : (mean(returns) * TRADING_DAYS * 100) / volatility;

  const wins = returns.filter((value) => value > 0).length;

  return {
    totalReturn,
    annualReturn,
    volatility,
    sharpe,
    maxDrawdown: maxDrawdown(points),
    winRate: returns.length > 0 ? (wins / returns.length) * 100 : null,
    bestDay: returns.length > 0 ? Math.max(...returns) * 100 : null,
    worstDay: returns.length > 0 ? Math.min(...returns) * 100 : null,
    momentum: {
      d20: momentum(points, 20),
      d60: momentum(points, 60),
      d120: momentum(points, 120),
    },
  };
}

/** 两个收益序列的相关系数（按较短长度对齐，取最近的样本） */
export function correlation(a: number[], b: number[]): number | null {
  const length = Math.min(a.length, b.length);
  if (length < 8) return null;
  const left = a.slice(a.length - length);
  const right = b.slice(b.length - length);

  const meanLeft = mean(left);
  const meanRight = mean(right);
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;

  for (let index = 0; index < length; index += 1) {
    const dl = left[index] - meanLeft;
    const dr = right[index] - meanRight;
    covariance += dl * dr;
    varianceLeft += dl * dl;
    varianceRight += dr * dr;
  }

  if (varianceLeft <= 0 || varianceRight <= 0) return null;
  return covariance / Math.sqrt(varianceLeft * varianceRight);
}

/** 归一化到基准 100（用于相对强弱对比） */
export function normalizeToBase(points: ChartPoint[], base = 100): number[] {
  if (points.length === 0) return [];
  const first = points[0].close;
  if (first <= 0) return [];
  return points.map((point) => (point.close / first) * base);
}

/** 日收益直方图分桶 */
export function returnHistogram(
  returns: number[],
  buckets = 9,
): { from: number; to: number; count: number }[] {
  if (returns.length === 0) return [];
  const percent = returns.map((value) => value * 100);
  const min = Math.min(...percent);
  const max = Math.max(...percent);
  const span = max - min || 0.01;

  const bins = Array.from({ length: buckets }, (_, index) => ({
    from: min + (span / buckets) * index,
    to: min + (span / buckets) * (index + 1),
    count: 0,
  }));

  for (const value of percent) {
    const position = Math.min(buckets - 1, Math.floor(((value - min) / span) * buckets));
    bins[position].count += 1;
  }

  return bins;
}

/* -------------------------------------------------------------------------- */
/*                          相对基准：alpha / beta                              */
/* -------------------------------------------------------------------------- */

export interface TimedReturn {
  /** 秒级时间戳（对齐用） */
  t: number;
  /** 日收益率（小数） */
  r: number;
}

export interface AlphaBeta {
  /** OLS 斜率：标的对基准的敏感度 */
  beta: number | null;
  /** 年化 alpha（%）：剥离基准收益后的超额 */
  alphaAnnualized: number | null;
  /** 样本对齐后的相关系数 */
  correlation: number | null;
  /** 对齐后样本数 */
  samples: number;
}

/** 带时间戳的日收益率序列（用于跨标的对齐） */
export function timedReturns(points: ChartPoint[]): TimedReturn[] {
  const output: TimedReturn[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].close;
    const current = points[index].close;
    // 价格缺失（0 / 负数）会产生假收益率，直接跳过
    if (previous <= 0 || current <= 0) continue;
    output.push({ t: points[index].t, r: current / previous - 1 });
  }
  return output;
}

/** 按时间戳取两条收益序列的交集（不同市场交易日不同，不能按下标硬对齐） */
export function alignReturns(a: TimedReturn[], b: TimedReturn[]): { a: number[]; b: number[] } {
  const map = new Map<number, number>();
  for (const item of b) map.set(item.t, item.r);
  const left: number[] = [];
  const right: number[] = [];
  for (const item of a) {
    const match = map.get(item.t);
    if (match === undefined) continue;
    left.push(item.r);
    right.push(match);
  }
  return { a: left, b: right };
}

/**
 * 简单 OLS 回归：stock ~ alpha + beta * benchmark。
 * alpha 为日均超额，按 252 个交易日年化；样本过少或基准无波动时返回 null。
 */
export function alphaBeta(stock: TimedReturn[], benchmark: TimedReturn[]): AlphaBeta {
  const aligned = alignReturns(stock, benchmark);
  const n = aligned.a.length;
  if (n < 20) return { beta: null, alphaAnnualized: null, correlation: null, samples: n };

  const meanA = aligned.a.reduce((sum, value) => sum + value, 0) / n;
  const meanB = aligned.b.reduce((sum, value) => sum + value, 0) / n;

  let covariance = 0;
  let varianceB = 0;
  let varianceA = 0;
  for (let index = 0; index < n; index += 1) {
    const da = aligned.a[index] - meanA;
    const db = aligned.b[index] - meanB;
    covariance += da * db;
    varianceB += db * db;
    varianceA += da * da;
  }
  if (varianceB <= 0 || varianceA <= 0) {
    return { beta: null, alphaAnnualized: null, correlation: null, samples: n };
  }

  const beta = covariance / varianceB;
  const alphaDaily = meanA - beta * meanB;
  const corr = covariance / Math.sqrt(varianceA * varianceB);

  return {
    beta: Number(beta.toFixed(3)),
    alphaAnnualized: Number((alphaDaily * TRADING_DAYS * 100).toFixed(2)),
    correlation: Number(corr.toFixed(3)),
    samples: n,
  };
}
