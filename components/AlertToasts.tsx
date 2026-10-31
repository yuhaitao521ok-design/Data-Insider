"use client";

import { useEffect } from "react";

export interface AlertToastItem {
  id: string;
  title: string;
  body: string;
  /** 价格提醒触发时显示现价；普通提示可以省略 */
  price?: string;
}

interface AlertToastsProps {
  items: AlertToastItem[];
  onDismiss: (id: string) => void;
}

/** 右下角的提醒 toast；带关闭按钮，8 秒后自动消失（由父组件定时清理） */
export default function AlertToasts({ items, onDismiss }: AlertToastsProps) {
  useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map((item) =>
      window.setTimeout(() => onDismiss(item.id), 8_000),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [items, onDismiss]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[286px] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto rounded-xl border border-accent/35 bg-popover p-3 shadow-[var(--shadow-pop)] rise"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 4a5 5 0 0 0-5 5v3.5L5.5 16h13L17 12.5V9a5 5 0 0 0-5-5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium leading-4">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{item.body}</p>
              {item.price && (
                <p className="num mt-1 text-[12px] text-foreground/85">现价 {item.price}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="-mr-1 -mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="关闭提醒"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
