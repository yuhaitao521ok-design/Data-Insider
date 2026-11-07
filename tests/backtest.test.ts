import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PARAMS, runBacktest } from "@/lib/backtest";
import {
  barsPerYear,
  defaultBacktestInterval,
  estimateBars,
  intervalsForBacktest,
} from "@/lib/backtest-frame";
import type { ChartPoint } from "@/lib/types";

function makeSeries(count: number, stepSeconds: number): ChartPoint[] {
  const start = 1_600_000_000;
  const points: ChartPoint[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    price = price * (1 + 0.004 * Math.sin(i / 7) + 0.0025);
    points.push({
      t: start + i * stepSeconds,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1_000_000 + i * 1000,
    });
  }
  return points;
}

const params = { ...DEFAULT_PARAMS, strategies: ["ma-cross"] };

test("回测口径：区间 × 周期矩阵与默认值", () => {
  assert.deepEqual(intervalsForBacktest("3M"), ["60m", "1d"]);
  assert.deepEqual(intervalsForBacktest("5Y"), ["1d", "1wk", "1mo"]);
  assert.ok(intervalsForBacktest("MAX").includes("1mo"));
  assert.equal(defaultBacktestInterval("5Y"), "1d");
  assert.equal(barsPerYear("1wk"), 52);
  assert.equal(barsPerYear("1d"), 252);
  // 1 年月线不足 40 根，必须被过滤
  assert.ok(estimateBars("1Y", "1mo") < 40);
  assert.ok(!intervalsForBacktest("1Y").includes("1mo"));
});

test("回测引擎：净值长度、基准起点、自然日持有天数", () => {
  const daily = makeSeries(300, 86_400);
  const result = runBacktest(daily, params, "1d");

  assert.equal(result.equity.length, daily.length);
  assert.equal(result.benchmark[0].value, result.stats.initialCapital);
  assert.ok(result.trades.length > 0);

  const first = result.trades[0];
  const expectedDays = Math.max(1, Math.round((first.exitDate - first.entryDate) / 86_400));
  assert.equal(first.days, expectedDays);
  assert.ok(first.bars >= 1);
});

test("年化口径随周期换算（周线按 52 根/年）", () => {
  const weekly = makeSeries(60, 7 * 86_400);
  const result = runBacktest(weekly, params, "1wk");
  const years = weekly.length / 52;
  const expected =
    ((result.stats.finalValue! / result.stats.initialCapital) ** (1 / years) - 1) * 100;

  assert.ok(result.stats.cagr !== null);
  assert.ok(Math.abs(result.stats.cagr! - expected) < 0.01);
  assert.ok(result.stats.sharpe !== null);
});

test("数据不足时返回空结果而不是报错", () => {
  const result = runBacktest(makeSeries(10, 86_400), params);
  assert.equal(result.stats.finalValue, null);
  assert.equal(result.equity.length, 0);
  assert.equal(result.trades.length, 0);
});
