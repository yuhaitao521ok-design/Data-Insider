"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { SUPER_INVESTORS, type SymbolOwnership, type ThirteenFResult } from "@/lib/institutions";
import { DEFAULT_WATCHLIST } from "@/lib/types";

type Tab = "symbol" | "investors";

export default function InstitutionsDashboard() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("symbol");
  const [symbol, setSymbol] = useState<string>(DEFAULT_WATCHLIST[0]);
  const [ownership, setOwnership] = useState<SymbolOwnership | null>(null);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);

  const [investorId, setInvestorId] = useState(SUPER_INVESTORS[0].id);
  const [filing, setFiling] = useState<ThirteenFResult | null>(null);
  const [filingLoading, setFilingLoading] = useState(false);
  const [filingError, setFilingError] = useState<string | null>(null);

  const loadOwnership = useCallback(async (nextSymbol: string) => {
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

  useEffect(() => {
    if (tab === "symbol") void loadOwnership(symbol);
  }, [tab, symbol, loadOwnership]);

  useEffect(() => {
    if (tab === "investors") void loadFiling(investorId);
  }, [tab, investorId, loadFiling]);

  const investor = SUPER_INVESTORS.find((item) => item.id === investorId) ?? SUPER_INVESTORS[0];

  return (
    <PageShell
      title={t("机构持仓")}
      description={t("机构持股 · 内部人交易 · 名人 13F 季度持仓")}
      actions={
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {([
            { key: "symbol", label: t("按标的") },
            { key: "investors", label: t("名人 13F") },
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
      {tab === "symbol" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
            <span className="text-[12px] text-muted-foreground">{t("标的")}</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              aria-label={t("股票代码")}
              className="num h-7 w-[100px] rounded-md border border-border bg-card px-2 text-[12px] uppercase outline-none focus:border-accent/60"
            />
            <button
              type="button"
              onClick={() => void loadOwnership(symbol)}
              className="h-7 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t("刷新")}
            </button>
            {ownershipLoading && <span className="text-[10.5px] text-muted-foreground">{t("加载中")}…</span>}
          </div>

          {ownershipError ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-negative-text">
              {ownershipError}
            </p>
          ) : ownershipLoading || !ownership ? (
            <div className="skeleton h-32 rounded-xl" />
          ) : (
            <>
              <section className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                {[
                  { label: t("机构持股比例"), value: formatPercent(ownership.summary.institutionalPercent, 2).replace("+", "") },
                  { label: t("总股本（百万）"), value: ownership.summary.totalSharesMillion === null ? "--" : formatNumber(ownership.summary.totalSharesMillion, 0) },
                  { label: t("机构持仓市值"), value: ownership.summary.totalValueMillion === null ? "--" : `$${formatCompact(ownership.summary.totalValueMillion * 1_000_000)}` },
                ].map((item) => (
                  <div key={item.label} className="bg-card px-4 py-3">
                    <p className="text-[10.5px] text-muted-foreground">{item.label}</p>
                    <p className="num mt-0.5 text-[15px] text-foreground">{item.value}</p>
                  </div>
                ))}
              </section>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-medium">
                    {t("持仓变动统计")}
                  </h2>
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">{t("项目")}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t("机构数")}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t("股数")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...ownership.active, ...ownership.changes].map((row) => (
                        <tr key={row.label} className="border-t border-border/60">
                          <td className="px-3 py-1.5 text-muted-foreground">{t(row.label)}</td>
                          <td className="num px-3 py-1.5 text-right">{row.holders ?? "--"}</td>
                          <td className="num px-3 py-1.5 text-right">{row.shares === null ? "--" : formatCompact(row.shares)}</td>
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
                      <thead>
                        <tr className="text-[10px] text-muted-foreground">
                          <th className="px-3 py-1.5 text-left font-medium">{t("项目")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("近 3 个月")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("近 12 个月")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ownership.insider.map((row) => (
                          <tr key={row.label} className="border-t border-border/60">
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
      ) : (
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-xl border border-border bg-card">
            <p className="border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">
              {t("超级投资者")}
            </p>
            <div className="max-h-[520px] overflow-auto p-1 scroll-thin">
              {SUPER_INVESTORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setInvestorId(item.id)}
                  aria-pressed={investorId === item.id}
                  className={`flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    investorId === item.id
                      ? "bg-accent-soft text-accent"
                      : "text-foreground/85 hover:bg-muted"
                  }`}
                >
                  <span className="text-[12px] font-medium">{item.nameZh}</span>
                  <span className="text-[10px] text-muted-foreground">{item.fund}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
              <div>
                <p className="text-[13px] font-medium">{investor.nameZh}</p>
                <p className="text-[10.5px] text-muted-foreground">
                  {filing?.filedAt ? `${t("报告期")} ${filing.filedAt}` : t("13F 为季度数据，通常滞后 45 天")}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {filing && (
                  <>
                    <span>
                      {t("持仓数")} <span className="num text-foreground">{filing.holdings.length}</span>
                    </span>
                    <span>
                      {t("总市值")} <span className="num text-foreground">${formatCompact(filing.totalValue)}</span>
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void loadFiling(investorId)}
                  className="h-7 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t("刷新")}
                </button>
              </div>
            </div>

            {filingError ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-negative-text">
                {filingError}
              </p>
            ) : filingLoading || !filing ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="skeleton h-8 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="max-h-[560px] overflow-auto scroll-thin">
                  <table className="w-full min-w-[560px] text-[11.5px]">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-[10px] text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">{t("标的")}</th>
                        <th className="px-3 py-1.5 text-left font-medium">{t("类别")}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t("股数")}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t("市值")}</th>
                        <th className="px-3 py-1.5 text-right font-medium">{t("占比")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filing.holdings.slice(0, 60).map((holding, index) => (
                        <tr key={`${holding.cusip}-${index}`} className="border-t border-border/60">
                          <td className="max-w-[220px] truncate px-3 py-1.5">{holding.issuer}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{holding.titleOfClass}</td>
                          <td className="num px-3 py-1.5 text-right">{holding.shares === null ? "--" : formatCompact(holding.shares)}</td>
                          <td className="num px-3 py-1.5 text-right">{holding.value === null ? "--" : `$${formatCompact(holding.value)}`}</td>
                          <td className="num px-3 py-1.5 text-right text-muted-foreground">
                            {holding.value === null || filing.totalValue === 0
                              ? "--"
                              : formatPercent((holding.value / filing.totalValue) * 100, 1).replace("+", "")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
