import { test } from "node:test";
import assert from "node:assert/strict";

import { alignReturns, alphaBeta, timedReturns } from "@/lib/quant";
import type { TimedReturn } from "@/lib/quant";
import type { ChartPoint } from "@/lib/types";

function series(values: number[], step = 86_400): ChartPoint[] {
  return values.map((close, index) => ({
    t: 1_600_000_000 + index * step,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  }));
}

test("alignReturns：按时间戳取交集，忽略不匹配的日期", () => {
  const a: TimedReturn[] = [
    { t: 1, r: 0.01 },
    { t: 2, r: 0.02 },
    { t: 3, r: 0.03 },
  ];
  const b: TimedReturn[] = [
    { t: 2, r: -0.01 },
    { t: 3, r: -0.02 },
    { t: 4, r: -0.03 },
  ];
  const aligned = alignReturns(a, b);
  assert.deepEqual(aligned.a, [0.02, 0.03]);
  assert.deepEqual(aligned.b, [-0.01, -0.02]);
});

test("alphaBeta：标的 = 2 倍基准 → beta≈2、alpha≈0", () => {
  const bench: TimedReturn[] = [];
  const stock: TimedReturn[] = [];
  for (let index = 0; index < 120; index += 1) {
    const r = Math.sin(index / 5) * 0.01;
    bench.push({ t: index, r });
    stock.push({ t: index, r: r * 2 });
  }
  const result = alphaBeta(stock, bench);
  assert.ok(result.beta !== null && Math.abs(result.beta - 2) < 0.01);
  assert.ok(result.alphaAnnualized !== null && Math.abs(result.alphaAnnualized) < 0.5);
  assert.ok(result.samples === 120);
});

test("alphaBeta：标的每天多涨 1% → 年化 alpha 为正且接近 252%", () => {
  const bench: TimedReturn[] = [];
  const stock: TimedReturn[] = [];
  for (let index = 0; index < 120; index += 1) {
    const r = Math.sin(index / 7) * 0.012;
    bench.push({ t: index, r });
    stock.push({ t: index, r: r + 0.01 });
  }
  const result = alphaBeta(stock, bench);
  assert.ok(result.alphaAnnualized !== null);
  assert.ok(result.alphaAnnualized! > 240 && result.alphaAnnualized! < 265);
});

test("alphaBeta：样本不足或基准无波动时返回 null", () => {
  const few: TimedReturn[] = Array.from({ length: 5 }, (_, index) => ({ t: index, r: 0.01 }));
  assert.equal(alphaBeta(few, few).beta, null);

  const flat: TimedReturn[] = Array.from({ length: 60 }, (_, index) => ({ t: index, r: 0 }));
  const moving: TimedReturn[] = Array.from({ length: 60 }, (_, index) => ({
    t: index,
    r: Math.sin(index / 4) * 0.01,
  }));
  assert.equal(alphaBeta(moving, flat).beta, null);
});

test("timedReturns：跳过零价样本并保留时间戳", () => {
  const points = series([100, 110, 0, 121]);
  const returns = timedReturns(points);
  // 第 3 根 close=0 → 该样本与下一根（分母为 0）都被跳过
  assert.equal(returns.length, 1);
  assert.equal(returns[0].t, points[1].t);
  assert.ok(Math.abs(returns[0].r - 0.1) < 1e-9);
});