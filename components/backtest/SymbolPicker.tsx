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

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;

/**
 * 代码输入 + 搜索建议 + 最近回测。
 * 搜索下拉只在「输入框里打字」时出现：点最近回测的标签直接切换，不会再弹出建议列表。
 */
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
  /** 只有用户输入的关键词才触发搜索；切换标的不会写入 query */
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部切换标的（最近回测 / 父组件）时同步输入框，并清掉搜索态
  useEffect(() => {
    setDraft(value);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActive(-1);
  }, [value]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const keyword = query.trim();
    if (keyword.length === 0) {
      setResults([]);
      setOpen(false);
      setLoading(false);
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
        setResults((data.results ?? []).slice(0, 8));
        setActive(-1);
        setOpen(true);
      } catch (error) {
        if (abortRef.current !== controller) return;
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
          setOpen(false);
        }
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [query]);

  /** 选定一个标的：走父组件（会写入最近回测），同时关闭搜索下拉 */
  function commit(symbol: string) {
    const next = symbol.trim().toUpperCase();
    setDraft(next);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    if (SYMBOL_RE.test(next)) {
      onChange(next);
      onDraft(next);
    } else {
      onDraft(next);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      setResults([]);
      return;
    }
    if (event.key === "ArrowDown") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setActive((prev) => Math.max(prev - 1, -1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = active >= 0 ? results[active] : results[0];
      commit(picked ? picked.symbol : draft);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2 transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15 ${
          invalid ? "border-negative/60" : "border-border"
        }`}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-muted-foreground"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setDraft(next);
            setQuery(next);
            onDraft(next);
          }}
          onFocus={() => {
            if (results.length > 0 && query.trim().length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-label={t("股票代码")}
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          placeholder="AAPL"
          spellCheck={false}
          autoComplete="off"
          className="num min-w-0 flex-1 bg-transparent text-[12.5px] uppercase outline-none placeholder:text-muted-foreground/60"
        />
        {loading && (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-accent border-t-transparent" />
        )}
        {!loading && draft.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setQuery("");
              setResults([]);
              setOpen(false);
              onDraft("");
              inputRef.current?.focus();
            }}
            aria-label={t("清除")}
            title={t("清除")}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
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
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[260px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-pop)] scroll-thin"
        >
          {results.map((item, index) => (
            <button
              key={`${item.symbol}-${index}`}
              type="button"
              role="option"
              aria-selected={active === index}
              onMouseEnter={() => setActive(index)}
              onClick={() => commit(item.symbol)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                active === index ? "bg-muted" : "hover:bg-hover"
              }`}
            >
              <span className="w-[58px] shrink-0 truncate text-[11.5px] font-medium text-foreground">
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

      <div className="mt-2.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{t("最近回测")}</span>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="rounded px-1 text-[10px] text-muted-foreground transition-colors hover:bg-hover hover:text-negative-text"
            >
              {t("清空")}
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-[10px] leading-4 text-muted-foreground/70">
            {t("搜索并选择一个标的后会记录在这里")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {history.slice(0, HISTORY_SIZE).map((symbol) => {
              const isActive = symbol === value;
              return (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => commit(symbol)}
                  aria-pressed={isActive}
                  title={t("点击直接切换回测标的")}
                  className={`num rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                    isActive
                      ? "border-accent/50 bg-accent-soft font-medium text-accent"
                      : "border-border text-muted-foreground hover:border-accent/30 hover:bg-hover hover:text-foreground"
                  }`}
                >
                  {symbol}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
