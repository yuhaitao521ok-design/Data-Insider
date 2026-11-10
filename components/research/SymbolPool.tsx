"use client";

import SearchBox from "@/components/SearchBox";
import { useI18n } from "@/lib/i18n";

interface SymbolPoolProps {
  symbols: string[];
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onReset: () => void;
  onClear: () => void;
  /** 正在加载的标的（显示脉冲点） */
  pending?: string[];
  /** 紧凑模式：放进相关性矩阵头部 */
  compact?: boolean;
}

/** 标的池：可无限增删，输入代码或搜索公司名都能加 */
export default function SymbolPool({
  symbols,
  onAdd,
  onRemove,
  onReset,
  onClear,
  pending = [],
  compact = false,
}: SymbolPoolProps) {
  const { t } = useI18n();
  const pendingSet = new Set(pending);

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      <div className="flex flex-wrap items-center gap-2">
        <div className={compact ? "w-full max-w-xs" : "w-full max-w-md"}>
          <SearchBox onPick={onAdd} />
        </div>
        <button
          type="button"
          onClick={onReset}
          className="h-8 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          {t("恢复自选")}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="h-8 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-negative-text"
        >
          {t("清空")}
        </button>
        <span className="text-[10.5px] text-muted-foreground">
          {symbols.length} {t("只")}
        </span>
      </div>

      <div
        className={
          compact
            ? "flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 scroll-thin"
            : "flex flex-wrap gap-1.5"
        }
      >
        {symbols.map((symbol) => (
          <span
            key={symbol}
            className={`group inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 pl-2 pr-1 ${
              compact ? "shrink-0 py-0.5 text-[10.5px]" : "py-1 text-[11.5px]"
            }`}
          >
            <span className="num font-medium text-foreground/90">{symbol}</span>
            {pendingSet.has(symbol) && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            )}
            <button
              type="button"
              onClick={() => onRemove(symbol)}
              aria-label={`${t("移除")} ${symbol}`}
              title={`${t("移除")} ${symbol}`}
              className="grid h-4.5 w-4.5 place-items-center rounded text-muted-foreground transition-colors hover:bg-hover hover:text-negative-text"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        {symbols.length === 0 && (
          <span className="text-[11px] text-muted-foreground">{t("标的池为空，先加几只看研究指标")}</span>
        )}
      </div>

      {!compact && (
        <p className="text-[10.5px] text-muted-foreground">
          {t("没有数量上限：输入代码直接加，或搜公司名；全部在本地计算，不加标的不会发请求")}
        </p>
      )}
    </div>
  );
}
