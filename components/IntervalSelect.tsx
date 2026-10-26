"use client";

import { useEffect, useRef, useState } from "react";
import {
  INTERVAL_CONFIG,
  RANGE_INTERVALS,
  type IntervalKey,
  type RangeKey,
} from "@/lib/types";

interface IntervalSelectProps {
  range: RangeKey;
  value: IntervalKey;
  onChange: (interval: IntervalKey) => void;
  disabled?: boolean;
}

/** 间隔下拉：选项随周期变化（受 Yahoo 回溯上限约束） */
export default function IntervalSelect({
  range,
  value,
  onChange,
  disabled = false,
}: IntervalSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = RANGE_INTERVALS[range];

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title="选择 K 线间隔"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        间隔
        <span className="font-medium text-foreground">{INTERVAL_CONFIG[value].label}</span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="时间间隔"
          className="absolute right-0 top-full z-50 mt-1.5 w-[252px] rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-pop)] rise"
        >
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">时间间隔</p>
            <span className="text-[10px] text-muted-foreground/70">{range}</span>
          </div>

          {options.map((option) => {
            const config = INTERVAL_CONFIG[option];
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  active ? "bg-muted" : "hover:bg-muted"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                    active ? "text-accent" : "text-transparent"
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="m5 13 4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="flex-1 text-[12px]">{config.label}</span>
                <span className="num text-[10px] text-muted-foreground">{config.short}</span>
                {!config.nasdaq && (
                  <span
                    className="rounded border border-border px-1 text-[9px] leading-4 text-muted-foreground"
                    title="该间隔仅 Yahoo Finance 提供，无法使用 Nasdaq 兜底"
                  >
                    Yahoo
                  </span>
                )}
              </button>
            );
          })}

          <p className="border-t border-border px-2 py-1.5 text-[10px] leading-4 text-muted-foreground/70">
            可选间隔随周期变化：1 分钟最多 8 天、2–90 分钟最多 60 天、1 小时最多 2 年；带 Yahoo
            标记的间隔无 Nasdaq 兜底。
          </p>
        </div>
      )}
    </div>
  );
}
