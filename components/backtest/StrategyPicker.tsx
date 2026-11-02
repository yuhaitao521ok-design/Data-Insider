"use client";

import { useI18n } from "@/lib/i18n";
import {
  STRATEGY_KEYS,
  strategyLabel,
  type BacktestParams,
  type CombineMode,
  type StrategyKey,
} from "@/lib/backtest";

interface StrategyPickerProps {
  params: BacktestParams;
  onChange: (next: Partial<BacktestParams>) => void;
}

/** 多策略选择（可勾选多个）+ 联动方式 */
export default function StrategyPicker({ params, onChange }: StrategyPickerProps) {
  const { t } = useI18n();

  function toggle(key: StrategyKey) {
    const active = params.strategies.includes(key);
    const next = active
      ? params.strategies.filter((item) => item !== key)
      : [...params.strategies, key];
    // 至少保留一个策略
    onChange({ strategies: next.length > 0 ? next : [key] });
  }

  return (
    <div>
      <div className="space-y-0.5">
        {STRATEGY_KEYS.map((key) => {
          const active = params.strategies.includes(key);
          return (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
                active ? "bg-accent-soft text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(key)}
                className="h-3 w-3 accent-[var(--accent)]"
                aria-label={t(strategyLabel(key))}
              />
              {t(strategyLabel(key))}
            </label>
          );
        })}
      </div>

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
                    : "text-muted-foreground hover:text-foreground"
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
