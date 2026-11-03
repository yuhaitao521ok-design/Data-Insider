"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { STRATEGIES } from "@/lib/backtest";
import type { BacktestParams, CombineMode, StrategyKey } from "@/lib/backtest";

interface StrategyPickerProps {
  params: BacktestParams;
  onChange: (next: Partial<BacktestParams>) => void;
}

/**
 * 多策略选择（可勾选多个）+ 悬停说明（做什么 / 优点 / 缺点）。
 * 说明卡片高度固定、联动开关常驻占位，悬停或勾选时布局不会跳动。
 */
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
  const multi = params.strategies.length > 1;

  return (
    <div>
      <div
        className="max-h-[216px] space-y-0.5 overflow-y-auto pr-0.5 scroll-thin sm:max-h-[312px]"
        onMouseLeave={() => setPeek(null)}
      >
        {STRATEGIES.map((meta) => {
          const active = params.strategies.includes(meta.key);
          return (
            <label
              key={meta.key}
              onMouseEnter={() => setPeek(meta.key)}
              onFocus={() => setPeek(meta.key)}
              className={`flex h-6 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[11.5px] transition-colors ${
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
              <span className="min-w-0 flex-1 truncate leading-6">{t(meta.label)}</span>
              <span className="shrink-0 text-[9px] text-muted-foreground/50" aria-hidden="true">
                ⓘ
              </span>
            </label>
          );
        })}
      </div>

      {/* 固定高度：悬停内容长短不会推动下方列表 */}
      <div className="mt-2 h-[104px] overflow-y-auto rounded-lg border border-border bg-muted/40 p-2 scroll-thin">
        {peeked ? (
          <div key={peeked.key} className="rise">
            <p className="text-[11px] font-medium text-foreground">{t(peeked.label)}</p>
            <p className="mt-0.5 text-[10.5px] leading-4 text-muted-foreground">
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
        ) : (
          <p className="flex h-full items-center justify-center text-center text-[10.5px] leading-4 text-muted-foreground/70">
            {t("悬停策略查看说明")}
          </p>
        )}
      </div>

      {/* 同样常驻占位：策略数量变化时不会把下面的参数区顶来顶去 */}
      <div className="mt-2 flex h-8 items-center gap-1.5 rounded-md border border-border px-2">
        <span className="text-[10.5px] text-muted-foreground">{t("联动")}</span>
        <div
          className={`inline-flex items-center gap-0.5 rounded bg-muted p-0.5 transition-opacity ${
            multi ? "opacity-100" : "pointer-events-none opacity-40"
          }`}
        >
          {([
            { key: "any", label: t("任一信号") },
            { key: "all", label: t("全部共振") },
          ] as { key: CombineMode; label: string }[]).map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={!multi}
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
    </div>
  );
}
