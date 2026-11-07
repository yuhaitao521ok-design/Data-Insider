"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Point {
  t: number;
  value: number;
}

interface EquityChartProps {
  equity: Point[];
  benchmark: Point[];
  price: Point[];
  /** 交易标记（买入/卖出时间戳） */
  trades: { entryDate: number; exitDate: number }[];
  currency: string;
  labels: {
    strategy: string;
    benchmark: string;
    price: string;
    empty: string;
    buy: string;
    sell: string;
    initial: string;
  };
  /** 对比曲线（历史快照），叠加在同一坐标系 */
  overlays?: { label: string; equity: Point[]; color: string }[];
}

const PAD = { top: 18, right: 62, bottom: 28, left: 60 };

const money = (value: number) =>
  Math.abs(value) >= 1000
    ? `${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`
    : value.toLocaleString("en-US", { maximumFractionDigits: 0 });

const full = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 2 : 0 });

/**
 * 净值曲线：左轴金额、右轴股价、底部时间轴。
 * 宽度按容器实测（不再拉伸 viewBox），曲线与刻度始终清晰。
 */
export default function EquityChart({
  equity,
  benchmark,
  price,
  trades,
  currency,
  labels,
  overlays = [],
}: EquityChartProps) {
  const [showPrice, setShowPrice] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(Math.round(next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = width < 560 ? 260 : 340;

  const geometry = useMemo(() => {
    if (equity.length < 2) return null;
    const innerWidth = Math.max(width - PAD.left - PAD.right, 10);
    const innerHeight = height - PAD.top - PAD.bottom;

    const moneyValues = [
      ...equity.map((item) => item.value),
      ...benchmark.map((item) => item.value),
      ...overlays.flatMap((item) => item.equity.map((point) => point.value)),
    ];
    const minMoney = Math.min(...moneyValues);
    const maxMoney = Math.max(...moneyValues);
    const spanMoney = maxMoney - minMoney || Math.max(maxMoney * 0.02, 1);
    const lo = minMoney - spanMoney * 0.08;
    const hi = maxMoney + spanMoney * 0.08;

    const priceValues = price.map((item) => item.value);
    const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : 0;
    const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : 1;
    const spanPrice = maxPrice - minPrice || 1;

    const xFor = (index: number) =>
      PAD.left + (index / Math.max(equity.length - 1, 1)) * innerWidth;
    const yMoney = (value: number) => PAD.top + ((hi - value) / (hi - lo)) * innerHeight;
    const yPrice = (value: number) =>
      PAD.top + ((maxPrice + spanPrice * 0.08 - value) / (spanPrice * 1.16)) * innerHeight;

    const toPath = (series: Point[]) =>
      series
        .map(
          (item, index) =>
            `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yMoney(item.value).toFixed(1)}`,
        )
        .join(" ");

    const strategyPath = toPath(equity);
    const areaPath = `${strategyPath} L${xFor(equity.length - 1).toFixed(1)} ${(
      PAD.top + innerHeight
    ).toFixed(1)} L${xFor(0).toFixed(1)} ${(PAD.top + innerHeight).toFixed(1)} Z`;

    const pricePath = price
      .map(
        (item, index) =>
          `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yPrice(item.value).toFixed(1)}`,
      )
      .join(" ");

    const grid = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = hi - ratio * (hi - lo);
      return { y: PAD.top + ratio * innerHeight, label: money(value) };
    });

    const priceTicks = Array.from({ length: 3 }, (_, index) => {
      const ratio = index / 2;
      const value = maxPrice - ratio * (maxPrice - minPrice);
      return { y: yPrice(value), label: value.toFixed(value < 30 ? 2 : 1) };
    });

    const spanDays = (equity[equity.length - 1].t - equity[0].t) / 86_400;
    const dateFormat = new Intl.DateTimeFormat(
      "zh-CN",
      spanDays > 400 ? { year: "2-digit", month: "2-digit" } : { month: "2-digit", day: "2-digit" },
    );

    const labelCount = Math.min(equity.length, width < 560 ? 3 : 6);
    const xLabels = Array.from({ length: labelCount }, (_, index) => {
      const pointIndex = Math.round((index / Math.max(labelCount - 1, 1)) * (equity.length - 1));
      return {
        x: xFor(pointIndex),
        label: dateFormat.format(new Date(equity[pointIndex].t * 1000)),
        anchor: (index === 0 ? "start" : index === labelCount - 1 ? "end" : "middle") as
          | "start"
          | "middle"
          | "end",
      };
    });

    // 交易标记：按时间戳对齐到最近的索引
    const indexByTime = new Map<number, number>();
    equity.forEach((item, index) => indexByTime.set(item.t, index));
    const markers = trades.flatMap((trade) => {
      const entry = indexByTime.get(trade.entryDate);
      const exit = indexByTime.get(trade.exitDate);
      const result: { x: number; y: number; kind: "buy" | "sell" }[] = [];
      if (entry !== undefined) {
        result.push({ x: xFor(entry), y: yMoney(equity[entry].value), kind: "buy" });
      }
      if (exit !== undefined) {
        result.push({ x: xFor(exit), y: yMoney(equity[exit].value), kind: "sell" });
      }
      return result;
    });

    const initialValue = benchmark[0]?.value ?? equity[0]?.value ?? 0;

    const overlayPaths = overlays.map((item) => ({
      label: item.label,
      color: item.color,
      path: item.equity
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${(
              PAD.left +
              (index / Math.max(item.equity.length - 1, 1)) * innerWidth
            ).toFixed(1)} ${yMoney(point.value).toFixed(1)}`,
        )
        .join(" "),
    }));

    return {
      innerHeight,
      xFor,
      yMoney,
      overlayPaths,
      strategyPath,
      areaPath,
      benchmarkPath: toPath(benchmark),
      pricePath,
      grid,
      priceTicks,
      xLabels,
      markers,
      initial: initialValue >= lo && initialValue <= hi ? yMoney(initialValue) : null,
    };
  }, [equity, benchmark, price, trades, overlays, width, height]);

  if (!geometry) {
    return (
      <div className="flex h-[300px] items-center justify-center text-[12px] text-muted-foreground">
        {labels.empty}
      </div>
    );
  }

  const hovered = hover !== null ? equity[hover] : null;
  const hoveredBenchmark = hover !== null ? benchmark[hover] : null;
  const hoveredPrice = hover !== null ? price[hover] : null;
  const plotBottom = PAD.top + geometry.innerHeight;
  const tooltipLeft = hover !== null ? Math.min(Math.max(geometry.xFor(hover), 96), width - 96) : 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-1.5 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--bt-strategy)" }} />
          {labels.strategy}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded" style={{ background: "var(--bt-benchmark)" }} />
          {labels.benchmark}
        </span>
        {geometry.overlayPaths.map((item) => (
          <span key={`legend-${item.label}`} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowPrice((prev) => !prev)}
          aria-pressed={showPrice}
          className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-hover hover:text-foreground ${
            showPrice ? "text-foreground" : "opacity-50"
          }`}
        >
          <span
            className="h-0.5 w-3.5 rounded border-t-2 border-dashed"
            style={{ borderColor: "var(--bt-price)" }}
          />
          {labels.price}
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className="text-[9px]" style={{ color: "var(--positive)" }}>▲</span>
          {labels.buy}
          <span className="ml-1 text-[9px]" style={{ color: "var(--negative)" }}>▼</span>
          {labels.sell}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        role="img"
        aria-label={labels.strategy}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio =
            (event.clientX - rect.left - (PAD.left / width) * rect.width) /
            Math.max(rect.width * (1 - (PAD.left + PAD.right) / width), 1);
          const index = Math.round(ratio * (equity.length - 1));
          setHover(Math.min(equity.length - 1, Math.max(0, index)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="bt-equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bt-strategy)" stopOpacity="0.24" />
            <stop offset="55%" stopColor="var(--bt-strategy)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--bt-strategy)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.grid.map((line) => (
          <g key={`grid-${line.y}`}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={line.y}
              y2={line.y}
              strokeWidth="1"
              style={{ stroke: "var(--chart-grid)" }}
            />
            <text
              x={PAD.left - 8}
              y={line.y + 3.5}
              textAnchor="end"
              fontSize="10"
              className="num"
              style={{ fill: "var(--chart-label)" }}
            >
              {line.label}
            </text>
          </g>
        ))}

        {/* 初始资金参考线 */}
        {geometry.initial !== null && (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geometry.initial}
              y2={geometry.initial}
              strokeWidth="1"
              strokeDasharray="2 4"
              style={{ stroke: "var(--chart-reference)" }}
            />
            <text
              x={PAD.left + 4}
              y={geometry.initial - 4}
              fontSize="9"
              style={{ fill: "var(--chart-label)" }}
            >
              {labels.initial}
            </text>
          </g>
        )}

        {showPrice && geometry.pricePath && (
          <path
            d={geometry.pricePath}
            fill="none"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            style={{ stroke: "var(--bt-price)", opacity: 0.85 }}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* 右侧股价刻度 */}
        {showPrice &&
          geometry.priceTicks.map((tick, index) => (
            <text
              key={`price-${index}`}
              x={width - PAD.right + 8}
              y={tick.y + 3.5}
              fontSize="10"
              className="num"
              style={{ fill: "var(--bt-price)" }}
            >
              {tick.label}
            </text>
          ))}

        <path d={geometry.areaPath} fill="url(#bt-equity-fill)" style={{ pointerEvents: "none" }} />
        <path
          d={geometry.benchmarkPath}
          fill="none"
          strokeWidth="1.1"
          style={{ stroke: "var(--bt-benchmark)", opacity: 0.7 }}
          vectorEffect="non-scaling-stroke"
        />
        {geometry.overlayPaths.map((item) => (
          <path
            key={item.label}
            d={item.path}
            fill="none"
            strokeWidth="1.4"
            strokeLinejoin="round"
            style={{ stroke: item.color, opacity: 0.92 }}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={geometry.strategyPath}
          fill="none"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: "var(--bt-strategy)" }}
          vectorEffect="non-scaling-stroke"
        />

        {geometry.markers.map((marker, index) => (
          <path
            key={`marker-${index}`}
            d={
              marker.kind === "buy"
                ? `M${marker.x} ${marker.y - 3.8} L${marker.x + 3.3} ${marker.y + 2.6} L${marker.x - 3.3} ${marker.y + 2.6} Z`
                : `M${marker.x} ${marker.y + 3.8} L${marker.x + 3.3} ${marker.y - 2.6} L${marker.x - 3.3} ${marker.y - 2.6} Z`
            }
            style={{
              fill: marker.kind === "buy" ? "var(--positive)" : "var(--negative)",
              opacity: 0.9,
            }}
          />
        ))}

        {hover !== null && hovered && (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={geometry.xFor(hover)}
              x2={geometry.xFor(hover)}
              y1={PAD.top}
              y2={plotBottom}
              strokeWidth="1"
              strokeDasharray="3 3"
              style={{ stroke: "var(--chart-crosshair)" }}
            />
            <circle
              cx={geometry.xFor(hover)}
              cy={geometry.yMoney(hovered.value)}
              r="4"
              strokeWidth="2"
              style={{ fill: "var(--bt-strategy)", stroke: "var(--card)" }}
            />
          </g>
        )}

        {geometry.xLabels.map((label, index) => (
          <text
            key={`${label.label}-${index}`}
            x={label.x}
            y={height - 8}
            textAnchor={label.anchor}
            fontSize="10"
            className="num"
            style={{ fill: "var(--chart-label)" }}
          >
            {label.label}
          </text>
        ))}
      </svg>

      {hover !== null && hovered && (
        <div
          className="pointer-events-none absolute top-7 z-10 min-w-[150px] -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-2.5 py-2 shadow-[var(--shadow-pop)] backdrop-blur"
          style={{ left: tooltipLeft }}
        >
          <p className="num text-[10px] text-muted-foreground">
            {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(
              new Date(hovered.t * 1000),
            )}
          </p>
          <div className="mt-1 space-y-0.5">
            <div className="flex items-center justify-between gap-3 text-[10.5px]">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "var(--bt-strategy)" }}
                />
                {labels.strategy}
              </span>
              <span className="num text-foreground">{full(hovered.value)}</span>
            </div>
            {hoveredBenchmark && (
              <div className="flex items-center justify-between gap-3 text-[10.5px]">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="h-0.5 w-2 rounded" style={{ background: "var(--bt-benchmark)" }} />
                  {labels.benchmark}
                </span>
                <span className="num text-muted-foreground">{full(hoveredBenchmark.value)}</span>
              </div>
            )}
            {showPrice && hoveredPrice && (
              <div className="flex items-center justify-between gap-3 text-[10.5px]">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span
                    className="h-0.5 w-2 rounded border-t border-dashed"
                    style={{ borderColor: "var(--bt-price)" }}
                  />
                  {labels.price}
                </span>
                <span className="num" style={{ color: "var(--bt-price)" }}>
                  {full(hoveredPrice.value)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="px-4 pb-2 pt-1 text-[10px] text-muted-foreground">
        {currency} · {labels.price}
      </p>
    </div>
  );
}
