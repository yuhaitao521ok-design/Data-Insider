import type { AlphaBeta, RiskMetrics, TimedReturn, TrendStructure } from "@/lib/quant";
import type { ChartPoint } from "@/lib/types";

/** 量化研究页的行数据：行情点 + 单只风险/相对/趋势指标，全部本地计算 */
export interface ResearchRow {
  symbol: string;
  points: ChartPoint[];
  /** 日收益（小数） */
  returns: number[];
  /** 带时间戳的日收益，用于跨标的对齐 */
  timed: TimedReturn[];
  metrics: RiskMetrics;
  alphaBeta: AlphaBeta;
  trend: TrendStructure;
}

export type ResearchSortKey =
  | "symbol"
  | "resonance"
  | "d20"
  | "d60"
  | "d120"
  | "vol"
  | "sharpe"
  | "sortino"
  | "dd"
  | "ddDays"
  | "win"
  | "beta"
  | "alpha"
  | "total";
