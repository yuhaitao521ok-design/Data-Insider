"use client";

import { useMemo, useState } from "react";

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
  };
}

const PAD = { top: 16, right: 62, bottom: 26, left: 52 };

/** 净值曲线：左轴金额、右轴股价、底部时间轴，可切换叠加股价线 */
const money = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function EquityChart({
  equity,
  benchmark,
  price,
  trades,
  currency,
  labels,
}: EquityChartProps) {
  const [showPrice, setShowPrice] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  const width = 900;
  const height = 360;

  const geometry = useMemo(() => {
    if (equity.length < 2) return null;
    const innerWidth = width - PAD.left - PAD.right;
    const innerHeight = height - PAD.top - PAD.bottom;

    const moneyValues = [
      ...equity.map((item) => item.value),
      ...benchmark.map((item) => item.value),
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
        .map((item, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yMoney(item.value).toFixed(1)}`)
        .join(" ");

    const pricePath = price
      .map((item, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yPrice(item.value).toFixed(1)}`)
      .join(" ");

    const grid = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = hi - ratio * (hi - lo);
      return { y: PAD.top + ratio * innerHeight, label: money(value) };
    });

    const priceTicks = Array.from({ length: 3 }, (_, index) => {
      const ratio = index / 2;
      const value = maxPrice - ratio * (maxPrice - minPrice);
      return { y: yPrice(value), label: value.toFixed(2) };
    });

    const labelCount = equity.length >= 6 ? 6 : equity.length;
    const xLabels = Array.from({ length: labelCount }, (_, index) => {
      const pointIndex = Math.round((index / Math.max(labelCount - 1, 1)) * (equity.length - 1));
      return {
        x: xFor(pointIndex),
        label: new Intl.DateTimeFormat("zh-CN", {
          year: "2-digit",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(equity[pointIndex].t * 1000)),
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

    return {
      innerWidth,
      innerHeight,
      xFor,
      yMoney,
      strategyPath: toPath(equity),
      benchmarkPath: toPath(benchmark),
      pricePath,
      grid,
      priceTicks,
      xLabels,
      markers,
    };
  }, [equity, benchmark, price, trades]);

  if (!geometry) {
    return (
      <div className="flex h-[360px] items-center justify-center text-[12px] text-muted-foreground">
        {labels.empty}
      </div>
    );
  }

  const hovered = hover !== null ? equity[hover] : null;

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-1">
        <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-3 rounded" style={{ background: "var(--bt-strategy)" }} /> {labels.strategy}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-3 rounded" style={{ background: "var(--bt-benchmark)" }} /> {labels.benchmark}
          </span>
          <button
            type="button"
            onClick={() => setShowPrice((prev) => !prev)}
            aria-pressed={showPrice}
            className={`inline-flex items-center gap-1 rounded px-1 transition-colors hover:bg-hover hover:text-foreground ${
              showPrice ? "text-foreground" : "opacity-50"
            }`}
          >
            <span className="h-0.5 w-3 rounded border-t-2 border-dashed" style={{ borderColor: "var(--bt-price)" }} />
            {labels.price}
          </button>
        </div>
        {hovered && (
          <span className="num text-[10.5px] text-muted-foreground">
            {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(
              new Date(hovered.t * 1000),
            )}{" "}
            ·{" "}
            <span className="text-foreground">{money(hovered.value)}</span>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[320px] w-full sm:h-[360px]"
        preserveAspectRatio="none"
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
        {geometry.grid.map((line) => (
          <g key={line.y}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={line.y}
              y2={line.y}
              strokeWidth="1"
              style={{ stroke: "var(--chart-grid)" }}
            />
            <text
              x={width - PAD.right + 6}
              y={line.y + 3.5}
              fontSize="10"
              className="num"
              style={{ fill: "var(--chart-label)" }}
            >
              {line.label}
            </text>
          </g>
        ))}

        {showPrice && geometry.pricePath && (
          <path
            d={geometry.pricePath}
            fill="none"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            style={{ stroke: "var(--bt-price)", opacity: 0.9 }}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* 左侧股价刻度 */}
        {showPrice &&
          geometry.priceTicks.map((tick, index) => (
            <text
              key={`price-${index}`}
              x={PAD.left - 6}
              y={tick.y + 3.5}
              textAnchor="end"
              fontSize="10"
              className="num"
              style={{ fill: "var(--bt-price)" }}
            >
              {tick.label}
            </text>
          ))}

        <path
          d={geometry.benchmarkPath}
          fill="none"
          strokeWidth="1.1"
          style={{ stroke: "var(--bt-benchmark)", opacity: 0.85 }}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={geometry.strategyPath}
          fill="none"
          strokeWidth="1.7"
          style={{ stroke: "var(--bt-strategy)" }}
          vectorEffect="non-scaling-stroke"
        />

        {geometry.markers.map((marker, index) => (
          <circle
            key={index}
            cx={marker.x}
            cy={marker.y}
            r="2.6"
            style={{ fill: marker.kind === "buy" ? "var(--positive)" : "var(--negative)" }}
          />
        ))}

        {hover !== null && hovered && (
          <g>
            <line
              x1={geometry.xFor(hover)}
              x2={geometry.xFor(hover)}
              y1={PAD.top}
              y2={height - PAD.bottom}
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
            y={height - 6}
            textAnchor={label.anchor}
            fontSize="10"
            className="num"
            style={{ fill: "var(--chart-label)" }}
          >
            {label.label}
          </text>
        ))}
      </svg>

      <p className="px-4 pb-2 text-[10px] text-muted-foreground">
        {currency} · {labels.price}
      </p>
    </div>
  );
}
