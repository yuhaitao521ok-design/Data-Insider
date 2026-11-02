"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { HISTORY_SIZE } from "@/lib/backtest-history";
import type { SearchResult } from "@/lib/types";

interface SymbolPickerProps {
  value: string;
  onChange: (symbol: string) => void;
  /** 输入过程中的草稿（可能非法），由父组件决定是否请求 */
  onDraft: (draft: string) => void;
  history: string[];
  onClearHistory: () => void;
  invalid: boolean;
}

/** 代码输入 + 搜索建议 + 历史代码列表 */
export default function SymbolPicker({
  value,
  onChange,
  onDraft,
  history,
  onClearHistory,
  invalid,
}: SymbolPickerProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const keyword = draft.trim();
    if (keyword.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        const data = (await response.json()) as { results?: SearchResult[] };
        // 丢弃过期响应（避免旧查询覆盖新查询）
        if (abortRef.current !== controller) return;
        setResults((data.results ?? []).slice(0, 6));
        setOpen(true);
      } catch (error) {
        if (abortRef.current !== controller) return;
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]);
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [draft]);

  function commit(symbol: string) {
    const next = symbol.trim().toUpperCase();
    setDraft(next);
    setResults([]);
    setOpen(false);
    if (/^[A-Z0-9.^=-]{1,12}$/.test(next)) {
      onChange(next);
      onDraft(next);
    } else {
      onDraft(next);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setDraft(next);
            onDraft(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(draft);
          }}
          aria-label={t("股票代码")}
          placeholder="AAPL"
          spellCheck={false}
          autoComplete="off"
          className={`num h-7 w-full rounded-md border bg-card px-2 text-[12px] uppercase outline-none focus:border-accent/60 ${
            invalid ? "border-negative/60" : "border-border"
          }`}
        />
        {loading && (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-accent border-t-transparent" />
        )}
      </div>

      {invalid && (
        <p className="mt-1 text-[10px] leading-4 text-negative-text">
          {t("请输入有效的股票代码")}
        </p>
      )}

      {open && results.length > 0 && (
        <div
          role="listbox"
          aria-label={t("搜索结果")}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[220px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-pop)] scroll-thin"
        >
          {results.map((item, index) => (
            <button
              key={`${item.symbol}-${index}`}
              type="button"
              role="option"
              onClick={() => commit(item.symbol)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover"
            >
              <span className="w-[52px] shrink-0 truncate text-[11.5px] font-medium text-foreground">
                {item.symbol}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10.5px] leading-4 text-foreground/85">
                  {item.name}
                </span>
                <span className="block truncate text-[9px] leading-3 text-muted-foreground">
                  {item.exchange} · {item.type}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{t("最近回测")}</span>
            <button
              type="button"
              onClick={onClearHistory}
              className="text-[10px] text-muted-foreground transition-colors hover:text-negative-text"
            >
              {t("清空")}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {history.slice(0, HISTORY_SIZE).map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => commit(symbol)}
                aria-pressed={symbol === value}
                className={`num rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                  symbol === value
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border text-muted-foreground hover:bg-hover hover:text-foreground"
                }`}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
