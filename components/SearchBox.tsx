"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/types";

interface SearchBoxProps {
  onPick: (symbol: string) => void;
}

export default function SearchBox({ onPick }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        setResults(data.results ?? []);
        setActive(-1);
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleShortcut(event: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleShortcut);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  function pick(symbol: string) {
    onPick(symbol.toUpperCase());
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  }

  const trimmed = query.trim();
  const tickerCandidate = /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(trimmed)
    ? trimmed.toUpperCase()
    : null;
  const showDirectAdd =
    tickerCandidate !== null && !results.some((item) => item.symbol === tickerCandidate);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => Math.max(prev - 1, -1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && results[active]) pick(results[active].symbol);
      else if (results[0]) pick(results[0].symbol);
      else if (tickerCandidate) pick(tickerCandidate);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-panel/80 px-3 py-2 transition focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/15">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-muted">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="搜索代码或公司，如 AAPL / 英伟达"
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted/70 focus:outline-none"
          aria-label="搜索股票"
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-accent border-t-transparent" />
        ) : (
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">
            /
          </kbd>
        )}
      </div>

      {open && (results.length > 0 || showDirectAdd) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-line bg-[#0a111d] shadow-2xl scroll-thin rise">
          {results.map((item, index) => (
            <button
              key={`${item.symbol}-${index}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(item.symbol)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                active === index ? "bg-accent/15" : "hover:bg-white/5"
              }`}
            >
              <span className="w-16 shrink-0 truncate text-sm font-semibold text-ink">
                {item.symbol}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink/85">{item.name}</span>
                <span className="block truncate text-[10px] text-muted">
                  {item.exchange} · {item.type}
                </span>
              </span>
            </button>
          ))}

          {showDirectAdd && (
            <button
              type="button"
              onClick={() => pick(tickerCandidate!)}
              className="flex w-full items-center gap-3 border-t border-line/60 px-3 py-2.5 text-left transition hover:bg-white/5"
            >
              <span className="w-16 shrink-0 text-sm font-semibold text-accent">
                {tickerCandidate}
              </span>
              <span className="text-xs text-muted">直接添加该代码</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

