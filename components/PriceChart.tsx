"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChartPoint, IntervalKey, RangeKey } from "@/lib/types";
import type { ChartOverlay, ChartPane } from "@/lib/indicators";
import { formatIndicatorValue } from "@/lib/indicators";
import { formatAxisTime, formatCompact, formatFullTime, formatPrice } from "@/lib/format";

interface PriceChartProps {
  points: ChartPoint[];
  range: RangeKey;
  interval: IntervalKey;
  timezone: string;
  currency: string;
  /** 上涨用绿色，下跌用红色 */
  positive: boolean;
  /** 昨收参考线（仅分时图展示） */
  reference?: number | null;
  /** 叠加在主图上的指标（BOLL） */
  overlays?: ChartOverlay[];
  /** 副图指标（MACD / RSI） */
  panes?: ChartPane[];
}

const PAD_TOP = 18;
const PAD_RIGHT = 62;
const PAD_BOTTOM = 22;
const PAD_LEFT = 8;
const VOLUME_GAP = 18;
const PANE_HEIGHT = 78;
const PANE_GAP = 10;

interface LineGeometry {
  key: string;
  color: string;
  dashed?: boolean;
  width: number;
  path: string;
  points: { x: number; y: number }[];
}

interface HistogramPaths {
  positive: string;
  negative: string;
  width: number;
}

interface PaneGeometry {
  id: string;
  label: string;
  top: number;
  height: number;
  min: number;
  max: number;
  yFor: (value: number) => number;
  lines: LineGeometry[];
  histograms: HistogramPaths[];
  guides: { value: number; y: number; label?: string }[];
  zeroY: number | null;
  yLabels: { y: number; label: string }[];
}

interface Geometry {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  priceBottom: number;
  volumeTop: number;
  volumeHeight: number;
  xFor: (index: number) => number;
  yFor: (price: number) => number;
  linePath: string;
  areaPath: string;
  volumePaths: HistogramPaths;
  gridLines: { y: number; label: string }[];
  xLabels: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
  referenceY: number | null;
  overlayBands: { key: string; path: string; color: string }[];
  overlayLines: LineGeometry[];
  panes: PaneGeometry[];
  panesBottom: number;
}

const formatTick = (value: number): string =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 把可能包含 null 的数值序列转成折线路径（null 处断开） */
function buildLine(
  values: (number | null)[],
  xFor: (index: number) => number,
  yFor: (value: number) => number,
): { path: string; points: { x: number; y: number }[] } {
  const points: { x: number; y: number }[] = [];
  let path = "";
  let drawing = false;

  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      drawing = false;
      return;
    }
    const x = xFor(index);
    const y = yFor(value);
    points.push({ x, y });
    path += `${drawing ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)} `;
    drawing = true;
  });

  return { path: path.trim(), points };
}

function numericValues(values: (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null && Number.isFinite(value));
}

