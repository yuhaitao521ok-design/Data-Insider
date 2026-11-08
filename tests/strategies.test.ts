import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PARAMS, buildSignalMatrix, computeSignalDuties } from "@/lib/backtest";
import { STRATEGIES, type StrategyParams } from "@/lib/backtest-catalog";
import {
  adxSeries,
  atrSeries,
  cciSeries,
  ppoSeries,
  rocSeries,
  stochasticK,
  trixSeries,
  williamsR,
} from "@/lib/backtest-indicators";
import { bollinger, ema, macd, rsi, sma } from "@/lib/indicators";
import type { ChartPoint } from "@/lib/types";

const BASE_PARAMS: StrategyParams = {
  fast: 10,
  slow: 30,
  oversold: 30,
  overbought: 70,
  multiplier: 2,
  signal: 9,
  exitLookback: 10,
  threshold: 25,
};

function walk(count: number, seed = 7): ChartPoint[] {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const points: ChartPoint[] = [];
  let price = 100;
  for (let index = 0; index < count; index += 1) {
    price = price * (1 + Math.sin(index / 30) * 0.002 + (rand() - 0.5) * 0.02);
    points.push({
      t: 1_600_000_000 + index * 86_400,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1_000_000 + Math.round(rand() * 500_000),
    });
  }
  return points;
}

function flat(count: number): ChartPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    t: 1_600_000_000 + index * 86_400,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1_000,
  }));
}

function withMissingFields(count: number): ChartPoint[] {
  return walk(count).map((point, index) => ({
    ...point,
    high: index % 3 === 0 ? null : point.high,
    low: index % 5 === 0 ? null : point.low,
    volume: index % 7 === 0 ? null : point.volume,
  }));
}

const DATASETS: Array<[string, ChartPoint[]]> = [
  ["normal", walk(320)],
  ["tiny", walk(4)],
  ["empty", []],
  ["flat", flat(120)],
  ["missing-fields", withMissingFields(200)],
];

const EXTREME_PARAMS: Array<[string, StrategyParams]> = [
  ["min", { ...BASE_PARAMS, fast: 1, slow: 1, signal: 1, exitLookback: 1, multiplier: 0, threshold: 0, oversold: 0, overbought: 100 }],
  ["max", { ...BASE_PARAMS, fast: 500, slow: 800, signal: 200, exitLookback: 200, multiplier: 99, threshold: 9999, oversold: 50, overbought: 50 }],
  ["fractional", { ...BASE_PARAMS, fast: 2.7, slow: 30.4, signal: 8.6, exitLookback: 9.5, multiplier: 1.7, threshold: 4.4 }],
  ["non-finite", { ...BASE_PARAMS, fast: Number.NaN, slow: Number.POSITIVE_INFINITY, signal: Number.NaN, multiplier: Number.NaN, threshold: Number.NaN }],
];

for (const meta of STRATEGIES) {
  test(`策略 ${meta.key}：边界数据与极端参数下输出合法`, () => {
    for (const [dataName, points] of DATASETS) {
      for (const [paramName, params] of EXTREME_PARAMS) {
        let signal: number[] = [];
        assert.doesNotThrow(() => {
          signal = meta.signal(points, params);
        }, `${meta.key} / ${dataName} / ${paramName} 抛错`);

        assert.equal(signal.length, points.length, `${meta.key} / ${dataName} / ${paramName} 长度不一致`);
        for (const value of signal) {
          assert.ok(
            value === 0 || value === 1,
            `${meta.key} / ${dataName} / ${paramName} 出现非 0/1 值：${value}`,
          );
        }
      }
    }
  });
}

test("所有策略都声明了进场 / 出场语义文案", () => {
  for (const meta of STRATEGIES) {
    assert.ok(meta.entryText && meta.entryText.length > 1, `${meta.key} 缺少 entryText`);
    assert.ok(meta.exitText && meta.exitText.length > 1, `${meta.key} 缺少 exitText`);
    assert.notEqual(meta.entryText, meta.exitText, `${meta.key} 进出场文案相同`);
  }
});

test("safeSignal：未知策略被忽略，异常策略退化为全 0", () => {
  const points = walk(60);
  const matrix = buildSignalMatrix(points, {
    ...DEFAULT_PARAMS,
    strategies: ["ma-cross", "not-a-strategy"],
  });
  assert.equal(matrix.length, 1, "未知策略被过滤");
  assert.equal(matrix[0].series.length, points.length);

  const duties = computeSignalDuties(points, { ...DEFAULT_PARAMS, strategies: ["not-a-strategy"] });
  assert.deepEqual(duties, []);
});

const INDICATORS: Array<[string, (period: number) => Array<number | null>]> = [
  ["sma", (period) => sma(walk(120).map((p) => p.close), period)],
  ["ema", (period) => ema(walk(120).map((p) => p.close), period)],
  ["rsi", (period) => rsi(walk(120).map((p) => p.close), period)],
  ["bollinger.upper", (period) => bollinger(walk(120).map((p) => p.close), period).upper],
  ["macd.macd", (period) => macd(walk(120).map((p) => p.close), period, period + 5, Math.max(2, Math.round(period / 3))).macd],
  ["atr", (period) => atrSeries(walk(120), period)],
  ["stochastic", (period) => stochasticK(walk(120), period)],
  ["williams", (period) => williamsR(walk(120), period)],
  ["cci", (period) => cciSeries(walk(120), period)],
  ["adx", (period) => adxSeries(walk(120), period).adx],
  ["trix", (period) => trixSeries(walk(120).map((p) => p.close), period)],
  ["ppo", (period) => ppoSeries(walk(120).map((p) => p.close), Math.max(1, period), Math.max(2, period + 5), 5).ppo],
  ["roc", (period) => rocSeries(walk(120).map((p) => p.close), period)],
];

test("指标层：异常周期（0 / 负数 / 小数 / 超大 / NaN）不产生 NaN", () => {
  for (const [name, compute] of INDICATORS) {
    for (const period of [0, -5, 2.7, 1e6, Number.NaN]) {
      let series: Array<number | null> = [];
      assert.doesNotThrow(() => {
        series = compute(period);
      }, `${name}(period=${period}) 抛错`);
      for (const value of series) {
        if (value === null) continue;
        assert.ok(Number.isFinite(value), `${name}(period=${period}) 出现非有限值：${value}`);
      }
    }
  }
});

test("指标层：空数组输入安全", () => {
  assert.deepEqual(sma([], 5), []);
  assert.deepEqual(ema([], 5), []);
  assert.deepEqual(rsi([], 5), []);
  assert.deepEqual(bollinger([], 5).upper, []);
  assert.deepEqual(rocSeries([], 5), []);
  assert.deepEqual(stochasticK([], 5), []);
});
