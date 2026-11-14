import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BACK_TO_TOP_THRESHOLD,
  scrollProgress,
  shouldShowBackToTop,
} from "@/lib/back-to-top";

test("回到顶部：超过阈值才显示，边界值不提前出现", () => {
  assert.equal(shouldShowBackToTop(0), false);
  assert.equal(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD), false);
  assert.equal(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD + 1), true);
  assert.equal(shouldShowBackToTop(2400), true);
});

test("回到顶部：异常滚动值不显示按钮（避免 NaN / 负值误判）", () => {
  assert.equal(shouldShowBackToTop(Number.NaN), false);
  assert.equal(shouldShowBackToTop(-120), false);
  assert.equal(shouldShowBackToTop(800, 1200), false);
});

test("回到顶部：进度环覆盖 0–1 并夹在边界内", () => {
  assert.equal(scrollProgress(0, 1000), 0);
  assert.equal(scrollProgress(250, 1000), 0.25);
  assert.equal(scrollProgress(1000, 1000), 1);
  assert.equal(scrollProgress(1600, 1000), 1);
  assert.equal(scrollProgress(-40, 1000), 0);
});

test("回到顶部：短页面 / 非法数值时进度为 0，不会出现 NaN", () => {
  assert.equal(scrollProgress(0, 0), 0);
  assert.equal(scrollProgress(120, -50), 0);
  assert.equal(scrollProgress(Number.NaN, 600), 0);
  assert.equal(scrollProgress(200, Number.POSITIVE_INFINITY), 0);
});