export default function PriceChart({
  points,
  range,
  interval,
  timezone,
  currency,
  positive,
  reference,
  overlays = [],
  panes = [],
}: PriceChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId().replace(/[:]/g, "");

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo<Geometry | null>(() => {
    const width = size.width;
    const height = size.height;
    if (width < 120 || height < 140 || points.length < 2) return null;

    const paneCount = panes.length;
    const volumeHeight = Math.min(38, Math.max(18, height * 0.08));
    const priceHeight =
      height -
      PAD_TOP -
      PAD_BOTTOM -
      volumeHeight -
      VOLUME_GAP -
      paneCount * (PANE_HEIGHT + PANE_GAP);
    if (priceHeight < 70) return null;

    const innerWidth = width - PAD_LEFT - PAD_RIGHT;
    const priceBottom = PAD_TOP + priceHeight;

    const closes = points.map((point) => point.close);
    let min = Math.min(...closes);
    let max = Math.max(...closes);

    if (reference && reference > 0 && reference > min * 0.85 && reference < max * 1.15) {
      min = Math.min(min, reference);
      max = Math.max(max, reference);
    }

    // 把 BOLL 上下轨也纳入主图价格区间，避免叠加线被裁掉
    for (const overlay of overlays) {
      for (const series of overlay.series) {
        for (const value of numericValues(series.values)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
    }

    const priceSpan = max - min || Math.max(max * 0.01, 0.01);
    min -= priceSpan * 0.08;
    max += priceSpan * 0.08;

    const xFor = (index: number) =>
      PAD_LEFT + (index / Math.max(points.length - 1, 1)) * innerWidth;
    const yFor = (price: number) => PAD_TOP + ((max - price) / (max - min)) * priceHeight;

    const linePath = points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${xFor(index).toFixed(2)} ${yFor(point.close).toFixed(2)}`,
      )
      .join(" ");
    const areaPath = `${linePath} L${xFor(points.length - 1).toFixed(2)} ${priceBottom} L${PAD_LEFT} ${priceBottom} Z`;

    const maxVolume = Math.max(...points.map((point) => point.volume ?? 0), 1);
    const volumeTop = priceBottom + VOLUME_GAP;
    const barWidth = Math.max(1, innerWidth / points.length - 0.8);
    const volumeBase = volumeTop + volumeHeight;
    let volumePositive = "";
    let volumeNegative = "";

    points.forEach((point, index) => {
      const value = point.volume ?? 0;
      if (value <= 0) return;
      const barHeight = Math.max(1, (value / maxVolume) * volumeHeight);
      const x = xFor(index).toFixed(2);
      const segment = `M${x} ${(volumeBase - barHeight).toFixed(2)}V${volumeBase.toFixed(2)}`;
      if (point.close >= (point.open ?? point.close)) volumePositive += segment;
      else volumeNegative += segment;
    });

    const volumePaths = { positive: volumePositive, negative: volumeNegative, width: barWidth };

    const gridLines = Array.from({ length: 4 }, (_, index) => {
      const ratio = index / 3;
      const value = max - ratio * (max - min);
      return { y: PAD_TOP + ratio * priceHeight, label: formatTick(value) };
    });

    const labelCount = points.length >= 6 ? 6 : points.length;
    const xLabels = Array.from({ length: labelCount }, (_, index) => {
      const pointIndex =
        labelCount === 1 ? 0 : Math.round((index / (labelCount - 1)) * (points.length - 1));
      return {
        x: xFor(pointIndex),
        label: formatAxisTime(points[pointIndex].t, range, timezone, interval),
        anchor: (index === 0 ? "start" : index === labelCount - 1 ? "end" : "middle") as
          | "start"
          | "middle"
          | "end",
      };
    });

    const referenceY =
      reference && reference > 0 && reference >= min && reference <= max ? yFor(reference) : null;

    /* ---------------------------- 主图叠加指标 ---------------------------- */

    const overlayLines: LineGeometry[] = [];
    const overlayBands: { key: string; path: string; color: string }[] = [];

    for (const overlay of overlays) {
      if (overlay.band) {
        const band = overlay.band;
        let segment: { index: number; upper: number; lower: number }[] = [];

        const flush = () => {
          if (segment.length > 1) {
            const top = segment.map(
              (item) => `${xFor(item.index).toFixed(2)} ${yFor(item.upper).toFixed(2)}`,
            );
            const bottom = segment
              .slice()
              .reverse()
              .map((item) => `${xFor(item.index).toFixed(2)} ${yFor(item.lower).toFixed(2)}`);
            overlayBands.push({
              key: `${overlay.id}-band-${overlayBands.length}`,
              path: `M${top.join(" L")} L${bottom.join(" L")} Z`,
              color: band.color,
            });
          }
          segment = [];
        };

        band.upper.forEach((upper, index) => {
          const lower = band.lower[index];
          if (
            upper === null ||
            lower === null ||
            !Number.isFinite(upper) ||
            !Number.isFinite(lower)
          ) {
            flush();
            return;
          }
          segment.push({ index, upper, lower });
        });
        flush();
      }

      overlay.series.forEach((series, seriesIndex) => {
        const line = buildLine(series.values, xFor, yFor);
        if (!line.path) return;
        overlayLines.push({
          key: `${overlay.id}-${seriesIndex}`,
          color: series.color,
          dashed: series.dashed,
          width: 1.2,
          path: line.path,
          points: line.points,
        });
      });
    }

    /* ------------------------------ 副图指标 ------------------------------ */

    const panesTop = priceBottom + VOLUME_GAP + volumeHeight + (paneCount > 0 ? PANE_GAP : 0);
    const formatPaneTick = (value: number) =>
      value.toLocaleString("en-US", { maximumFractionDigits: 2 });

    const paneGeometries: PaneGeometry[] = panes.map((pane, paneIndex) => {
      const top = panesTop + paneIndex * (PANE_HEIGHT + PANE_GAP);
      const allValues = pane.series.flatMap((series) => numericValues(series.values));
      const hasHistogram = pane.series.some((series) => series.type === "histogram");

      let paneMin: number;
      let paneMax: number;
      if (pane.domain) {
        [paneMin, paneMax] = pane.domain;
      } else {
        paneMin = allValues.length > 0 ? Math.min(...allValues) : -1;
        paneMax = allValues.length > 0 ? Math.max(...allValues) : 1;
        if (pane.zeroLine || hasHistogram) {
          paneMin = Math.min(paneMin, 0);
          paneMax = Math.max(paneMax, 0);
        }
        const padding = (paneMax - paneMin || Math.max(Math.abs(paneMax) * 0.01, 0.01)) * 0.12;
        paneMin -= padding;
        paneMax += padding;
      }

      const paneSpan = paneMax - paneMin || 1;
      const paneYFor = (value: number) => top + ((paneMax - value) / paneSpan) * PANE_HEIGHT;
      const paneLines: LineGeometry[] = [];
      const paneHistograms: HistogramPaths[] = [];
      const histogramWidth = Math.max(1, innerWidth / points.length - 0.8);

      pane.series.forEach((series, seriesIndex) => {
        if (series.type === "histogram") {
          const zero = paneYFor(0);
          let positive = "";
          let negative = "";
          series.values.forEach((value, index) => {
            if (value === null || !Number.isFinite(value)) return;
            const y = paneYFor(value);
            const segment = `M${xFor(index).toFixed(2)} ${Math.min(y, zero).toFixed(2)}V${Math.max(y, zero).toFixed(2)}`;
            if (value >= 0) positive += segment;
            else negative += segment;
          });
          paneHistograms.push({ positive, negative, width: histogramWidth });
          return;
        }

        const line = buildLine(series.values, xFor, paneYFor);
        if (!line.path) return;
        paneLines.push({
          key: `${pane.id}-${seriesIndex}`,
          color: series.color,
          dashed: series.dashed,
          width: 1.2,
          path: line.path,
          points: line.points,
        });
      });

      const guides = (pane.guides ?? [])
        .filter((guide) => guide.value >= paneMin && guide.value <= paneMax)
        .map((guide) => ({ ...guide, y: paneYFor(guide.value) }));

      return {
        id: pane.id,
        label: pane.label,
        top,
        height: PANE_HEIGHT,
        min: paneMin,
        max: paneMax,
        yFor: paneYFor,
        lines: paneLines,
        histograms: paneHistograms,
        guides,
        zeroY: pane.zeroLine || hasHistogram ? paneYFor(0) : null,
        yLabels: [
          { y: top + 10, label: formatPaneTick(paneMax) },
          { y: top + PANE_HEIGHT - 1, label: formatPaneTick(paneMin) },
        ],
      };
    });

    const panesBottom =
      paneGeometries.length > 0
        ? paneGeometries[paneGeometries.length - 1].top + PANE_HEIGHT
        : priceBottom;

    return {
      width,
      height,
      padLeft: PAD_LEFT,
      padRight: PAD_RIGHT,
      padTop: PAD_TOP,
      priceBottom,
      volumeTop,
      volumeHeight,
      xFor,
      yFor,
      linePath,
      areaPath,
      volumePaths,
      gridLines,
      xLabels,
      referenceY,
      overlayBands,
      overlayLines,
      panes: paneGeometries,
      panesBottom,
    };
  }, [points, range, interval, timezone, reference, overlays, panes, size]);


  if (!geometry) {
    return (
      <div
        ref={wrapRef}
        className="relative flex w-full items-center justify-center text-[12px] text-muted-foreground [--chart-h:250px] sm:[--chart-h:310px] lg:[--chart-h:370px]"
        style={{ height: `calc(var(--chart-h) + ${panes.length * (PANE_HEIGHT + PANE_GAP)}px)` }}
      >
        暂无走势数据
      </div>
    );
  }

  const stroke = positive ? "var(--positive)" : "var(--negative)";
  const hovered = hover !== null ? points[hover] : null;
  const hoverIndex = hover ?? 0;
  const hoverGeom =
    hover !== null ? { x: geometry.xFor(hover), y: geometry.yFor(points[hover].close) } : null;
  const tooltipLeft = hoverGeom
    ? Math.min(Math.max(hoverGeom.x - 104, 8), Math.max(geometry.width - 216, 8))
    : 0;
  const legendStyle = {
    fill: "var(--chart-label)",
    paintOrder: "stroke" as const,
    stroke: "var(--card)",
    strokeWidth: 3,
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full [--chart-h:250px] sm:[--chart-h:310px] lg:[--chart-h:370px]"
      style={{ height: `calc(var(--chart-h) + ${panes.length * (PANE_HEIGHT + PANE_GAP)}px)` }}
    >
      <svg width={geometry.width} height={geometry.height} className="block overflow-visible">
        <defs>
          <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: stroke }} stopOpacity="0.18" />
            <stop offset="100%" style={{ stopColor: stroke }} stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.gridLines.map((line) => (
          <g key={line.y}>
            <line
              x1={geometry.padLeft}
              x2={geometry.width - geometry.padRight}
              y1={line.y}
              y2={line.y}
              strokeWidth="1"
              style={{ stroke: "var(--chart-grid)" }}
            />
            <text
              x={geometry.width - geometry.padRight + 8}
              y={line.y + 3.5}
              fontSize="10"
              className="num"
              style={{ fill: "var(--chart-label)" }}
            >
              {line.label}
            </text>
          </g>
        ))}

        {geometry.overlayBands.map((band) => (
          <path key={band.key} d={band.path} style={{ fill: band.color }} />
        ))}

        {geometry.referenceY !== null && (
          <g>
            <line
              x1={geometry.padLeft}
              x2={geometry.width - geometry.padRight}
              y1={geometry.referenceY}
              y2={geometry.referenceY}
              strokeWidth="1"
              strokeDasharray="4 4"
              style={{ stroke: "var(--chart-reference)" }}
            />
            <text
              x={geometry.padLeft + 2}
              y={geometry.referenceY - 5}
              fontSize="9"
              style={{ fill: "var(--chart-label)" }}
            >
              昨收
            </text>
          </g>
        )}

        {geometry.overlayLines.map((line) => (
          <path
            key={line.key}
            d={line.path}
            fill="none"
            strokeWidth={line.width}
            strokeDasharray={line.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ stroke: line.color }}
          />
        ))}

        {geometry.volumePaths.positive && (
          <path
            d={geometry.volumePaths.positive}
            fill="none"
            strokeWidth={geometry.volumePaths.width}
            opacity="0.24"
            style={{ stroke: "var(--positive)" }}
          />
        )}
        {geometry.volumePaths.negative && (
          <path
            d={geometry.volumePaths.negative}
            fill="none"
            strokeWidth={geometry.volumePaths.width}
            opacity="0.24"
            style={{ stroke: "var(--negative)" }}
          />
        )}

        <path d={geometry.areaPath} fill={`url(#grad-${gradientId})`} />
        <path
          key={`${range}-${points.length}-${points[0]?.t ?? 0}`}
          d={geometry.linePath}
          fill="none"
          strokeWidth="1.6"
          style={{ stroke }}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="chart-line"
        />

        {geometry.panes.map((pane) => (
          <g key={pane.id}>
            <line
              x1={geometry.padLeft}
              x2={geometry.width - geometry.padRight}
              y1={pane.top}
              y2={pane.top}
              strokeWidth="1"
              style={{ stroke: "var(--chart-grid)" }}
            />

            {pane.zeroY !== null && (
              <line
                x1={geometry.padLeft}
                x2={geometry.width - geometry.padRight}
                y1={pane.zeroY}
                y2={pane.zeroY}
                strokeWidth="1"
                strokeDasharray="2 3"
                style={{ stroke: "var(--chart-reference)" }}
              />
            )}

            {pane.guides.map((guide) => (
              <g key={`${pane.id}-guide-${guide.value}`}>
                <line
                  x1={geometry.padLeft}
                  x2={geometry.width - geometry.padRight}
                  y1={guide.y}
                  y2={guide.y}
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  style={{ stroke: "var(--chart-reference)" }}
                />
                <text
                  x={geometry.width - geometry.padRight + 8}
                  y={guide.y + 3}
                  fontSize="9"
                  className="num"
                  style={{ fill: "var(--chart-label)" }}
                >
                  {guide.label ?? guide.value}
                </text>
              </g>
            ))}

            {pane.histograms.map((histogram, index) => (
              <g key={`${pane.id}-histogram-${index}`}>
                {histogram.positive && (
                  <path
                    d={histogram.positive}
                    fill="none"
                    strokeWidth={histogram.width}
                    opacity="0.5"
                    style={{ stroke: "var(--positive)" }}
                  />
                )}
                {histogram.negative && (
                  <path
                    d={histogram.negative}
                    fill="none"
                    strokeWidth={histogram.width}
                    opacity="0.5"
                    style={{ stroke: "var(--negative)" }}
                  />
                )}
              </g>
            ))}

            {pane.lines.map((line) => (
              <path
                key={line.key}
                d={line.path}
                fill="none"
                strokeWidth={line.width}
                strokeDasharray={line.dashed ? "4 3" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: line.color }}
              />
            ))}

            <text
              x={geometry.padLeft + 2}
              y={pane.top + 11}
              fontSize="9.5"
              className="num"
              style={legendStyle}
            >
              {pane.label}
            </text>

            {pane.yLabels.map((label, index) => (
              <text
                key={`${pane.id}-y-${index}`}
                x={geometry.width - geometry.padRight + 8}
                y={label.y}
                fontSize="9"
                className="num"
                style={{ fill: "var(--chart-label)" }}
              >
                {label.label}
              </text>
            ))}
          </g>
        ))}

        {hover !== null &&
          geometry.panes.map((pane, index) => {
            const series = panes[index]?.series.find((item) => item.type === "line");
            const value = series?.values[hover];
            if (value === null || value === undefined || !Number.isFinite(value)) return null;
            return (
              <circle
                key={`dot-${pane.id}`}
                cx={geometry.xFor(hover)}
                cy={pane.yFor(value)}
                r="3"
                strokeWidth="1.5"
                style={{ fill: series?.color, stroke: "var(--card)" }}
              />
            );
          })}


        {hoverGeom && (
          <g>
            <line
              x1={hoverGeom.x}
              x2={hoverGeom.x}
              y1={geometry.padTop}
              y2={geometry.panesBottom}
              strokeWidth="1"
              strokeDasharray="3 3"
              style={{ stroke: "var(--chart-crosshair)" }}
            />
            <circle
              cx={hoverGeom.x}
              cy={hoverGeom.y}
              r="4"
              strokeWidth="2"
              style={{ fill: stroke, stroke: "var(--card)" }}
            />
          </g>
        )}

        {geometry.xLabels.map((label, index) => (
          <text
            key={`${label.label}-${index}`}
            x={label.x}
            y={geometry.height - 6}
            textAnchor={label.anchor}
            fontSize="10"
            className="num"
            style={{ fill: "var(--chart-label)" }}
          >
            {label.label}
          </text>
        ))}

        <rect
          x={geometry.padLeft}
          y={0}
          width={Math.max(geometry.width - geometry.padLeft - geometry.padRight, 1)}
          height={geometry.height}
          fill="transparent"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
            const index = Math.round(ratio * (points.length - 1));
            setHover(Math.min(points.length - 1, Math.max(0, index)));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-[208px] rounded-lg border border-border bg-popover/95 p-2.5 text-[10.5px] shadow-[var(--shadow-pop)]"
          style={{ left: tooltipLeft }}
        >
          <div className="mb-1 text-muted-foreground">{formatFullTime(hovered.t, timezone)}</div>
          <div className="num text-[15px] font-medium" style={{ color: stroke }}>
            {formatPrice(hovered.close, currency)}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
            <span>开</span>
            <span className="num text-right text-foreground/80">
              {formatPrice(hovered.open, currency)}
            </span>
            <span>高</span>
            <span className="num text-right text-foreground/80">
              {formatPrice(hovered.high, currency)}
            </span>
            <span>低</span>
            <span className="num text-right text-foreground/80">
              {formatPrice(hovered.low, currency)}
            </span>
            <span>量</span>
            <span className="num text-right text-foreground/80">
              {formatCompact(hovered.volume)}
            </span>
          </div>

          {overlays.map((overlay) => (
            <div key={overlay.id} className="mt-1.5 border-t border-border pt-1.5">
              <div className="mb-0.5 text-muted-foreground">{overlay.label}</div>
              {overlay.series.map((series) => (
                <div key={series.label} className="flex justify-between gap-2">
                  <span style={{ color: series.color }}>{series.label}</span>
                  <span className="num text-foreground/85">
                    {formatIndicatorValue(series.values[hoverIndex])}
                  </span>
                </div>
              ))}
            </div>
          ))}

          {panes.map((pane) => (
            <div key={pane.id} className="mt-1.5 border-t border-border pt-1.5">
              <div className="mb-0.5 text-muted-foreground">{pane.label}</div>
              {pane.series.map((series) => (
                <div key={series.label} className="flex justify-between gap-2">
                  <span style={{ color: series.color }}>{series.label}</span>
                  <span className="num text-foreground/85">
                    {formatIndicatorValue(series.values[hoverIndex])}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}


