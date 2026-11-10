import { test } from "node:test";
import assert from "node:assert/strict";

import {
  alphaBeta,
  averageCorrelation,
  correlationByTime,
  drawdownProfile,
  drawdownSeries,
  equallyWeightedSeries,
  monthlyReturns,
  normalizedSeries,
  rollingCorrelation,
  seriateCorrelation,
  sortinoRatio,
  trendStructure,
  valueAtRisk,
} from "@/lib/quant";
import type { TimedReturn } from "@/lib/quant";
import type { ChartPoint } from "@/lib/types";

const DAY = 86_400;

function point(t: number, close: number): ChartPoint {
  return { t, open: close, high: close, low: close, close, volume: null };
}

function series(values: number[], step = DAY): ChartPoint[] {
  return values.map((close, index) => point(1_700_000_000 + index * step, close));
}

function timed(values: number[], step = DAY): TimedReturn[] {
  return values.map((r, index) => ({ t: index * step, r }));
}

test("drawdownProfile：最大回撤 / 修复 / 当前回撤", () => {
  const profile = drawdownProfile(series([100, 120, 90, 100, 130]));
  assert.equal(profile.max, -25);
  assert.equal(profile.current, 0);
  assert.equal(profile.dropDays, 1);
  assert.equal(profile.recoveryDays, 2);
  assert.equal(profile.longestDays, 3);
});

test("drawdownProfile：从未修复时 current 为负、recovery 为 null", () => {
  const profile = drawdownProfile(series([100, 80, 85, 90]));
  assert.equal(profile.max, -20);
  assert.ok(profile.current !== null && Math.abs(profile.current - -10) < 0.001);
  assert.equal(profile.recoveryDays, null);
});

test("drawdownSeries：最新价即新高时为 0", () => {
  const output = drawdownSeries(series([100, 120, 60, 90]));
  assert.equal(output.length, 4);
  assert.equal(output[0].value, 0);
  assert.equal(output[1].value, 0);
  assert.equal(output[2].value, -50);
  assert.ok(Math.abs(output[3].value - -25) < 0.001);
});

test("sortinoRatio：全部为正收益时没有下行波动 → null", () => {
  assert.equal(sortinoRatio([0.01, 0.02, 0.015, 0.005]), null);
  const mixed = [0.02, -0.01, 0.03, -0.02, 0.01, -0.015, 0.02];
  const value = sortinoRatio(mixed);
  assert.ok(value !== null && value > 0);
});

test("valueAtRisk：VaR 取 5% 分位、CVaR 是尾部均值", () => {
  const returns = [-0.02, -0.03, -0.04, -0.05, -0.06, -0.07, -0.08, -0.09, -0.1, -0.11];
  const filled = [...returns, ...Array.from({ length: 90 }, () => 0.005)];
  const result = valueAtRisk(filled, 0.95);
  assert.ok(result.var !== null && Math.abs(result.var - 6) < 0.001);
  assert.ok(result.cvar !== null && Math.abs(result.cvar - 8.5) < 0.001);
});

test("monthlyReturns：按自然月取最后一个收盘价", () => {
  const points = [
    point(Date.UTC(2024, 0, 2) / 1000, 100),
    point(Date.UTC(2024, 0, 31) / 1000, 110),
    point(Date.UTC(2024, 1, 15) / 1000, 99),
    point(Date.UTC(2024, 1, 29) / 1000, 121),
  ];
  const rows = monthlyReturns(points);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].key, "2024-01");
  assert.ok(Math.abs(rows[0].value - 10) < 1e-9);
  assert.equal(rows[1].key, "2024-02");
  assert.ok(Math.abs(rows[1].value - 10) < 1e-9);
});

test("equallyWeightedSeries：等权两只同走势 = 单只净值（收益序列比价格序列少一天）", () => {
  const first = series([100, 110, 121, 133.1]);
  const second = series([50, 55, 60.5, 66.55]);
  const portfolio = equallyWeightedSeries([
    { symbol: "A", points: first },
    { symbol: "B", points: second },
  ]);
  const benchmark = normalizedSeries(first);
  assert.equal(portfolio.length, benchmark.length - 1);
  for (let index = 0; index < portfolio.length; index += 1) {
    assert.ok(Math.abs(portfolio[index].value - benchmark[index + 1].value) < 1e-6);
  }
});

test("trendStructure：单边上涨 → 共振 4 分、正在新高", () => {
  const points = series(Array.from({ length: 130 }, (_, index) => 100 + index));
  const trend = trendStructure(points);
  assert.equal(trend.score, 4);
  assert.equal(trend.aboveMa20, true);
  assert.equal(trend.aboveMa60, true);
  assert.equal(trend.fromHigh, 0);
});

test("seriateCorrelation：高相关的一对排在一起", () => {
  const matrix = [
    [1, 0.1, 0.9],
    [0.1, 1, 0.15],
    [0.9, 0.15, 1],
  ];
  const order = seriateCorrelation(matrix);
  assert.equal(order.length, 3);
  assert.deepEqual([...order.slice(0, 2)].sort(), [0, 2]);
  assert.equal(order[2], 1);
});

test("correlationByTime / averageCorrelation：同序列相关性为 1", () => {
  const a = timed([0.01, -0.02, 0.03, 0.015, -0.01, 0.02, 0.005, -0.005, 0.012, 0.008]);
  const b = timed([0.01, -0.02, 0.03, 0.015, -0.01, 0.02, 0.005, -0.005, 0.012, 0.008]);
  assert.equal(correlationByTime(a, b), 1);
  assert.equal(
    averageCorrelation([
      { symbol: "A", returns: a },
      { symbol: "B", returns: b },
    ]),
    1,
  );
});

test("rollingCorrelation：同序列滚动值恒为 1", () => {
  const values = Array.from({ length: 80 }, (_, index) => Math.sin(index / 5) * 0.01);
  const output = rollingCorrelation(timed(values), timed(values), 60);
  assert.equal(output.length, 21);
  for (const item of output) {
    assert.ok(item.value > 0.999 && item.value <= 1);
  }
});

test("alphaBeta：标的 = 基准 → beta≈1、跟踪误差 0、捕获率 100%", () => {
  const values = Array.from({ length: 120 }, (_, index) => Math.sin(index / 6) * 0.012);
  const result = alphaBeta(timed(values), timed(values));
  assert.ok(result.beta !== null && Math.abs(result.beta - 1) < 1e-9);
  assert.ok(result.alphaAnnualized !== null && Math.abs(result.alphaAnnualized) < 1e-6);
  assert.equal(result.trackingError, 0);
  assert.equal(result.informationRatio, null);
  assert.ok(result.upCapture !== null && Math.abs(result.upCapture - 100) < 0.01);
  assert.ok(result.downCapture !== null && Math.abs(result.downCapture - 100) < 0.01);
});
