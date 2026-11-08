"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { SUPER_INVESTORS, type SymbolOwnership, type ThirteenFResult } from "@/lib/institutions";
import { DEFAULT_WATCHLIST } from "@/lib/types";

type Tab = "symbol" | "investors";

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;

/** 头像用的首字母 / 首字 */
function initials(name: string): string {
  const trimmed = name.trim();
  const cjk = /[\u4e00-\u9fff]/.exec(trimmed);
  if (cjk) return cjk[0];
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent-soft text-[11px] font-medium text-accent"
    >
      {initials(name)}
    </span>
  );
}

function WeightBar({ percent }: { percent: number | null }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-accent/10">
      <span
        className="block h-full rounded-full bg-accent/70"
        style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
      />
    </span>
  );
}

export default function InstitutionsDashboard() {
  const { t } = useI18n();
  // 默认直接展示名人 13F，打开页面即可看到
  const [tab, setTab] = useState<Tab>("investors");

  const [draft, setDraft] = useState<string>(DEFAULT_WATCHLIST[0]);
  const [ownership, setOwnership] = useState<SymbolOwnership | null>(null);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);

  const [investorId, setInvestorId] = useState(SUPER_INVESTORS[0].id);
  const [filing, setFiling] = useState<ThirteenFResult | null>(null);
  const [filingLoading, setFilingLoading] = useState(true);
  const [filingError, setFilingError] = useState<string | null>(null);

  const [filter, setFilter] = useState("");
  const [ascending, setAscending] = useState(false);
  const [investorQuery, setInvestorQuery] = useState("");

  const loadOwnership = useCallback(async (nextSymbol: string) => {
    if (!SYMBOL_RE.test(nextSymbol)) return;
    setOwnershipLoading(true);
    setOwnershipError(null);
    try {
      const response = await fetch(
        `/api/institutions/ownership?symbol=${encodeURIComponent(nextSymbol)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`加载失败（${response.status}）`);
      setOwnership((await response.json()) as SymbolOwnership);
    } catch (error) {
      setOwnership(null);
      setOwnershipError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setOwnershipLoading(false);
    }
  }, []);

  const loadFiling = useCallback(async (id: string) => {
    setFilingLoading(true);
    setFilingError(null);
    try {
      const response = await fetch(`/api/institutions/13f?investor=${id}`, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `加载失败（${response.status}）`);
      }
      setFiling((await response.json()) as ThirteenFResult);
    } catch (error) {
      setFiling(null);
      setFilingError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setFilingLoading(false);
    }
  }, []);

  // 名人 13F：进入页面就加载（tab 默认为 investors）
  useEffect(() => {
    if (tab === "investors") void loadFiling(investorId);
  }, [tab, investorId, loadFiling]);

  // 按标的：输入停顿 400ms 再请求，避免每敲一个字母打一次接口
  useEffect(() => {
    if (tab !== "symbol") return;
    const next = draft.trim().toUpperCase();
    if (!SYMBOL_RE.test(next)) return;
    const timer = window.setTimeout(() => void loadOwnership(next), 400);
    return () => window.clearTimeout(timer);
  }, [draft, tab, loadOwnership]);

  const investor = SUPER_INVESTORS.find((item) => item.id === investorId) ?? SUPER_INVESTORS[0];

  /** 投资人很多，支持按中文名 / 英文名 / 基金名快速筛选 */
  const investors = useMemo(() => {
    const keyword = investorQuery.trim().toLowerCase();
    if (!keyword) return SUPER_INVESTORS;
    return SUPER_INVESTORS.filter((item) =>
      `${item.nameZh} ${item.name} ${item.fund}`.toLowerCase().includes(keyword),
    );
  }, [investorQuery]);

  const rows = useMemo(() => {
    if (!filing) return [];
    const total = filing.totalValue || 0;
    const list = filing.holdings.map((holding, index) => ({
      ...holding,
      rank: index + 1,
      weight:
        total > 0 && holding.value !== null ? (holding.value / total) * 100 : null,
    }));
    const keyword = filter.trim().toUpperCase();
    const filtered = keyword
      ? list.filter(
          (item) =>
            item.issuer.toUpperCase().includes(keyword) ||
            item.cusip.toUpperCase().includes(keyword),
        )
      : list;
    return ascending ? [...filtered].reverse() : filtered;
  }, [filing, filter, ascending]);

  // 前十大持仓始终按市值排序，不受表格过滤/升降序影响
  const topHoldings = useMemo(() => {
    if (!filing) return [];
    const total = filing.totalValue || 0;
    return filing.holdings.slice(0, 10).map((holding, index) => ({
      ...holding,
      rank: index + 1,
      weight:
        total > 0 && holding.value !== null ? (holding.value / total) * 100 : null,
    }));
  }, [filing]);
  const concentration = useMemo(
    () => topHoldings.reduce((sum, item) => sum + (item.weight ?? 0), 0),
    [topHoldings],
  );
  const maxTopWeight = topHoldings[0]?.weight ?? 0;

  return (
    <PageShell
      title={t("机构持仓")}
      description={t("名人 13F 季度持仓 · 机构持股 · 内部人交易")}
      actions={
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {([
            { key: "investors", label: t("名人 13F") },
            { key: "symbol", label: t("按标的") },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={`h-7 rounded-md px-2.5 text-[12px] transition-colors ${
                tab === item.key
                  ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      {tab === "investors" ? (
        <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="min-w-0 self-start overflow-hidden rounded-xl border border-border bg-card xl:sticky xl:top-3">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t("超级投资者")}
              </p>
              <span className="num rounded bg-muted px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                {investors.length === SUPER_INVESTORS.length
                  ? SUPER_INVESTORS.length
                  : `${investors.length}/${SUPER_INVESTORS.length}`}
              </span>
            </div>
            <div className="border-b border-border px-2 py-1.5">
              <div className="relative">
                <input
                  value={investorQuery}
                  onChange={(event) => setInvestorQuery(event.target.value)}
                  placeholder={t("搜索投资人")}
                  aria-label={t("搜索投资人")}
                  className="h-7 w-full rounded-md border border-border bg-card pl-2 pr-6 text-[11px] outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                />
                {investorQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setInvestorQuery("")}
                    aria-label={t("清除")}
                    title={t("清除")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
            </div>
            <div className="flex gap-1.5 overflow-x-auto p-1.5 scroll-thin xl:block xl:max-h-[560px] xl:space-y-0.5 xl:overflow-y-auto">
              {investors.length === 0 ? (
                <p className="px-2 py-3 text-[10.5px] text-muted-foreground">
                  {t("没有匹配的投资人")}
                </p>
              ) : null}
              {investors.map((item) => {
                const active = item.id === investorId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setInvestorId(item.id);
                      setFilter("");
                    }}
                    aria-pressed={active}
                    className={`flex w-[168px] shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors xl:w-full ${
                      active ? "bg-accent-soft" : "hover:bg-hover"
                    }`}
                  >
                    <Avatar name={item.nameZh} size={28} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[12px] ${
                          active ? "font-medium text-accent" : "text-foreground/85"
                        }`}
                      >
                        {item.nameZh}
                      </span>
                      <span className="block truncate text-[9.5px] text-muted-foreground">
                        {item.fund}
                      </span>
                    </span>
                    {active && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 space-y-3">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={investor.nameZh} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium tracking-tight">
                    {investor.nameZh}
                  </p>
                  <p className="truncate text-[10.5px] text-muted-foreground">
                    {filing?.entityName || investor.fund}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <Stat label={t("总市值")} value={filing ? `$${formatCompact(filing.totalValue)}` : "--"} />
                  <Stat
                    label={t("持仓数")}
                    value={filing ? String(filing.totalPositions) : "--"}
                    hint={
                      filing && filing.holdings.length < filing.totalPositions
                        ? t("仅展示市值前 200 条")
                        : undefined
                    }
                  />
                  <Stat
                    label={t("集中度")}
                    value={filing ? formatPercent(concentration, 1).replace("+", "") : "--"}
                    hint={t("前十大持仓")}
                  />
                  <button
                    type="button"
                    onClick={() => void loadFiling(investorId)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-hover hover:text-foreground"
                  >
                    {t("刷新")}
                  </button>
                </div>
              </div>
              <p className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-1.5 text-[10px] text-muted-foreground">
                <span className="rounded bg-card px-1.5 py-0.5 font-medium text-foreground/70">
                  SEC 13F
                </span>
                <span className="num">
                  {filing?.filedAt ? `${t("报告期")} ${filing.filedAt}` : "--"}
                </span>
                {filing && filing.holdings.length < filing.totalPositions && (
                  <span className="text-muted-foreground/70">
                    {t("仅展示市值前 200 条，总市值与占比按全量持仓计算")}
                  </span>
                )}
                <span className="text-muted-foreground/70">{t("13F 为季度数据，通常滞后 45 天")}</span>
              </p>
            </section>

            {filingError ? (
              <ErrorCard message={filingError} onRetry={() => void loadFiling(investorId)} retry={t("重试")} />
            ) : (
              <>
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <h2 className="text-[13px] font-medium">{t("前十大持仓")}</h2>
                    <span className="num text-[10px] text-muted-foreground">
                      {t("市值")} ↓
                    </span>
                  </div>
                  {filingLoading && !filing ? (
                    <div className="grid gap-2 px-4 py-3 md:grid-cols-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="skeleton h-7 rounded-md" />
                      ))}
                    </div>
                  ) : topHoldings.length === 0 ? (
                    <p className="px-4 py-5 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>
                  ) : (
                    <ol className="grid gap-x-6 gap-y-2.5 px-4 py-3 md:grid-cols-2">
                      {topHoldings.map((item) => (
                        <li key={`${item.cusip}-${item.rank}`} className="flex items-center gap-2">
                          <span
                            className={`num flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] ${
                              item.rank <= 3
                                ? "bg-accent-soft font-medium text-accent"
                                : "text-muted-foreground/70"
                            }`}
                          >
                            {item.rank}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[11.5px] text-foreground/90">
                                {item.issuer}
                              </span>
                              <span className="num shrink-0 text-[10.5px] text-muted-foreground">
                                {formatPercent(item.weight, 1).replace("+", "")}
                              </span>
                            </span>
                            <WeightBar
                              percent={
                                item.weight === null || maxTopWeight <= 0
                                  ? 0
                                  : (item.weight / maxTopWeight) * 100
                              }
                            />
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                    <h2 className="text-[13px] font-medium">{t("持仓明细")}</h2>
                    <span className="num rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {rows.length}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className="relative">
                        <input
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                          placeholder={t("搜索持仓（名称或代码）")}
                          aria-label={t("搜索持仓（名称或代码）")}
                          className="h-7 w-[180px] rounded-md border border-border bg-card pl-2 pr-6 text-[11px] outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                        />
                        {filter.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFilter("")}
                            aria-label={t("清除")}
                            title={t("清除")}
                            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
                      <button
                        type="button"
                        onClick={() => setAscending((prev) => !prev)}
                        aria-pressed={ascending}
                        className="num inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                      >
                        {t("市值")}
                        <span aria-hidden="true">{ascending ? "↑" : "↓"}</span>
                      </button>
                    </div>
                  </div>

                  {filingLoading && !filing ? (
                    <div className="space-y-1.5 p-3">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <div key={index} className="skeleton h-7 rounded-md" />
                      ))}
                    </div>
                  ) : rows.length === 0 ? (
                    <p className="px-4 py-5 text-[11.5px] text-muted-foreground">
                      {filter.trim() ? t("没有匹配的持仓") : t("暂无数据")}
                    </p>
                  ) : (
                    <div className="max-h-[560px] overflow-auto scroll-thin">
                      <table className="w-full min-w-[620px] text-[11.5px]">
                        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                          <tr className="text-[10px] text-muted-foreground">
                            <th className="w-8 px-2 py-1.5 text-right font-medium">#</th>
                            <th className="px-3 py-1.5 text-left font-medium">{t("标的")}</th>
                            <th className="px-3 py-1.5 text-left font-medium">{t("类别")}</th>
                            <th className="px-3 py-1.5 text-right font-medium">{t("股数")}</th>
                            <th className="px-3 py-1.5 text-right font-medium">{t("市值")}</th>
                            <th className="w-[150px] px-3 py-1.5 text-right font-medium">{t("占比")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((holding) => (
                            <tr
                              key={`${holding.cusip}-${holding.rank}`}
                              className="border-t border-border/60 transition-colors hover:bg-muted/40"
                            >
                              <td className="num px-2 py-1.5 text-right text-[10px] text-muted-foreground/70">
                                {holding.rank}
                              </td>
                              <td className="max-w-[240px] px-3 py-1.5">
                                <span className="block truncate text-foreground/90">{holding.issuer}</span>
                                <span className="num block truncate text-[9px] text-muted-foreground/70">
                                  {holding.cusip}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{holding.titleOfClass}</td>
                              <td className="num px-3 py-1.5 text-right">
                                {holding.shares === null ? "--" : formatCompact(holding.shares)}
                              </td>
                              <td className="num px-3 py-1.5 text-right">
                                {holding.value === null ? "--" : `$${formatCompact(holding.value)}`}
                              </td>
                              <td className="px-3 py-1.5">
                                <span className="flex items-center justify-end gap-2">
                                  <span className="hidden w-[70px] sm:block">
                                    <WeightBar percent={holding.weight === null ? 0 : holding.weight * 2.5} />
                                  </span>
                                  <span className="num w-[42px] text-right text-muted-foreground">
                                    {formatPercent(holding.weight, 1).replace("+", "")}
                                  </span>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <section className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2 transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15">
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
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.toUpperCase())}
                  aria-label={t("股票代码")}
                  maxLength={12}
                  placeholder="AAPL"
                  spellCheck={false}
                  className="num w-[96px] bg-transparent text-[12.5px] uppercase outline-none placeholder:text-muted-foreground/60"
                />
                {ownershipLoading && (
                  <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-accent border-t-transparent" />
                )}
              </div>
              <button
                type="button"
                onClick={() => void loadOwnership(draft.trim().toUpperCase())}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-hover hover:text-foreground"
              >
                {t("刷新")}
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{t("常用标的")}</span>
                {DEFAULT_WATCHLIST.slice(0, 5).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDraft(item)}
                    aria-pressed={draft.trim().toUpperCase() === item}
                    className={`num rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                      draft.trim().toUpperCase() === item
                        ? "border-accent/50 bg-accent-soft font-medium text-accent"
                        : "border-border text-muted-foreground hover:border-accent/30 hover:bg-hover hover:text-foreground"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {ownershipError ? (
            <ErrorCard
              message={ownershipError}
              onRetry={() => void loadOwnership(draft.trim().toUpperCase())}
              retry={t("重试")}
            />
          ) : ownershipLoading || !ownership ? (
            <div className="space-y-3">
              <div className="skeleton h-[76px] rounded-xl" />
              <div className="skeleton h-[260px] rounded-xl" />
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                {[
                  {
                    label: t("机构持股比例"),
                    value: formatPercent(ownership.summary.institutionalPercent, 2).replace("+", ""),
                  },
                  {
                    label: t("总股本（百万）"),
                    value:
                      ownership.summary.totalSharesMillion === null
                        ? "--"
                        : formatNumber(ownership.summary.totalSharesMillion, 0),
                  },
                  {
                    label: t("机构持仓市值"),
                    value:
                      ownership.summary.totalValueMillion === null
                        ? "--"
                        : `$${formatCompact(ownership.summary.totalValueMillion * 1_000_000)}`,
                  },
                ].map((item) => (
                  <div key={item.label} className="bg-card px-4 py-3 transition-colors hover:bg-muted/40">
                    <p className="text-[10.5px] text-muted-foreground">{item.label}</p>
                    <p className="num mt-0.5 text-[16px] font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </section>

              <div className="grid gap-3 xl:grid-cols-2">
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-medium">
                    {t("持仓变动统计")}
                  </h2>
                  <table className="w-full text-[11.5px]">
                    <thead className="bg-muted/30">
                      <tr className="text-[10px] text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">{t("项目")}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t("机构数")}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t("股数")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...ownership.active, ...ownership.changes].map((row) => (
                        <tr
                          key={row.label}
                          className="border-t border-border/60 transition-colors hover:bg-muted/40"
                        >
                          <td className="px-3 py-1.5 text-muted-foreground">{t(row.label)}</td>
                          <td className="num px-3 py-1.5 text-right">{row.holders ?? "--"}</td>
                          <td className="num px-3 py-1.5 text-right">
                            {row.shares === null ? "--" : formatCompact(row.shares)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-medium">
                    {t("内部人交易")}
                  </h2>
                  {ownership.insider.length === 0 ? (
                    <p className="px-4 py-4 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>
                  ) : (
                    <table className="w-full text-[11.5px]">
                      <thead className="bg-muted/30">
                        <tr className="text-[10px] text-muted-foreground">
                          <th className="px-3 py-1.5 text-left font-medium">{t("项目")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("近 3 个月")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("近 12 个月")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ownership.insider.map((row) => (
                          <tr
                            key={row.label}
                            className="border-t border-border/60 transition-colors hover:bg-muted/40"
                          >
                            <td className="px-3 py-1.5 text-muted-foreground">{t(row.label)}</td>
                            <td className="num px-3 py-1.5 text-right">{row.months3 ?? "--"}</td>
                            <td className="num px-3 py-1.5 text-right">{row.months12 ?? "--"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[64px]" title={hint}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="num mt-0.5 text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function ErrorCard({
  message,
  onRetry,
  retry,
}: {
  message: string;
  onRetry: () => void;
  retry: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-5">
      <p className="text-[12px] text-negative-text">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 h-7 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
      >
        {retry}
      </button>
    </div>
  );
}
