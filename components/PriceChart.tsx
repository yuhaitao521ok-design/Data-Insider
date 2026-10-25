"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChartPoint, RangeKey } from "@/lib/types";
import { formatAxisTime, formatCompact, formatFullTime, formatPrice } from "@/lib/format";

interface PriceChartProps {
  points: ChartPoint[];
  range: RangeKey;
  timezone: string;
  currency: string;
  /** 上涨用绿色，下跌用红色 */
  positive: boolean;
  /** 昨收参考线（仅分时图展示） */
  reference?: number | null;
}

interface Geometry {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  plotHeight: number;
  min: number;
  max: number;
  xFor: (index: number) => number;
  yFor: (price: number) => number;
  linePath: string;
  areaPath: string;
  bars: { x: number; width: number; y: number; height: number; up: boolean }[];
  gridLines: { y: number; label: string }[];
  xLabels: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
  referenceY: number | null;
}

const PRICE_DIGITS = 2;

export default function PriceChart({
  points,
  range,
  timezone,
  currency,
  positive,
  reference,
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
    if (width < 120 || height < 120 || points.length < 2) return null;

    const padTop = 18;
    const padRight = 62;
    const padBottom = 22;
    const padLeft = 8;
    const volumeHeight = Math.min(38, Math.max(18, height * 0.12));
    const gap = 18;
    const plotHeight = height - padTop - padBottom - volumeHeight - gap;
    const innerWidth = width - padLeft - padRight;

    const closes = points.map((point) => point.close);
    let min = Math.min(...closes);
    let max = Math.max(...closes);

    if (reference && reference > 0 && reference > min * 0.85 && reference < max * 1.15) {
      min = Math.min(min, reference);
      max = Math.max(max, reference);
    }

    const span = max - min || Math.max(max * 0.01, 0.01);
    min -= span * 0.08;
    max += span * 0.08;

    const xFor = (index: number) =>
      padLeft + (index / Math.max(points.length - 1, 1)) * innerWidth;
    const yFor = (price: number) => padTop + ((max - price) / (max - min)) * plotHeight;

    const linePath = points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${xFor(index).toFixed(2)} ${yFor(point.close).toFixed(2)}`,
      )
      .join(" ");
    const baseline = padTop + plotHeight;
    const areaPath = `${linePath} L${xFor(points.length - 1).toFixed(2)} ${baseline} L${padLeft} ${baseline} Z`;

    const maxVolume = Math.max(...points.map((point) => point.volume ?? 0), 1);
    const barWidth = Math.max(1, innerWidth / points.length - 0.8);
    const bars = points.map((point, index) => {
      const value = point.volume ?? 0;
      const barHeight = Math.max(value > 0 ? 1 : 0, (value / maxVolume) * volumeHeight);
      const open = point.open ?? point.close;
      return {
        x: xFor(index) - barWidth / 2,
        width: barWidth,
        y: baseline + gap + volumeHeight - barHeight,
        height: barHeight,
        up: point.close >= open,
      };
    });

    const gridLines = Array.from({ length: 4 }, (_, index) => {
      const ratio = index / 3;
      const value = max - ratio * (max - min);
      return {
        y: padTop + ratio * plotHeight,
        label: value.toLocaleString("en-US", {
          minimumFractionDigits: PRICE_DIGITS,
          maximumFractionDigits: PRICE_DIGITS,
        }),
      };
    });

    const labelCount = points.length >= 6 ? 6 : points.length;
    const xLabels = Array.from({ length: labelCount }, (_, index) => {
      const pointIndex =
        labelCount === 1 ? 0 : Math.round((index / (labelCount - 1)) * (points.length - 1));
      return {
        x: xFor(pointIndex),
        label: formatAxisTime(points[pointIndex].t, range, timezone),
        anchor: (index === 0 ? "start" : index === labelCount - 1 ? "end" : "middle") as
          | "start"
          | "middle"
          | "end",
      };
    });

    const referenceY =
      reference && reference > 0 && reference >= min && reference <= max ? yFor(reference) : null;

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      plotHeight,
      min,
      max,
      xFor,
      yFor,
      linePath,
      areaPath,
      bars,
      gridLines,
      xLabels,
      referenceY,
    };
  }, [points, range, timezone, reference, size]);

  const stroke = positive ? "var(--positive)" : "var(--negative)";
  const hovered = hover !== null ? points[hover] : null;
  const hoverGeom =
    hover !== null && geometry
      ? { x: geometry.xFor(hover), y: geometry.yFor(points[hover].close) }
      : null;
  const tooltipLeft =
    hoverGeom && geometry
      ? Math.min(Math.max(hoverGeom.x - 88, 8), Math.max(geometry.width - 196, 8))
      : 0;

  return (
    <div ref={wrapRef} className="relative h-[250px] w-full sm:h-[310px] lg:h-[370px]">
      {!geometry ? (
        <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
          暂无走势数据
        </div>
      ) : (
        <>
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

            {geometry.bars.map((bar, index) => (
              <rect
                key={`bar-${index}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                opacity="0.24"
                style={{ fill: bar.up ? "var(--positive)" : "var(--negative)" }}
              />
            ))}

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

            {hoverGeom && (
              <g>
                <line
                  x1={hoverGeom.x}
                  x2={hoverGeom.x}
                  y1={geometry.padTop}
                  y2={geometry.padTop + geometry.plotHeight}
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
                const offsetX = event.clientX - rect.left;
                const ratio = offsetX / Math.max(rect.width, 1);
                const index = Math.round(ratio * (points.length - 1));
                setHover(Math.min(points.length - 1, Math.max(0, index)));
              }}
              onPointerLeave={() => setHover(null)}
            />
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute top-2 z-10 w-[188px] rounded-lg border border-border bg-popover/95 p-2.5 text-[11px] shadow-[var(--shadow-pop)]"
              style={{ left: tooltipLeft }}
            >
              <div className="mb-1 text-muted-foreground">{formatFullTime(hovered.t, timezone)}</div>
              <div className="num text-base font-semibold" style={{ color: stroke }}>
                {formatPrice(hovered.close, currency)}
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
                <span>开</span>
                <span className="num text-right text-foreground/80">{formatPrice(hovered.open, currency)}</span>
                <span>高</span>
                <span className="num text-right text-foreground/80">{formatPrice(hovered.high, currency)}</span>
                <span>低</span>
                <span className="num text-right text-foreground/80">{formatPrice(hovered.low, currency)}</span>
                <span>量</span>
                <span className="num text-right text-foreground/80">{formatCompact(hovered.volume)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

