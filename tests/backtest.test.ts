import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PARAMS,
  buildSignalMatrix,
  buildSignals,
  drawdownInfo,
  entryAttribution,
  exitAttribution,
  resolveStrategyParams,
  runBacktest,
} from "@/lib/backtest";
import { STRATEGY_MAP } from "@/lib/backtest-catalog";
import {
  addSnapshot,
  buildSnapshot,
  downsample,
  removeSnapshot,
  MAX_SNAPSHOTS,
  type BacktestSnapshot,
} from "@/lib/backtest-snapshot";
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

test("回撤水下图：序列全为负值且最长回撤天数按自然日统计", () => {
  const daily = makeSeries(300, 86_400);
  const result = runBacktest(daily, params, "1d");

  assert.equal(result.drawdown.length, daily.length);
  assert.ok(result.drawdown.every((item) => item.value <= 0));
  assert.equal(result.drawdown[0].value, 0);

  const worst = Math.min(...result.drawdown.map((item) => item.value));
  assert.ok(Math.abs(worst - (result.stats.maxDrawdown ?? 0)) < 0.05);

  assert.ok(result.stats.maxDrawdownDays !== null);
  assert.ok(result.stats.maxDrawdownDays! > 0);
});

test("快照：降采样保留首尾且不超上限", () => {
  const items = Array.from({ length: 1000 }, (_, index) => index);
  const sampled = downsample(items, 400);
  assert.equal(sampled.length, 400);
  assert.equal(sampled[0], 0);
  assert.equal(sampled[sampled.length - 1], 999);
  assert.deepEqual(downsample([1, 2, 3]), [1, 2, 3]);
});

test("快照：新增置顶、超限丢最旧、删除生效", () => {
  const build = (id: string): BacktestSnapshot =>
    buildSnapshot({
      id,
      label: `LBL-${id}`,
      symbol: "AAPL",
      range: "1Y",
      interval: "1d",
      params: DEFAULT_PARAMS,
      equity: [
        { t: 0, value: 100 },
        { t: 86_400, value: 110 },
      ],
      stats: {
        initialCapital: 100,
        totalReturn: 10,
        benchmarkReturn: 5,
        cagr: 8,
        maxDrawdown: -3,
        maxDrawdownDays: 12,
        sharpe: 1.2,
        tradeCount: 4,
      },
    });

  let list: BacktestSnapshot[] = [];
  for (let index = 0; index < MAX_SNAPSHOTS + 2; index += 1) {
    list = addSnapshot(list, build(`s${index}`));
  }
  assert.equal(list.length, MAX_SNAPSHOTS);
  assert.equal(list[0].id, `s${MAX_SNAPSHOTS + 1}`);
  assert.ok(!list.some((item) => item.id === "s0"));

  const afterRemove = removeSnapshot(list, list[0].id);
  assert.equal(afterRemove.length, MAX_SNAPSHOTS - 1);
  assert.ok(!afterRemove.some((item) => item.id === list[0].id));
});

test("最长回撤口径：峰值 → 回到前高（含收复日）", () => {
  const equity = [
    { t: 0, value: 100 },
    { t: 86_400, value: 90 },
    { t: 2 * 86_400, value: 95 },
    { t: 3 * 86_400, value: 100 }, // 回到前高 = 收复
    { t: 4 * 86_400, value: 110 },
    { t: 5 * 86_400, value: 105 },
    { t: 6 * 86_400, value: 110 }, // 3 天收复，短于第一段
  ];
  const info = drawdownInfo(equity);
  assert.equal(info.longestDays, 3);
  assert.equal(info.series[1].value, -10);
  assert.equal(info.series[3].value, 0);
});

test("最长回撤口径：未收复算到最后一根", () => {
  const equity = [
    { t: 0, value: 100 },
    { t: 86_400, value: 90 },
    { t: 2 * 86_400, value: 80 },
    { t: 3 * 86_400, value: 85 },
  ];
  assert.equal(drawdownInfo(equity).longestDays, 3);
});

test("策略默认参数：用户未改时用策略建议值，改过则尊重用户", () => {
  const momentumMeta = STRATEGY_MAP["momentum"];
  assert.equal(resolveStrategyParams(momentumMeta, DEFAULT_PARAMS).threshold, 5);
  assert.equal(
    resolveStrategyParams(momentumMeta, { ...DEFAULT_PARAMS, threshold: 10 }).threshold,
    10,
  );

  const reversalMeta = STRATEGY_MAP["consecutive-reversal"];
  const resolved = resolveStrategyParams(reversalMeta, DEFAULT_PARAMS);
  assert.equal(resolved.slow, 3);
  assert.equal(resolved.threshold, 4);
  assert.equal(
    resolveStrategyParams(reversalMeta, { ...DEFAULT_PARAMS, slow: 5 }).slow,
    5,
  );
});

test("修复后：绝对动量 / 连跌反转在默认参数下能产生信号", () => {
  // 强上行 + 回调的合成数据：30 日 ROC 会超过 5%，也会出现连跌
  const points: ChartPoint[] = [];
  let price = 100;
  for (let index = 0; index < 400; index += 1) {
    const wave = index % 80 < 55 ? 1.004 : 0.996; // 先涨后跌的循环
    price = price * wave;
    points.push({
      t: 1_600_000_000 + index * 86_400,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1_000_000,
    });
  }

  for (const key of ["momentum", "consecutive-reversal"] as const) {
    const meta = STRATEGY_MAP[key];
    const signal = meta.signal(points, resolveStrategyParams(meta, DEFAULT_PARAMS));
    const duty = signal.reduce((sum, value) => sum + value, 0) / signal.length;
    assert.ok(duty > 0.01, `${key} 应产生信号（duty=${(duty * 100).toFixed(1)}%）`);
  }
});

