"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { STRATEGIES } from "@/lib/backtest";
import type { BacktestParams, CombineMode, StrategyKey } from "@/lib/backtest";

interface StrategyPickerProps {
  params: BacktestParams;
  onChange: (next: Partial<BacktestParams>) => void;
}

/** 多策略选择（可勾选多个）+ 悬停说明（做什么 / 优点 / 缺点） */
export default function StrategyPicker({ params, onChange }: StrategyPickerProps) {
  const { t } = useI18n();
  const [peek, setPeek] = useState<string | null>(null);

  function toggle(key: StrategyKey) {
    const active = params.strategies.includes(key);
    const next = active
      ? params.strategies.filter((item) => item !== key)
      : [...params.strategies, key];
    onChange({ strategies: next.length > 0 ? next : [key] });
  }

  const peeked = STRATEGIES.find((item) => item.key === peek) ?? null;

  return (
    <div>
      <div className="space-y-0.5">
        {STRATEGIES.map((meta) => {
          const active = params.strategies.includes(meta.key);
          return (
            <label
              key={meta.key}
              onMouseEnter={() => setPeek(meta.key)}
              onMouseLeave={() => setPeek((prev) => (prev === meta.key ? null : prev))}
              onFocus={() => setPeek(meta.key)}
              onBlur={() => setPeek((prev) => (prev === meta.key ? null : prev))}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted-foreground hover:bg-hover hover:text-foreground"
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(meta.key)}
                className="h-3 w-3 shrink-0 accent-[var(--accent)]"
                aria-label={t(meta.label)}
              />
              <span className="min-w-0 flex-1 truncate">{t(meta.label)}</span>
              <span
                className="shrink-0 text-[10px] text-muted-foreground/60"
                aria-hidden="true"
                title={t("悬停查看说明")}
              >
                ⓘ
              </span>
            </label>
          );
        })}
      </div>

      {peeked && (
        <div className="mt-2 rounded-lg border border-border bg-muted/60 p-2">
          <p className="text-[11px] font-medium text-foreground">{t(peeked.label)}</p>
          <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">
            {t(peeked.summary)}
          </p>
          <p className="mt-1 text-[10.5px] leading-4 text-positive-text">
            <span className="font-medium">{t("优点")}：</span>
            {t(peeked.pros)}
          </p>
          <p className="mt-0.5 text-[10.5px] leading-4 text-negative-text">
            <span className="font-medium">{t("缺点")}：</span>
            {t(peeked.cons)}
          </p>
        </div>
      )}

      {params.strategies.length > 1 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5">
          <span className="text-[10.5px] text-muted-foreground">{t("联动")}</span>
          <div className="inline-flex items-center gap-0.5 rounded bg-muted p-0.5">
            {([
              { key: "any", label: t("任一信号") },
              { key: "all", label: t("全部共振") },
            ] as { key: CombineMode; label: string }[]).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onChange({ combineMode: item.key })}
                aria-pressed={params.combineMode === item.key}
                className={`h-5 rounded px-1.5 text-[10px] transition-colors ${
                  params.combineMode === item.key
                    ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
