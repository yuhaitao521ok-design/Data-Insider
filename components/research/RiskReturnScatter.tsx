"use client";

import type { ResearchRow } from "@/components/research/types";
import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

interface RiskReturnScatterProps {
  rows: ResearchRow[];
  focusSymbol: string | null;
  onFocus: (symbol: string) => void;
}

/** 收益-风险象限：横轴年化波动，纵轴年化收益，越靠左上性价比越高 */
export default function RiskReturnScatter({ rows, focusSymbol, onFocus }: RiskReturnScatterProps) {
  const { t } = useI18n();

  const points = rows
    .map((row) => ({
      symbol: row.symbol,
      x: row.metrics.volatility,
      y: row.metrics.annualReturn ?? row.metrics.totalReturn,
      sharpe: row.metrics.sharpe,
    }))
    .filter((point): point is { symbol: string; x: number; y: number; sharpe: number | null } =>
      point.x !== null && point.y !== null,
    );

  if (points.length < 2) {
    return (
      <p className="px-4 py-6 text-[11.5px] text-muted-foreground">
        {rows.length === 0 ? t("暂无数据") : t("样本不足，至少 2 只标的才有象限图")}
      </p>
    );
  }

  const width = 520;
  const height = 280;
  const pad = { top: 16, right: 14, bottom: 26, left: 38 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(...xs) * 1.08 || 1;
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys) * 1.08 || 1;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  };
  const xMid = median(xs);
  const yMid = median(ys);

  const px = (value: number) => pad.left + ((value - xMin) / xSpan) * (width - pad.left - pad.right);
  const py = (value: number) => height - pad.bottom - ((value - yMin) / ySpan) * (height - pad.top - pad.bottom);

  const labelled = [...points].sort((a, b) => (b.sharpe ?? -99) - (a.sharpe ?? -99)).slice(0, 5);
  const labelledSet = new Set(labelled.map((point) => point.symbol));
  if (focusSymbol) labelledSet.add(focusSymbol);

  return (
    <div className="p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        <rect
          x={pad.left}
          y={pad.top}
          width={width - pad.left - pad.right}
          height={height - pad.top - pad.bottom}
          fill="var(--muted)"
          fillOpacity="0.25"
          rx="6"
        />
        <line
          x1={px(xMid)}
          x2={px(xMid)}
          y1={pad.top}
          y2={height - pad.bottom}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={py(yMid)}
          y2={py(yMid)}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={py(0)}
          y2={py(0)}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />
        <line
          x1={px(0)}
          x2={px(0)}
          y1={pad.top}
          y2={height - pad.bottom}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />

        {points.map((point) => {
          const active = focusSymbol === point.symbol;
          const positive = (point.sharpe ?? 0) >= 0;
          return (
            <g key={point.symbol} onClick={() => onFocus(point.symbol)} className="cursor-pointer">
              <circle
                cx={px(point.x)}
                cy={py(point.y)}
                r={active ? 5 : 3.4}
                fill={positive ? "var(--positive)" : "var(--negative)"}
                fillOpacity={active ? 0.95 : 0.6}
                stroke={active ? "var(--foreground)" : "transparent"}
                strokeWidth="1"
              >
                <title>{`${point.symbol} · ${t("年化波动")} ${formatPercent(point.x, 1).replace(
                  "+",
                  "",
                )} · ${t("年化收益")} ${formatPercent(point.y, 1)}`}</title>
              </circle>
              {(active || labelledSet.has(point.symbol)) && (
                <text
                  x={px(point.x) + 6}
                  y={py(point.y) + 3}
                  fontSize="8.5"
                  fill="var(--foreground)"
                  opacity={active ? 1 : 0.7}
                >
                  {point.symbol}
                </text>
              )}
            </g>
          );
        })}

        <text x={pad.left} y={height - 8} fontSize="8.5" fill="var(--muted-foreground)">
          {t("年化波动 →")}
        </text>
        <text
          x={10}
          y={pad.top + 4}
          fontSize="8.5"
          fill="var(--muted-foreground)"
          transform={`rotate(-90 10 ${pad.top + 4})`}
          textAnchor="end"
        >
          {t("年化收益 →")}
        </text>
      </svg>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {t("左上=高收益低波动（最优），右下=高波动低收益；虚线为池内中位数，绿点夏普为正。")}
      </p>
    </div>
  );
}
