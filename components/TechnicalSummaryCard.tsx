"use client";

import type { TechnicalSummary } from "@/lib/technical";
import { RANGE_CONFIG, INTERVAL_CONFIG, type IntervalKey, type RangeKey } from "@/lib/types";

interface TechnicalSummaryCardProps {
  summary: TechnicalSummary;
  range: RangeKey;
  interval: IntervalKey;
}

const TONE_CLASS: Record<TechnicalSummary["verdict"], string> = {
  bullish: "border-positive/35 bg-positive-soft text-positive-text",
  bearish: "border-negative/35 bg-negative-soft text-negative-text",
  neutral: "border-border bg-muted text-muted-foreground",
};

const TONE_COLOR: Record<TechnicalSummary["verdict"], string> = {
  bullish: "var(--positive)",
  bearish: "var(--negative)",
  neutral: "var(--border-strong)",
};

/** 技术面摘要：结论 + 关键状态（默认固定参数，不需要手动添加指标） */
export default function TechnicalSummaryCard({
  summary,
  range,
  interval,
}: TechnicalSummaryCardProps) {
  const color = TONE_COLOR[summary.verdict];
  const barWidth = Math.min(50, Math.abs(summary.score) / 2);
  const barLeft = summary.score >= 0 ? 50 : 50 - barWidth;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-medium">技术面</h3>
          <span className="text-[10px] text-muted-foreground">
            {RANGE_CONFIG[range].label} · {INTERVAL_CONFIG[interval].short}
          </span>
          {summary.enough && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-4 ${TONE_CLASS[summary.verdict]}`}
            >
              {summary.verdictLabel} · {summary.score > 0 ? "+" : ""}
              {summary.score}
            </span>
          )}
        </div>
        <span className="text-[9.5px] text-muted-foreground">
          MA5/20/60 · RSI14 · BOLL20 · ATR14（固定参数，默认常驻）
        </span>
      </div>

      {!summary.enough ? (
        <p className="px-4 py-3 text-[11px] leading-5 text-muted-foreground">
          当前周期数据点不足（需要 ≥ 20 根），切换到更长周期即可查看技术面摘要。
        </p>
      ) : (
        <div className="px-4 py-3">
          <div className="relative mb-3 h-1 rounded-full bg-muted">
            <span
              className="absolute top-0 h-full rounded-full transition-all duration-500"
              style={{ left: `${barLeft}%`, width: `${barWidth}%`, background: color }}
            />
            <span className="absolute left-1/2 top-1/2 h-2 w-px -translate-y-1/2 bg-border-strong" />
          </div>

          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {summary.items.map((item) => (
              <div key={item.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10.5px] text-muted-foreground">{item.label}</span>
                  <span
                    className={`num text-[11px] ${
                      item.tone === "up"
                        ? "text-positive-text"
                        : item.tone === "down"
                          ? "text-negative-text"
                          : "text-foreground/85"
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
                {item.hint && (
                  <p className="truncate text-[9.5px] leading-4 text-muted-foreground/80">
                    {item.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
