"use client";

import { useI18n } from "@/lib/i18n";

import type { HorizonView, TechnicalSummary, Verdict } from "@/lib/technical";
import { RANGE_CONFIG, INTERVAL_CONFIG, type IntervalKey, type RangeKey } from "@/lib/types";

interface TechnicalSummaryCardProps {
  summary: TechnicalSummary;
  range: RangeKey;
  interval: IntervalKey;
}

const VERDICT_CLASS: Record<Verdict, string> = {
  bullish: "border-positive/35 bg-positive-soft text-positive-text",
  bearish: "border-negative/35 bg-negative-soft text-negative-text",
  neutral: "border-border bg-muted text-muted-foreground",
};

const VERDICT_COLOR: Record<Verdict, string> = {
  bullish: "var(--positive)",
  bearish: "var(--negative)",
  neutral: "var(--border-strong)",
};

/** 单视角（短期 / 长期 / 综合）迷你卡：结论 + 分数条 + 主要依据 */
function HorizonPanel({ view, label }: { view: HorizonView; label: string }) {
  const { t } = useI18n();
  const color = VERDICT_COLOR[view.verdict];
  const barWidth = Math.min(50, Math.abs(view.score) / 2);
  const barLeft = view.score >= 0 ? 50 : 50 - barWidth;

  return (
    <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-muted-foreground">{t(label)}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-4 ${VERDICT_CLASS[view.verdict]}`}
        >
          {t(view.verdictLabel)} · {view.score > 0 ? "+" : ""}
          {view.score}
        </span>
      </div>
      <div className="relative mt-1.5 h-1 rounded-full bg-muted">
        <span
          className="absolute top-0 h-full rounded-full transition-all duration-500"
          style={{ left: `${barLeft}%`, width: `${barWidth}%`, background: color }}
        />
        <span className="absolute left-1/2 top-1/2 h-2 w-px -translate-y-1/2 bg-border-strong" />
      </div>
      <p className="mt-1 truncate text-[9.5px] leading-4 text-muted-foreground/80">
        {view.drivers.length > 0 ? (
          <>
            {t("主要依据")}：{view.drivers.map((driver) => t(driver)).join("、")}
          </>
        ) : (
          t("各维度信号相互抵消")
        )}
      </p>
    </div>
  );
}

/** 技术面摘要：综合 + 短期 / 长期双视角 + 多维度明细 */
export default function TechnicalSummaryCard({
  summary,
  range,
  interval,
}: TechnicalSummaryCardProps) {
  const { t } = useI18n();

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-medium">{t("技术面")}</h3>
          <span className="text-[10px] text-muted-foreground">
            {t(RANGE_CONFIG[range].label)} · {INTERVAL_CONFIG[interval].short}
          </span>
          {summary.enough && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-4 ${VERDICT_CLASS[summary.overall.verdict]}`}
            >
              {t("综合")} {t(summary.overall.verdictLabel)} · {summary.overall.score > 0 ? "+" : ""}
              {summary.overall.score}
            </span>
          )}
        </div>
        <span className="text-[9.5px] text-muted-foreground">
          {t("MA5/20/60 · RSI14 · MACD · ADX14 · ROC · 量能 · ATR（固定参数）")}
        </span>
      </div>

      {!summary.enough ? (
        <p className="px-4 py-3 text-[11px] leading-5 text-muted-foreground">
          {t("当前周期数据点不足（需要 ≥ 60 根），切换到更长周期即可查看技术面摘要")}
        </p>
      ) : (
        <div className="px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <HorizonPanel view={summary.shortTerm} label="短期（1–4 周）" />
            <HorizonPanel view={summary.longTerm} label="长期（3–6 月）" />
          </div>

          <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {summary.items.map((item) => (
              <div key={item.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10.5px] text-muted-foreground">
                    {t(item.label)}
                    <span
                      className={`ml-1 rounded px-1 text-[8.5px] leading-3 ${
                        item.horizon === "short"
                          ? "bg-accent-soft text-accent"
                          : item.horizon === "long"
                            ? "bg-muted text-muted-foreground"
                            : "bg-muted/60 text-muted-foreground/80"
                      }`}
                    >
                      {item.horizon === "short" ? t("短") : item.horizon === "long" ? t("长") : t("参考")}
                    </span>
                  </span>
                  <span
                    className={`num text-[11px] ${
                      item.tone === "up"
                        ? "text-positive-text"
                        : item.tone === "down"
                          ? "text-negative-text"
                          : "text-foreground/85"
                    }`}
                  >
                    {t(item.value)}
                  </span>
                </div>
                {item.hint && (
                  <p className="truncate text-[9.5px] leading-4 text-muted-foreground/80">
                    {t(item.hint)}
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
