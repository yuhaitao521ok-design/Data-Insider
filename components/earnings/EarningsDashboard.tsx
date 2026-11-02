"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatNumber, formatPercent, formatPrice } from "@/lib/format";
import type { EarningsCalendarRow, EarningsDetail } from "@/lib/earnings";

type View = "calendar" | "detail";

function todayInEastern(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const SESSION_LABEL: Record<EarningsCalendarRow["session"], string> = {
  pre: "盘前",
  post: "盘后",
  unknown: "待定",
};

export default function EarningsDashboard() {
  const { t } = useI18n();
  const [view, setView] = useState<View>("calendar");
  const [date, setDate] = useState<string>(() => todayInEastern());
  const [rows, setRows] = useState<EarningsCalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"cap" | "symbol" | "eps">("cap");

  const [symbol, setSymbol] = useState("AAPL");
  const [detail, setDetail] = useState<EarningsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [statementTab, setStatementTab] = useState<"income" | "balance" | "cashflow">("income");

  const loadCalendar = useCallback(async (nextDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/earnings/calendar?date=${nextDate}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`加载失败（${response.status}）`);
      const data = (await response.json()) as { rows: EarningsCalendarRow[] };
      setRows(data.rows ?? []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (nextSymbol: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(
        `/api/earnings/detail?symbol=${encodeURIComponent(nextSymbol)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`加载失败（${response.status}）`);
      const data = (await response.json()) as EarningsDetail;
      setDetail(data);
    } catch (err) {
      setDetail(null);
      setDetailError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendar(date);
  }, [date, loadCalendar]);

  useEffect(() => {
    if (view !== "detail") return;
    void loadDetail(symbol);
  }, [view, symbol, loadDetail]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "symbol") copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
    else if (sort === "eps") copy.sort((a, b) => (b.epsForecast ?? 0) - (a.epsForecast ?? 0));
    else copy.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    return copy;
  }, [rows, sort]);

  function openDetail(nextSymbol: string) {
    setSymbol(nextSymbol);
    setView("detail");
  }

  return (
    <PageShell
      title={t("财报站")}
      description={t("财报日历 · EPS 实际与预期 · 三大报表")}
      actions={
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {([
            { key: "calendar", label: t("财报日历") },
            { key: "detail", label: t("公司财报") },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              aria-pressed={view === item.key}
              className={`h-7 rounded-md px-2.5 text-[12px] transition-colors ${
                view === item.key
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
      {view === "calendar" ? (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDate((prev) => shiftDate(prev, -1))}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("前一天")}
              >
                ‹
              </button>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value || todayInEastern())}
                className="num h-7 rounded-md border border-border bg-card px-2 text-[12px] outline-none focus:border-accent/60"
                aria-label={t("选择日期")}
              />
              <button
                type="button"
                onClick={() => setDate((prev) => shiftDate(prev, 1))}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("后一天")}
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => setDate(todayInEastern())}
                className="h-7 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t("今天")}
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="num">{rows.length} {t("家")}</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                aria-label={t("排序")}
                className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px] text-foreground outline-none"
              >
                <option value="cap">{t("按市值")}</option>
                <option value="symbol">{t("按代码")}</option>
                <option value="eps">{t("按 EPS 预期")}</option>
              </select>
            </div>
          </div>

          {error ? (
            <p className="px-4 py-6 text-[12px] text-negative-text">{error}</p>
          ) : loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-8 w-full rounded-md" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-muted-foreground">{t("该日期没有财报安排")}</p>
          ) : (
            <div className="max-h-[calc(100vh-260px)] overflow-auto scroll-thin">
              <table className="w-full min-w-[720px] border-collapse text-[12px]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-[10.5px] text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">{t("代码")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("公司")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("时段")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("市值")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("EPS 预期")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("预期数")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("去年同期 EPS")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("财季")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr
                      key={`${row.symbol}-${row.date}`}
                      onClick={() => openDetail(row.symbol)}
                      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-hover"
                    >
                      <td className="px-3 py-1.5 font-medium">{row.symbol}</td>
                      <td className="max-w-[240px] truncate px-3 py-1.5 text-muted-foreground">
                        {row.name}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded px-1 text-[10px] leading-4 ${
                            row.session === "pre"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : row.session === "post"
                                ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {t(SESSION_LABEL[row.session])}
                        </span>
                      </td>
                      <td className="num px-3 py-1.5 text-right">
                        {row.marketCap ? `$${formatCompact(row.marketCap)}` : "--"}
                      </td>
                      <td className="num px-3 py-1.5 text-right">
                        {row.epsForecast !== null ? formatNumber(row.epsForecast, 2) : "--"}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-muted-foreground">
                        {row.estimates ?? "--"}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-muted-foreground">
                        {row.lastYearEps !== null ? formatNumber(row.lastYearEps, 2) : "--"}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-muted-foreground">
                        {row.fiscalQuarterEnding ?? "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
            <span className="text-[12px] text-muted-foreground">{t("标的")}</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              className="num h-7 w-[100px] rounded-md border border-border bg-card px-2 text-[12px] uppercase outline-none focus:border-accent/60"
              aria-label={t("股票代码")}
            />
            <button
              type="button"
              onClick={() => setView("calendar")}
              className="ml-auto h-7 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("返回日历")}
            </button>
          </div>

          {detailError ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-negative-text">
              {detailError}
            </p>
          ) : detailLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : detail ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <article className="overflow-hidden rounded-xl border border-border bg-card">
                  <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-medium">
                    {t("EPS 实际 vs 预期")}
                  </h2>
                  {detail.surprise.length === 0 ? (
                    <p className="px-4 py-4 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>
                  ) : (
                    <table className="w-full text-[11.5px]">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground">
                          <th className="px-3 py-1.5 text-left font-medium">{t("财季")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("实际 EPS")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("预期 EPS")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("超出预期")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.surprise.map((row) => (
                          <tr key={row.fiscalQuarterEnd} className="border-t border-border/60">
                            <td className="px-3 py-1.5">{row.fiscalQuarterEnd}</td>
                            <td className="num px-3 py-1.5 text-right">
                              {row.eps !== null ? formatNumber(row.eps, 2) : "--"}
                            </td>
                            <td className="num px-3 py-1.5 text-right text-muted-foreground">
                              {row.consensus !== null ? formatNumber(row.consensus, 2) : "--"}
                            </td>
                            <td
                              className={`num px-3 py-1.5 text-right ${
                                (row.surprisePercent ?? 0) >= 0
                                  ? "text-positive-text"
                                  : "text-negative-text"
                              }`}
                            >
                              {formatPercent(row.surprisePercent)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </article>

                <article className="overflow-hidden rounded-xl border border-border bg-card">
                  <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-medium">
                    {t("未来季度 EPS 预期")}
                  </h2>
                  {detail.forecast.length === 0 ? (
                    <p className="px-4 py-4 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>
                  ) : (
                    <table className="w-full text-[11.5px]">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground">
                          <th className="px-3 py-1.5 text-left font-medium">{t("财季")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("一致预期")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("区间")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("预期数")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.forecast.map((row) => (
                          <tr key={row.fiscalEnd} className="border-t border-border/60">
                            <td className="px-3 py-1.5">{row.fiscalEnd}</td>
                            <td className="num px-3 py-1.5 text-right">
                              {row.consensusEps !== null ? formatNumber(row.consensusEps, 2) : "--"}
                            </td>
                            <td className="num px-3 py-1.5 text-right text-muted-foreground">
                              {row.low !== null && row.high !== null
                                ? `${formatNumber(row.low, 2)} – ${formatNumber(row.high, 2)}`
                                : "--"}
                            </td>
                            <td className="num px-3 py-1.5 text-right text-muted-foreground">
                              {row.estimates ?? "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </article>
              </div>

              <article className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <h2 className="text-[13px] font-medium">{t("三大报表")}</h2>
                  <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                    {([
                      { key: "income", label: t("利润表") },
                      { key: "balance", label: t("资产负债表") },
                      { key: "cashflow", label: t("现金流") },
                    ] as const).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStatementTab(tab.key)}
                        aria-pressed={statementTab === tab.key}
                        className={`h-6 rounded-md px-2 text-[11px] transition-colors ${
                          statementTab === tab.key
                            ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const statement = detail.statements[statementTab];
                  if (!statement) {
                    return (
                      <p className="px-4 py-4 text-[11.5px] text-muted-foreground">
                        {t("暂无数据")}
                      </p>
                    );
                  }
                  return (
                    <div className="max-h-[520px] overflow-auto scroll-thin">
                      <table className="w-full min-w-[640px] text-[11.5px]">
                        <thead className="sticky top-0 bg-card">
                          <tr className="text-[10px] text-muted-foreground">
                            <th className="px-3 py-1.5 text-left font-medium">{t("科目")}</th>
                            {statement.periods.map((period) => (
                              <th key={period} className="num px-3 py-1.5 text-right font-medium">
                                {period}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {statement.rows.map((row) => (
                            <tr key={row.label} className="border-t border-border/60">
                              <td className="px-3 py-1.5 text-muted-foreground">{row.label}</td>
                              {row.values.map((value, index) => (
                                <td key={index} className="num px-3 py-1.5 text-right">
                                  {value === null ? "--" : formatCompact(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </article>
            </>
          ) : null}
        </section>
      )}
    </PageShell>
  );
}
