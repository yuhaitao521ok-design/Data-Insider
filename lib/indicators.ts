import type { ChartPoint } from "@/lib/types";

/**
 * 技术指标：计算 + 参数定义 + 图表渲染数据。
 *
 * 全部在前端按需计算（数据量最大几百个点），不增加接口请求，
 * 也不引入第三方指标库，保持与图表组件零依赖。
 */

export const INDICATOR_TYPES = ["MACD", "RSI", "BOLL"] as const;
export type IndicatorType = (typeof INDICATOR_TYPES)[number];

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  params: Record<string, number>;
}

export interface IndicatorParamField {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export interface IndicatorDefinition {
  type: IndicatorType;
  name: string;
  description: string;
  location: "overlay" | "pane";
  defaults: Record<string, number>;
  fields: IndicatorParamField[];
}

export const INDICATOR_DEFINITIONS: Record<IndicatorType, IndicatorDefinition> = {
  MACD: {
    type: "MACD",
    name: "MACD",
    description: "指数平滑异同平均线，判断趋势与动量",
    location: "pane",
    defaults: { fast: 12, slow: 26, signal: 9 },
    fields: [
      { key: "fast", label: "快线周期", min: 2, max: 100, step: 1, integer: true },
      { key: "slow", label: "慢线周期", min: 3, max: 200, step: 1, integer: true },
      { key: "signal", label: "信号周期", min: 2, max: 100, step: 1, integer: true },
    ],
  },
  RSI: {
    type: "RSI",
    name: "RSI",
    description: "相对强弱指标，衡量超买超卖（0–100）",
    location: "pane",
    defaults: { period: 14, overbought: 70, oversold: 30 },
    fields: [
      { key: "period", label: "周期", min: 2, max: 100, step: 1, integer: true },
      { key: "overbought", label: "超买阈值", min: 50, max: 95, step: 1, integer: true },
      { key: "oversold", label: "超卖阈值", min: 5, max: 50, step: 1, integer: true },
    ],
  },
  BOLL: {
    type: "BOLL",
    name: "BOLL",
    description: "布林带，用均线与标准差描述波动区间",
    location: "overlay",
    defaults: { period: 20, multiplier: 2 },
    fields: [
      { key: "period", label: "周期", min: 2, max: 200, step: 1, integer: true },
      { key: "multiplier", label: "标准差倍数", min: 0.5, max: 5, step: 0.1, integer: false },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*                                  指标计算                                    */
/* -------------------------------------------------------------------------- */

/** 简单移动平均 */
export function sma(values: number[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return output;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) output[i] = sum / period;
  }
  return output;
}

/** 指数移动平均（首值用前 period 个数的 SMA 初始化） */
export function ema(values: number[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return output;

  const k = 2 / (period + 1);
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = previous;

  for (let i = period; i < values.length; i += 1) {
    previous = values[i] * k + previous * (1 - k);
    output[i] = previous;
  }
  return output;
}

/** RSI（Wilder 平滑） */
export function rsi(values: number[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return output;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const current = () => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  output[period] = current();

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    output[i] = current();
  }
  return output;
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/** MACD：DIF / DEA / 柱状图（histogram = DIF − DEA） */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, index) => {
    const fastValue = fastEma[index];
    const slowValue = slowEma[index];
    return fastValue !== null && slowValue !== null ? fastValue - slowValue : null;
  });

  const signalLine: (number | null)[] = new Array(values.length).fill(null);
  const start = macdLine.findIndex((value) => value !== null);
  if (start >= 0) {
    const slice = macdLine.slice(start) as number[];
    const signalSlice = ema(slice, signalPeriod);
    signalSlice.forEach((value, index) => {
      if (value !== null) signalLine[start + index] = value;
    });
  }

  const histogram = macdLine.map((value, index) => {
    const signalValue = signalLine[index];
    return value !== null && signalValue !== null ? value - signalValue : null;
  });

  return { macd: macdLine, signal: signalLine, histogram };
}

export interface BollResult {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

/** 布林带（总体标准差） */
export function bollinger(values: number[], period = 20, multiplier = 2): BollResult {
  const middle = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i += 1) {
    const mean = middle[i];
    if (mean === null) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      variance += (values[j] - mean) ** 2;
    }
    const deviation = Math.sqrt(variance / period);
    upper[i] = mean + deviation * multiplier;
    lower[i] = mean - deviation * multiplier;
  }

  return { middle, upper, lower };
}

/* -------------------------------------------------------------------------- */
/*                              参数校验与持久化                                 */
/* -------------------------------------------------------------------------- */

export const MAX_INDICATORS = INDICATOR_TYPES.length;

export function defaultParams(type: IndicatorType): Record<string, number> {
  return { ...INDICATOR_DEFINITIONS[type].defaults };
}

/** 把任意输入收敛到合法范围（用于 localStorage 与输入框） */
export function normalizeParams(
  type: IndicatorType,
  raw: Record<string, number> | undefined,
): Record<string, number> {
  const definition = INDICATOR_DEFINITIONS[type];
  const output: Record<string, number> = {};

  for (const field of definition.fields) {
    const candidate = Number(raw?.[field.key]);
    const fallback = definition.defaults[field.key];
    let value = Number.isFinite(candidate) && candidate !== 0 ? candidate : fallback;
    value = Math.min(field.max, Math.max(field.min, value));
    value = field.integer ? Math.round(value) : Math.round(value / field.step) * field.step;
    output[field.key] = Number(value.toFixed(2));
  }
  return output;
}

/** 校验用户输入，返回中文错误信息；合法则返回 null */
export function validateParams(
  type: IndicatorType,
  params: Record<string, number>,
): string | null {
  const definition = INDICATOR_DEFINITIONS[type];

  for (const field of definition.fields) {
    const value = params[field.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${field.label}必须是数字`;
    }
    if (value < field.min || value > field.max) {
      return `${field.label}需在 ${field.min} – ${field.max} 之间`;
    }
  }

  if (type === "MACD" && params.slow <= params.fast) {
    return "慢线周期必须大于快线周期";
  }
  if (type === "RSI" && params.overbought <= params.oversold) {
    return "超买阈值必须大于超卖阈值";
  }
  return null;
}

export function sanitizeIndicatorConfigs(raw: unknown): IndicatorConfig[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<IndicatorType>();
  const configs: IndicatorConfig[] = [];

  for (const item of raw) {
    const candidate = item as { type?: unknown; params?: Record<string, number> } | null;
    const type = candidate?.type as IndicatorType | undefined;
    if (!type || !INDICATOR_TYPES.includes(type) || seen.has(type)) continue;
    seen.add(type);

    const params = normalizeParams(type, candidate?.params);
    // 反序列化时也做一次交叉校验：例如存储的 slow <= fast 直接回退默认值
    const safeParams = validateParams(type, params) ? defaultParams(type) : params;

    configs.push({ id: type, type, params: safeParams });
    if (configs.length >= MAX_INDICATORS) break;
  }

  return configs;
}

/** 指标标签上的参数摘要，例如 12 / 26 / 9、14 · 30/70、20 · 2σ */
export function paramsSummary(type: IndicatorType, params: Record<string, number>): string {
  if (type === "MACD") return `${params.fast} / ${params.slow} / ${params.signal}`;
  if (type === "RSI") return `${params.period} · ${params.oversold}/${params.overbought}`;
  return `${params.period} · ${params.multiplier}σ`;
}

export function formatIndicatorValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return value.toFixed(2);
}

/** 指标完全生效所需的最少数据点（用于提示当前周期数据不足） */
export function requiredIndicatorPoints(config: IndicatorConfig): number {
  const params = normalizeParams(config.type, config.params);
  if (config.type === "MACD") return params.slow + params.signal - 1;
  if (config.type === "RSI") return params.period + 1;
  return params.period;
}

/* -------------------------------------------------------------------------- */
/*                               图表渲染数据                                   */
/* -------------------------------------------------------------------------- */

export interface IndicatorSeries {
  label: string;
  values: (number | null)[];
  color: string;
  type: "line" | "histogram";
  dashed?: boolean;
}

export interface ChartPane {
  id: string;
  label: string;
  series: IndicatorSeries[];
  /** 固定取值范围（RSI 用 0–100） */
  domain?: [number, number];
  guides?: { value: number; label?: string }[];
  zeroLine?: boolean;
}

export interface ChartOverlay {
  id: string;
  label: string;
  band?: { upper: (number | null)[]; lower: (number | null)[]; color: string };
  series: IndicatorSeries[];
}

export interface IndicatorRenderData {
  panes: ChartPane[];
  overlays: ChartOverlay[];
}

export function buildIndicatorRenderData(
  points: ChartPoint[],
  configs: IndicatorConfig[],
): IndicatorRenderData {
  const closes = points.map((point) => point.close);
  const panes: ChartPane[] = [];
  const overlays: ChartOverlay[] = [];

  for (const config of configs) {
    const params = normalizeParams(config.type, config.params);

    if (config.type === "MACD") {
      const result = macd(closes, params.fast, params.slow, params.signal);
      panes.push({
        id: config.id,
        label: `MACD(${params.fast},${params.slow},${params.signal})`,
        series: [
          { label: "DIF", values: result.macd, color: "var(--chart-series-1)", type: "line" },
          { label: "DEA", values: result.signal, color: "var(--chart-series-2)", type: "line" },
          {
            label: "MACD",
            values: result.histogram,
            color: "var(--chart-series-1)",
            type: "histogram",
          },
        ],
        zeroLine: true,
      });
      continue;
    }

    if (config.type === "RSI") {
      panes.push({
        id: config.id,
        label: `RSI(${params.period})`,
        series: [
          {
            label: "RSI",
            values: rsi(closes, params.period),
            color: "var(--chart-series-3)",
            type: "line",
          },
        ],
        domain: [0, 100],
        guides: [
          { value: params.overbought, label: String(params.overbought) },
          { value: params.oversold, label: String(params.oversold) },
        ],
      });
      continue;
    }

    const bands = bollinger(closes, params.period, params.multiplier);
    overlays.push({
      id: config.id,
      label: `BOLL(${params.period},${params.multiplier})`,
      band: { upper: bands.upper, lower: bands.lower, color: "var(--chart-band)" },
      series: [
        {
          label: "上轨",
          values: bands.upper,
          color: "var(--chart-series-1)",
          type: "line",
          dashed: true,
        },
        { label: "中轨", values: bands.middle, color: "var(--chart-series-2)", type: "line" },
        {
          label: "下轨",
          values: bands.lower,
          color: "var(--chart-series-1)",
          type: "line",
          dashed: true,
        },
      ],
    });
  }

  return { panes, overlays };
}



