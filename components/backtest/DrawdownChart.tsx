"use client";

import { useEffect, useRef, useState } from "react";

interface Point {
  t: number;
  value: number;
}

interface DrawdownChartProps {
  /** 回撤百分比序列（<= 0） */
  drawdown: Point[];
  label: string;
  empty: string;
}

const PAD = { top: 10, right: 52, bottom: 8, left: 52 };

/** 回撤水下图：显示净值距历史高点的回撤深度与持续时间 */
export default function DrawdownChart({ drawdown, label, empty }: DrawdownChartProps) {
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

  const height = 116;

  const geometry = (() => {
    if (drawdown.length < 2) return null;
    const innerWidth = Math.max(width - PAD.left - PAD.right, 10);
    const innerHeight = height - PAD.top - PAD.bottom;

    const worst = Math.min(...drawdown.map((item) => item.value), -0.01);
    const lo = worst * 1.12;

    const xFor = (index: number) =>
      PAD.left + (index / Math.max(drawdown.length - 1, 1)) * innerWidth;
    const yFor = (value: number) => PAD.top + (value / lo) * innerHeight;

    const linePath = drawdown
      .map(
        (item, index) =>
          `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yFor(item.value).toFixed(1)}`,
      )
      .join(" ");
    const areaPath = `${linePath} L${xFor(drawdown.length - 1).toFixed(1)} ${PAD.top} L${xFor(0).toFixed(1)} ${PAD.top} Z`;

    // 两条参考线：-50% / -25% / 最深
    const ticks = [-25, -50, -75]
      .filter((value) => value * 1.0 > lo)
      .map((value) => ({ y: yFor(value), label: `${value}%` }));

    return { linePath, areaPath, ticks, worst };
  })();

  return (
    <div ref={wrapRef} className="relative w-full">
      {!geometry ? (
        <div className="flex h-[96px] items-center justify-center text-[11px] text-muted-foreground">
          {empty}
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={label}>
            <defs>
              <linearGradient id="bt-drawdown-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--negative)" stopOpacity="0.04" />
                <stop offset="100%" stopColor="var(--negative)" stopOpacity="0.32" />
              </linearGradient>
            </defs>

            {/* 顶部基线（0%） */}
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top}
              y2={PAD.top}
              strokeWidth="1"
              style={{ stroke: "var(--chart-grid)" }}
            />
            {geometry.ticks.map((tick) => (
              <g key={tick.label}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={tick.y}
                  y2={tick.y}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  style={{ stroke: "var(--chart-grid)" }}
                />
                <text
                  x={width - PAD.right + 6}
                  y={tick.y + 3.5}
                  fontSize="9.5"
                  className="num"
                  style={{ fill: "var(--chart-label)" }}
                >
                  {tick.label}
                </text>
              </g>
            ))}

            <path d={geometry.areaPath} fill="url(#bt-drawdown-fill)" />
            <path
              d={geometry.linePath}
              fill="none"
              strokeWidth="1.3"
              strokeLinejoin="round"
              style={{ stroke: "var(--negative)", opacity: 0.85 }}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <p className="px-4 pb-1.5 text-[10px] text-muted-foreground">
            {label} · <span className="num">{geometry.worst.toFixed(2)}%</span>
          </p>
        </>
      )}
    </div>
  );
}