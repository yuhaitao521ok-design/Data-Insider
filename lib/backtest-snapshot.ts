import type { BacktestParams } from "@/lib/backtest";
import type { IntervalKey, RangeKey } from "@/lib/types";

/**
 * 回测快照：把一次回测的关键结果存到 localStorage，用于多组对比。
 * 只保留画对比曲线需要的降采样净值与统计摘要，避免撑爆 localStorage。
 */

export const SNAPSHOT_KEY = "data-insider:backtest-snapshots:v1";
export const MAX_SNAPSHOTS = 6;
/** 对比曲线最多同时叠加几组（含当前） */
export const MAX_COMPARE = 3;
const MAX_EQUITY_POINTS = 400;

export interface SnapshotStats {
  initialCapital: number;
  totalReturn: number | null;
  benchmarkReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  maxDrawdownDays: number | null;
  sharpe: number | null;
  tradeCount: number;
}

export interface BacktestSnapshot {
  id: string;
  /** 展示名：如 AAPL · 均线交叉 */
  label: string;
  symbol: string;
  range: RangeKey;
  interval: IntervalKey;
  params: BacktestParams;
  /** 降采样后的净值序列 */
  equity: { t: number; value: number }[];
  stats: SnapshotStats;
  createdAt: number;
}

/** 均匀降采样到 max 个点（保留首尾） */
export function downsample<T>(items: T[], max = MAX_EQUITY_POINTS): T[] {
  if (items.length <= max) return [...items];
  const step = (items.length - 1) / (max - 1);
  const output: T[] = [];
  for (let index = 0; index < max; index += 1) {
    output.push(items[Math.round(index * step)]);
  }
  return output;
}

export function buildSnapshot(input: {
  id: string;
  label: string;
  symbol: string;
  range: RangeKey;
  interval: IntervalKey;
  params: BacktestParams;
  equity: { t: number; value: number }[];
  stats: SnapshotStats;
}): BacktestSnapshot {
  return {
    ...input,
    equity: downsample(input.equity),
    createdAt: Date.now(),
  };
}

function sanitize(raw: unknown): BacktestSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const output: BacktestSnapshot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<BacktestSnapshot>;
    if (typeof candidate.id !== "string" || typeof candidate.label !== "string") continue;
    if (typeof candidate.symbol !== "string") continue;
    if (!Array.isArray(candidate.equity) || candidate.equity.length < 2) continue;
    if (!candidate.stats || !candidate.params) continue;
    output.push(candidate as BacktestSnapshot);
    if (output.length >= MAX_SNAPSHOTS) break;
  }
  return output;
}

export function loadSnapshots(): BacktestSnapshot[] {
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function persistSnapshots(snapshots: BacktestSnapshot[]): void {
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
  } catch {
    // 隐私模式 / 超限时忽略
  }
}

/** 新快照插到最前；同 label 允许并存，超过上限丢最旧的 */
export function addSnapshot(list: BacktestSnapshot[], snapshot: BacktestSnapshot): BacktestSnapshot[] {
  const next = [snapshot, ...list].slice(0, MAX_SNAPSHOTS);
  persistSnapshots(next);
  return next;
}

export function removeSnapshot(list: BacktestSnapshot[], id: string): BacktestSnapshot[] {
  const next = list.filter((item) => item.id !== id);
  persistSnapshots(next);
  return next;
}
