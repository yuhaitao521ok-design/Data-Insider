import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTechnicalSummary } from "@/lib/technical";
import type { ChartPoint } from "@/lib/types";

function series(closeOf: (index: number) => number, count: number): ChartPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const close = closeOf(index);
    return {
      t: 1_600_000_000 + index * 86_400,
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1_000_000 + (index % 5) * 20_000,
    };
  });
}

const meta = (price: number) => ({
  price,
  week52High: price * 1.1,
  week52Low: price * 0.8,
});

test("技术面：打分与色调必须同向（正分=up、负分=down）", () => {
  const uptrend = series((i) => 100 * 1.005 ** i, 260);
  const downtrend = series((i) => 100 * 0.995 ** i, 260);
  for (const points of [uptrend, downtrend]) {
    const summary = buildTechnicalSummary(points, meta(points[points.length - 1].close));
    for (const item of summary.items) {
      // 参与打分的维度：分与色必须同向；信息项（maxPoints=0）用色调表达倾向，不约束
      if (item.maxPoints === 0) continue;
      const expected = item.points > 0 ? "up" : item.points < 0 ? "down" : "neutral";
      assert.equal(
        item.tone,
        expected,
        `${item.label} 分数 ${item.points} 与色调 ${item.tone} 不一致`,
      );
    }
  }
});

test("技术面：短期与长期视角可以给出不同结论", () => {
  // 长期上涨、最近 12 根回调：短期偏空、长期明显更乐观
  const points = series(
    (i) => (i < 250 ? 100 * 1.004 ** i : 100 * 1.004 ** 250 * 0.992 ** (i - 250)),
    262,
  );
  const summary = buildTechnicalSummary(points, meta(points[points.length - 1].close));

  assert.ok(summary.enough);
  assert.ok(
    summary.longTerm.score > summary.shortTerm.score,
    `长期 ${summary.longTerm.score} 应显著高于短期 ${summary.shortTerm.score}`,
  );
  assert.equal(summary.shortTerm.verdict, "bearish", "短期应判为偏空");
  assert.notEqual(summary.longTerm.verdict, "bearish", "长期不应跟着急跌判空");
  assert.ok(summary.shortTerm.drivers.length > 0, "短期有主要依据");
  assert.ok(summary.longTerm.drivers.length > 0, "长期有主要依据");
});

test("技术面：单边趋势下短长结论方向一致", () => {
  const up = series((i) => 100 * 1.005 ** i, 260);
  const upSummary = buildTechnicalSummary(up, meta(up[up.length - 1].close));
  assert.equal(upSummary.shortTerm.verdict, "bullish");
  assert.equal(upSummary.longTerm.verdict, "bullish");
  assert.equal(upSummary.overall.verdict, "bullish");

  const down = series((i) => 100 * 0.995 ** i, 260);
  const downSummary = buildTechnicalSummary(down, meta(down[down.length - 1].close));
  assert.equal(downSummary.shortTerm.verdict, "bearish");
  assert.equal(downSummary.longTerm.verdict, "bearish");
  assert.equal(downSummary.overall.verdict, "bearish");
});

test("技术面：综合 = 短期与长期的平均，且结论在两者之间", () => {
  const points = series((i) => 100 * 1.003 ** i * (1 + 0.02 * Math.sin(i / 25)), 260);
  const summary = buildTechnicalSummary(points, meta(points[points.length - 1].close));
  const expected = Math.round((summary.shortTerm.score + summary.longTerm.score) / 2);
  assert.equal(summary.overall.score, expected);
  assert.equal(summary.score, summary.overall.score, "兼容字段 score 等于综合分");
  assert.equal(summary.verdict, summary.overall.verdict, "兼容字段 verdict 等于综合结论");
});

test("技术面：维度归属清晰，信息项不参与打分", () => {
  const points = series((i) => 100 * 1.002 ** i, 260);
  const summary = buildTechnicalSummary(points, meta(100 * 1.002 ** 259));
  assert.ok(summary.items.length >= 8, `维度数量 ${summary.items.length}`);

  for (const item of summary.items) {
    assert.ok(["short", "long", "both"].includes(item.horizon), `${item.label} 缺视角归属`);
    if (item.horizon === "both") {
      assert.equal(item.maxPoints, 0, `信息项 ${item.label} 不应参与打分`);
      assert.equal(item.points, 0);
    } else {
      assert.ok(item.maxPoints > 0, `${item.label} 打分上限应大于 0`);
    }
  }
  // 短期/长期都应覆盖到打分维度
  assert.ok(summary.items.some((item) => item.horizon === "short"));
  assert.ok(summary.items.some((item) => item.horizon === "long"));
});

test("技术面：数据不足时明确提示，且不乱给结论", () => {
  const points = series((i) => 100 + i, 30);
  const summary = buildTechnicalSummary(points, meta(130));
  assert.equal(summary.enough, false);
  assert.equal(summary.verdictLabel, "数据不足");
  assert.equal(summary.score, 0);
});

test("技术面：空 / 极短数据不抛错", () => {
  assert.doesNotThrow(() => buildTechnicalSummary([], null));
  assert.doesNotThrow(() => buildTechnicalSummary(series((i) => 100 + i, 3), undefined));
  const empty = buildTechnicalSummary([], null);
  assert.equal(empty.enough, false);
});
