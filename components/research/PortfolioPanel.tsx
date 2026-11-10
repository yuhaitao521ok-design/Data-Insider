"use client";

import { useMemo } from "react";

import type { ResearchRow } from "@/components/research/types";
import { formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { equallyWeightedSeries, normalizedSeries, riskMetrics } from "@/lib/quant";
import type { ChartPoint } from "@/lib/types";

interface PortfolioPanelProps {
  rows: ResearchRow[];
  /** SPY 收盘价，用于基准对比 */
  benchmark: ChartPoint[] | null;
}

/** 等权组合：把标的池当成一个策略，看分散后波动/夏普有没有变好 */
export default function PortfolioPanel({ rows, benchmark }: PortfolioPanelProps) {
  const { t } = useI18n();

  const portfolio = useMemo(
    () => equallyWeightedSeries(rows.map((row) => ({ symbol: row.symbol, points: row.points }))),
    [rows],
  );

  const metrics = useMemo(() => {
    if (portfolio.length < 3) return null;
    const points: ChartPoint[] = portfolio.map((point) => ({
      t: point.t,
      open: point.value,
      high: point.value,
      low: point.value,
      close: point.value,
      volume: null,
    }));
    return riskMetrics(points);
  }, [portfolio]);

  const benchmarkSeries = useMemo(
    () => (benchmark && benchmark.length > 1 ? normalizedSeries(benchmark) : []),
    [benchmark],
  );

  const diversification = useMemo(() => {
    if (!metrics?.volatility) return null;
    const volumes = rows
      .map((row) => row.metrics.volatility)
      .filter((value): value is number => value !== null);
    if (volumes.length === 0) return null;
    const average = volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
    return average - metrics.volatility;
  }, [metrics, rows]);

  if (portfolio.length < 3) {
    return (
      <p className="px-4 py-6 text-[11.5px] text-muted-foreground">
        {rows.length === 0 ? t("暂无数据") : t("样本不足，至少需要 3 个共同交易日")}
      </p>
    );
  }

  const width = 600;
  const height = 168;
  const pad = { top: 12, right: 8, bottom: 10, left: 8 };
  const all = [
    ...portfolio.map((point) => point.value),
    ...benchmarkSeries.map((point) => point.value),
  ];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const start = Math.min(portfolio[0].t, benchmarkSeries[0]?.t ?? portfolio[0].t);
  const end = Math.max(
    portfolio[portfolio.length - 1].t,
    benchmarkSeries[benchmarkSeries.length - 1]?.t ?? portfolio[portfolio.length - 1].t,
  );
  const timeSpan = end - start || 1;
  const px = (time: number) => pad.left + ((time - start) / timeSpan) * (width - pad.left - pad.right);
  const py = (value: number) => pad.top + (height - pad.top - pad.bottom) * (1 - (value - min) / span);
  const line = (series: { t: number; value: number }[]) =>
    series.map((point, index) => `${index === 0 ? "M" : "L"}${px(point.t).toFixed(2)},${py(point.value).toFixed(2)}`).join(" ");

  const stats = [
    { label: t("年化收益"), value: formatPercent(metrics?.annualReturn ?? null, 1) },
    {
      label: t("年化波动"),
      value: formatPercent(metrics?.volatility ?? null, 1).replace("+", ""),
    },
    { label: t("夏普"), value: formatNumber(metrics?.sharpe ?? null, 2) },
    { label: t("最大回撤"), value: formatPercent(metrics?.maxDrawdown ?? null, 2) },
    {
      label: t("分散化收益"),
      value: diversification === null ? "--" : `${formatNumber(diversification, 1)} pp`,
    },
  ];

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-4 rounded-full bg-accent" />
            {t("等权组合")}
          </span>
          {benchmarkSeries.length > 1 && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-4 rounded-full bg-muted-foreground/60" />
              {t("基准 SPY")}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{t("起点归一化 100")}</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img">
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={py(100)}
          y2={py(100)}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        {benchmarkSeries.length > 1 && (
          <path
            d={line(benchmarkSeries)}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeOpacity="0.6"
            strokeWidth="1.2"
          />
        )}
        <path d={line(portfolio)} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
      </svg>

      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-5">
        {stats.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
            <span className="num text-foreground/85">{item.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {t("标的池全部等权、每日再平衡；分散化收益 = 个股平均波动 − 组合实际波动，越大说明分散越有效。")}
      </p>
    </div>
  );
}
