"use client";

interface MiniLineChartProps {
  points: { t: number; value: number }[];
  /** 参考线（例如 0 或 100） */
  baseline?: number;
  /** 线的颜色（CSS 变量或色值） */
  color?: string;
  height?: number;
  /** 纵轴取值格式 */
  format?: (value: number) => string;
  empty: string;
}

/** 极简 SVG 折线图：用于滚动相关性、等权组合等小面板（无需图表库） */
export default function MiniLineChart({
  points,
  baseline,
  color = "var(--accent)",
  height = 132,
  format = (value) => value.toFixed(2),
  empty,
}: MiniLineChartProps) {
  if (points.length < 2) {
    return (
      <div
        className="grid place-items-center rounded-lg border border-border/60 text-[11px] text-muted-foreground"
        style={{ height }}
      >
        {empty}
      </div>
    );
  }

  const width = 600;
  const pad = { top: 12, right: 8, bottom: 8, left: 8 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;

  const values = points.map((point) => point.value);
  if (baseline !== undefined) values.push(baseline);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (index: number) => pad.left + (index / (points.length - 1)) * innerWidth;
  const y = (value: number) => pad.top + innerHeight - ((value - min) / span) * innerHeight;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`)
    .join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(2)},${(pad.top + innerHeight).toFixed(
    2,
  )} L${x(0).toFixed(2)},${(pad.top + innerHeight).toFixed(2)} Z`;

  const last = points[points.length - 1].value;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
      >
        {baseline !== undefined && (
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--border)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}
        <path d={area} fill={color} fillOpacity="0.1" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <div className="pointer-events-none absolute inset-x-1 top-0 flex justify-between text-[9.5px] text-muted-foreground">
        <span>{format(max)}</span>
        <span>{format(min)}</span>
      </div>
      <div className="pointer-events-none absolute bottom-0 right-1 text-[9.5px] text-foreground/70">
        {format(last)}
      </div>
    </div>
  );
}