test("联动口径：any = 并集、all = 交集", () => {
  const points = makeSeries(300, 86_400);
  const strategies = ["ma-cross", "rsi-reversal"];
  const anySig = buildSignals(points, { ...DEFAULT_PARAMS, strategies, combineMode: "any" });
  const allSig = buildSignals(points, { ...DEFAULT_PARAMS, strategies, combineMode: "all" });
  const a = buildSignals(points, { ...DEFAULT_PARAMS, strategies: ["ma-cross"] });
  const b = buildSignals(points, { ...DEFAULT_PARAMS, strategies: ["rsi-reversal"] });

  for (let index = 0; index < anySig.length; index += 1) {
    assert.equal(anySig[index], a[index] === 1 || b[index] === 1 ? 1 : 0);
    assert.equal(allSig[index], a[index] === 1 && b[index] === 1 ? 1 : 0);
    assert.ok(allSig[index] <= anySig[index]);
  }
});

test("出场归因：任一信号 = 刚翻空的策略，全部共振 = 破坏共振的策略", () => {
  const matrix = [
    { key: "a", label: "A 策略", series: [1, 1, 1, 0, 0, 1, 1] },
    { key: "b", label: "B 策略", series: [1, 1, 0, 0, 1, 1, 1] },
    { key: "c", label: "C 策略", series: [1, 1, 1, 1, 1, 1, 1] },
  ];

  // any：index=2 时 B 刚翻空 → 归因 B；index=3 时 A 刚翻空 → 归因 A
  assert.deepEqual(exitAttribution(matrix, 2, "any"), ["b"]);
  assert.deepEqual(exitAttribution(matrix, 3, "any"), ["a"]);

  // all：index=2 时 B 看空（破坏共振）→ B；index=3 时 A、B 都空 → 两者
  assert.deepEqual(exitAttribution(matrix, 2, "all"), ["b"]);
  assert.deepEqual(exitAttribution(matrix, 3, "all"), ["a", "b"]);
});

test("出场归因：单策略返回自身；any 模式无翻空时退化为全部", () => {
  const single = [{ key: "a", label: "A 策略", series: [1, 1, 0] }];
  assert.deepEqual(exitAttribution(single, 2, "any"), ["a"]);

  const steady = [
    { key: "a", label: "A 策略", series: [1, 1, 0] },
    { key: "b", label: "B 策略", series: [1, 1, 0] },
  ];
  // index=1 没人翻空（数据缺口等罕见情形）→ 退化为全部 key
  assert.deepEqual(exitAttribution(steady, 1, "any"), ["a", "b"]);
});

test("进场归因：任一信号/全部共振都归因到刚转多的策略", () => {
  const matrix = [
    { key: "a", label: "A 策略", series: [0, 0, 1, 1, 1] },
    { key: "b", label: "B 策略", series: [0, 1, 1, 1, 1] },
    { key: "c", label: "C 策略", series: [0, 0, 0, 1, 1] },
  ];
  assert.deepEqual(entryAttribution(matrix, 1, "any"), ["b"]);
  assert.deepEqual(entryAttribution(matrix, 2, "any"), ["a"]);
  // all 模式：共识在 index=3 才形成，这一根刚转多的是 C
  assert.deepEqual(entryAttribution(matrix, 3, "all"), ["c"]);
});

test("多策略回测：每笔交易的归因 = 出场那根刚翻空的策略（含一致性校验）", () => {
  const points = makeSeries(400, 86_400);
  const strategies = ["ma-cross", "rsi-reversal", "boll-breakout"];
  const params = { ...DEFAULT_PARAMS, strategies, combineMode: "any" } as typeof DEFAULT_PARAMS;
  const result = runBacktest(points, params, "1d");
  const matrix = buildSignalMatrix(points, params);
  assert.equal(matrix.length, 3);
  assert.ok(result.trades.length > 0);

  for (const trade of result.trades) {
    assert.ok(trade.exitKeys.length > 0, "每笔交易都有出场归因");
    assert.ok(trade.entryKeys.length > 0, "每笔交易都有进场归因");
    assert.ok(trade.reason.includes("离场"));

    const exitIndex = points.findIndex((point) => point.t === trade.exitDate);
    const entryIndex = points.findIndex((point) => point.t === trade.entryDate);
    // 归因必须与进出场时刻的信号矩阵一致（不再是拍脑袋取第一个策略）
    assert.deepEqual(trade.exitKeys, exitAttribution(matrix, exitIndex, "any"));
    assert.deepEqual(trade.entryKeys, entryAttribution(matrix, entryIndex, "any"));

    // 出场归因里的策略一定是「这一根刚由多转空」的
    for (const key of trade.exitKeys) {
      const series = matrix.find((item) => item.key === key)!.series;
      assert.equal(series[exitIndex], 0);
      assert.equal(series[exitIndex - 1], 1);
    }
    // 没有翻空的策略不应出现在出场归因里
    for (const item of matrix) {
      const flipped = item.series[exitIndex - 1] === 1 && item.series[exitIndex] === 0;
      assert.equal(trade.exitKeys.includes(item.key), flipped);
    }
  }
});
