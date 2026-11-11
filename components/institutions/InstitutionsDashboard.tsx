"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import {
  SUPER_INVESTORS,
  aggregateTopChanges,
  pearsonCorrelation,
  type AggregatedChange,
  type PositionChange,
  type QuarterChange,
  type ReturnSeries,
  type SymbolOwnership,
  type ThirteenFResult,
  type ThirteenFSummary,
} from "@/lib/institutions";
import { DEFAULT_WATCHLIST } from "@/lib/types";

type Tab = "overview" | "correlation" | "investors" | "symbol";

type OverviewStatus = "loading" | "done" | "error";

interface OverviewEntry {
  status: OverviewStatus;
  filing?: ThirteenFSummary;
  error?: string;
}

interface CorrelationEntry {
  status: OverviewStatus;
  series?: ReturnSeries;
  error?: string;
}

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;
const OVERVIEW_CACHE_KEY = "institutions:overview:v1";
const CORR_CACHE_KEY = "institutions:correlation:v1";
const OVERVIEW_CACHE_TTL = 6 * 60 * 60 * 1000;

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

/** 2026-06-30 → 2026 Q2 */
function quarterLabel(period: string | null): string {
  if (!period) return "--";
  const match = /^(\d{4})-(\d{2})/.exec(period);
  if (!match) return period;
  const month = Number(match[2]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return period;
  return `${match[1]} Q${Math.ceil(month / 3)}`;
}

function signedCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCompact(Math.abs(value))}`;
}

function signedMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${formatCompact(Math.abs(value))}`;
}

/** 持仓明细「较上季」列：加仓绿、减仓红、新建仓直接标文字 */
function ChangeBadge({ change }: { change?: PositionChange }) {
  const { t } = useI18n();
  if (!change) return <span className="text-muted-foreground/60">--</span>;
  if (change.action === "new") return <span className="text-positive-text">{t("新建仓")}</span>;
  if (change.changePercent === null) return <span className="text-muted-foreground/60">--</span>;
  return (
    <span
      title={`${t("股数变动")} ${signedCompact(change.shareChange)}`}
      className={change.changePercent > 0 ? "text-positive-text" : "text-negative-text"}
    >
      {formatPercent(change.changePercent, 1)}
    </span>
  );
}

/** 单季加仓 / 减仓 Top 列表 */
function ChangeList({
  title,
  tone,
  items,
  count,
  empty,
}: {
  title: string;
  tone: "positive" | "negative";
  items: PositionChange[];
  count?: number;
  empty: string;
}) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-[10.5px] font-medium ${
            tone === "positive" ? "text-positive-text" : "text-negative-text"
          }`}
        >
          {title}
        </p>
        <span className="num text-[9px] text-muted-foreground/70">{count ?? items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.slice(0, 5).map((item) => (
            <li
              key={`${item.cusip}-${item.putCall ?? ""}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span
                className="min-w-0 flex-1 truncate text-[11px] text-foreground/85"
                title={`${item.issuer} · ${item.cusip}${item.putCall ? ` · ${item.putCall}` : ""}`}
              >
                {item.issuer}
                {item.titleOfClass && item.titleOfClass !== "COM" ? (
                  <span className="ml-1 rounded bg-card px-1 text-[8.5px] text-muted-foreground">
                    {item.titleOfClass}
                  </span>
                ) : null}
                {item.putCall ? (
                  <span className="ml-1 rounded bg-card px-1 text-[8.5px] text-muted-foreground">
                    {item.putCall}
                  </span>
                ) : null}
              </span>
              <span className="num shrink-0 text-[10px]">
                {item.action === "new" || item.action === "exit" ? (
                  <span
                    className={
                      item.action === "new" ? "text-positive-text" : "text-negative-text"
                    }
                  >
                    {item.action === "new" ? t("新建仓") : t("清仓")}
                  </span>
                ) : (
                  <span
                    className={
                      item.action === "add" ? "text-positive-text" : "text-negative-text"
                    }
                  >
                    {formatPercent(item.changePercent, 1)}
                  </span>
                )}
                <span className="ml-1 text-muted-foreground">{signedMoney(item.valueChange)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 总览卡片里的近 3 季迷你趋势条（由旧到新） */
function MiniTrend({ quarters }: { quarters: QuarterChange[] }) {
  const list = [...quarters].reverse().slice(-3);
  const max = Math.max(1, ...list.map((item) => Math.abs(item.buysValue - item.sellsValue)));
  return (
    <span className="flex h-8 items-end gap-0.5" aria-hidden="true">
      {list.map((item) => {
        const net = item.buysValue - item.sellsValue;
        const height = Math.max(8, (Math.abs(net) / max) * 100);
        return (
          <span
            key={item.quarter}
            className={`w-1.5 rounded-t ${net >= 0 ? "bg-positive/70" : "bg-negative/70"}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </span>
  );
}

/** 名人调仓总览卡片 */
function OverviewCard({
  investor,
  entry,
  onOpen,
  onRetry,
}: {
  investor: (typeof SUPER_INVESTORS)[number];
  entry: OverviewEntry;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  if (entry.status !== "done" || !entry.filing) {
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-3">
        <div className="flex items-center gap-2">
          <Avatar name={investor.nameZh} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-foreground">{investor.nameZh}</p>
            <p className="truncate text-[9.5px] text-muted-foreground">{investor.fund}</p>
          </div>
        </div>
        {entry.status === "error" ? (
          <div className="mt-3 rounded-lg border border-negative/20 bg-negative-soft px-2.5 py-2">
            <p className="truncate text-[10px] text-negative-text" title={entry.error}>
              {entry.error || t("加载失败")}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 h-6 rounded border border-border px-2 text-[10px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              {t("重试")}
            </button>
          </div>
        ) : (
          <>
            <div className="skeleton mt-3 h-8 rounded-md" />
            <div className="skeleton mt-2 h-3 rounded-md" />
            <div className="skeleton mt-1.5 h-3 w-2/3 rounded-md" />
          </>
        )}
      </div>
    );
  }

  const filing = entry.filing;
  const latest = filing.quarters[0];
  const net = latest ? latest.buysValue - latest.sellsValue : 0;
  const topBuy = latest?.buys[0];
  const topSell = latest?.sells[0];
  const changeLabel = (item: PositionChange) =>
    item.action === "new"
      ? t("新建仓")
      : item.action === "exit"
        ? t("清仓")
        : formatPercent(item.changePercent, 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:border-accent/40 hover:bg-hover"
    >
      <div className="flex items-start gap-2">
        <Avatar name={investor.nameZh} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-foreground">{investor.nameZh}</p>
          <p className="truncate text-[9.5px] text-muted-foreground">
            {filing.entityName || investor.fund}
          </p>
        </div>
        <span className="num shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
          {quarterLabel(filing.period)}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] text-muted-foreground">{t("本季净额")}</p>
          <p
            className={`num text-[18px] font-medium leading-tight ${
              net >= 0 ? "text-positive-text" : "text-negative-text"
            }`}
          >
            {signedMoney(net)}
          </p>
          <p className="truncate text-[9px] text-muted-foreground">
            {net >= 0 ? t("净买入") : t("净卖出")} · {t("持仓")} {filing.totalPositions}
          </p>
        </div>
        <div className="shrink-0">
          <MiniTrend quarters={filing.quarters} />
          <p className="mt-0.5 text-right text-[8.5px] text-muted-foreground/70">{t("近 3 季")}</p>
        </div>
      </div>

      <div className="space-y-1 border-t border-border/60 pt-2">
        <div className="flex items-baseline gap-1.5 text-[10px]">
          <span className="w-7 shrink-0 text-positive-text">{t("加仓")}</span>
          <span className="min-w-0 flex-1 truncate text-foreground/85" title={topBuy?.cusip}>
            {topBuy?.issuer ?? "--"}
          </span>
          <span className="num shrink-0 text-positive-text">
            {topBuy ? changeLabel(topBuy) : "--"}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 text-[10px]">
          <span className="w-7 shrink-0 text-negative-text">{t("减仓")}</span>
          <span className="min-w-0 flex-1 truncate text-foreground/85" title={topSell?.cusip}>
            {topSell?.issuer ?? "--"}
          </span>
          <span className="num shrink-0 text-negative-text">
            {topSell ? changeLabel(topSell) : "--"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-muted-foreground/70">
        <span className="num">
          {t("加仓")} {latest?.buysCount ?? 0} · {t("减仓")} {latest?.sellsCount ?? 0}
        </span>
        <span className="text-accent">{t("查看详情")} →</span>
      </div>
    </button>
  );
}

function shortInvestorName(name: string): string {
  const base = name.split("·")[0].trim() || name;
  return base.length > 7 ? `${base.slice(0, 7)}…` : base;
}

function corrLabel(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return "—";
  if (r >= 0.995) return "+1";
  if (r <= -0.995) return "−1";
  const body = Math.abs(r).toFixed(2).slice(1);
  return `${r > 0 ? "+" : "−"}${body}`;
}

const CORR_POSITIVE_CLASSES = [
  "bg-positive/90 text-white",
  "bg-positive/70 text-white",
  "bg-positive/50 text-foreground",
  "bg-positive/30 text-foreground",
  "bg-positive/15 text-foreground",
];

const CORR_NEGATIVE_CLASSES = [
  "bg-negative/90 text-white",
  "bg-negative/70 text-white",
  "bg-negative/50 text-foreground",
  "bg-negative/30 text-foreground",
  "bg-negative/15 text-foreground",
];

function correlationCellClass(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return "bg-muted/30 text-muted-foreground/40";
  const magnitude = Math.abs(r);
  const index =
    magnitude >= 0.8 ? 0 : magnitude >= 0.6 ? 1 : magnitude >= 0.4 ? 2 : magnitude >= 0.2 ? 3 : 4;
  return r >= 0 ? CORR_POSITIVE_CLASSES[index] : CORR_NEGATIVE_CLASSES[index];
}

/** 相关性排行列表 */
function CorrelationRankList({
  title,
  tone,
  items,
  onSelect,
}: {
  title: string;
  tone: "positive" | "negative";
  items: { investor: (typeof SUPER_INVESTORS)[number]; r: number; n: number }[];
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2">
      <p
        className={`text-[10.5px] font-medium ${
          tone === "positive" ? "text-positive-text" : "text-negative-text"
        }`}
      >
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{t("暂无足够数据")}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((item) => (
            <li key={item.investor.id}>
              <button
                type="button"
                onClick={() => onSelect(item.investor.id)}
                className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-foreground/85">
                  {item.investor.nameZh}
                </span>
                <span className="num shrink-0 text-[8.5px] text-muted-foreground/70">
                  {t("共同季度")} {item.n}
                </span>
                <span
                  className={`num w-[38px] shrink-0 text-right text-[10.5px] ${
                    item.r >= 0 ? "text-positive-text" : "text-negative-text"
                  }`}
                >
                  {corrLabel(item.r)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 跨机构加仓 / 减仓 Top 榜 */
function AggregatedChangeList({
  title,
  tone,
  items,
  loading,
}: {
  title: string;
  tone: "positive" | "negative";
  items: AggregatedChange[];
  loading: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2
          className={`text-[11.5px] font-medium ${
            tone === "positive" ? "text-positive-text" : "text-negative-text"
          }`}
        >
          {title}
        </h2>
        <span className="text-[9px] text-muted-foreground">{t("按合计金额排序")}</span>
      </div>
      {loading ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-6 rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-muted-foreground">{t("暂无数据")}</p>
      ) : (
        <ol className="divide-y divide-border/60">
          {items.map((item, index) => (
            <li
              key={`${item.cusip}-${item.putCall ?? ""}`}
              className="flex items-center gap-2 px-3 py-1.5"
            >
              <span
                className={`num flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] ${
                  index < 3
                    ? tone === "positive"
                      ? "bg-positive/15 font-medium text-positive-text"
                      : "bg-negative/15 font-medium text-negative-text"
                    : "text-muted-foreground/70"
                }`}
              >
                {index + 1}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[11px] text-foreground/90"
                title={`${item.issuer} · ${item.cusip}`}
              >
                {item.issuer}
                {item.titleOfClass && item.titleOfClass !== "COM" ? (
                  <span className="ml-1 rounded bg-muted px-1 text-[8.5px] text-muted-foreground">
                    {item.titleOfClass}
                  </span>
                ) : null}
                {item.putCall ? (
                  <span className="ml-1 rounded bg-muted px-1 text-[8.5px] text-muted-foreground">
                    {item.putCall}
                  </span>
                ) : null}
              </span>
              <span className="num shrink-0 text-[9px] text-muted-foreground">
                {item.institutions} {t("家机构")}
              </span>
              <span
                className={`num w-[72px] shrink-0 text-right text-[10.5px] ${
                  tone === "positive" ? "text-positive-text" : "text-negative-text"
                }`}
              >
                {signedMoney(tone === "positive" ? item.amount : -item.amount)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-border/60 px-3 py-1.5 text-[9px] text-muted-foreground/70">
        {t("按本季股数变动 × 季末价估算；聚合每位名人本季前 30 个调仓标的（不含期权）")}
      </p>
    </div>
  );
}

export default function InstitutionsDashboard() {
  const { t } = useI18n();
  // 默认进入「调仓总览」，一眼看到所有名人的加减仓趋势
  const [tab, setTab] = useState<Tab>("overview");

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

  const [overview, setOverview] = useState<Record<string, OverviewEntry>>({});
  const [overviewStarted, setOverviewStarted] = useState(false);
  const [overviewHydrated, setOverviewHydrated] = useState(false);
  const overviewDirtyRef = useRef(false);

  const [corr, setCorr] = useState<Record<string, CorrelationEntry>>({});
  const [corrStarted, setCorrStarted] = useState(false);
  const [corrHydrated, setCorrHydrated] = useState(false);
  const corrDirtyRef = useRef(false);
  const [corrFocusId, setCorrFocusId] = useState(SUPER_INVESTORS[0].id);
  const [overviewFilter, setOverviewFilter] = useState<"all" | "buy" | "sell">("all");
  const [overviewSort, setOverviewSort] = useState<"netDesc" | "netAsc" | "name">("netDesc");

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

  const loadOverviewInvestor = useCallback(async (id: string) => {
    setOverview((prev) => ({ ...prev, [id]: { status: "loading" } }));
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`/api/institutions/13f?investor=${id}&summary=1`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `加载失败（${response.status}）`);
        }
        const data = (await response.json()) as ThirteenFSummary;
        overviewDirtyRef.current = true;
        setOverview((prev) => ({ ...prev, [id]: { status: "done", filing: data } }));
        return;
      } catch (error) {
        lastError = error;
        // 首次失败多半是 SEC 瞬时限流，稍等再试一次
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    setOverview((prev) => ({
      ...prev,
      [id]: {
        status: "error",
        error: lastError instanceof Error ? lastError.message : "加载失败",
      },
    }));
  }, []);

  // 名人 13F：进入页面就加载（tab 默认为 investors）
  useEffect(() => {
    if (tab === "investors") void loadFiling(investorId);
  }, [tab, investorId, loadFiling]);

  // 总览：先用 localStorage 里的 6 小时缓存秒开，再补拉缺失 / 过期数据
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OVERVIEW_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          savedAt?: number;
          entries?: Record<string, ThirteenFSummary>;
        };
        if (
          parsed.savedAt &&
          Date.now() - parsed.savedAt < OVERVIEW_CACHE_TTL &&
          parsed.entries
        ) {
          setOverview((prev) => {
            const next = { ...prev };
            for (const [id, filing] of Object.entries(parsed.entries ?? {})) {
              next[id] = { status: "done", filing };
            }
            return next;
          });
        }
      }
    } catch {
      // 忽略缓存解析失败，按正常流程拉取
    }
    setOverviewHydrated(true);
  }, []);

  // 总览：首次进入时 3 路并发拉取全部名人摘要，逐张填充
  useEffect(() => {
    if (!overviewHydrated || tab !== "overview" || overviewStarted) return;
    setOverviewStarted(true);
    setOverview((prev) => {
      const next = { ...prev };
      for (const item of SUPER_INVESTORS) {
        if (!next[item.id]) next[item.id] = { status: "loading" };
      }
      return next;
    });
    const queue = SUPER_INVESTORS.map((item) => item.id).filter(
      (id) => overview[id]?.status !== "done",
    );
    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        await loadOverviewInvestor(id);
      }
    };
    void Promise.all([worker(), worker(), worker()]);
  }, [tab, overviewStarted, overviewHydrated, overview, loadOverviewInvestor]);

  // 缓存已加载的摘要，供下次打开秒开（仅在本轮真正拉到新数据时刷新时间戳）
  useEffect(() => {
    if (tab !== "overview" || !overviewDirtyRef.current) return;
    const entries: Record<string, ThirteenFSummary> = {};
    for (const item of SUPER_INVESTORS) {
      const entry = overview[item.id];
      if (entry?.status === "done" && entry.filing) entries[item.id] = entry.filing;
    }
    if (Object.keys(entries).length === 0) return;
    try {
      window.localStorage.setItem(
        OVERVIEW_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), entries }),
      );
      overviewDirtyRef.current = false;
    } catch {
      // localStorage 不可用 / 超配额时忽略
    }
  }, [overview, tab]);

  const refreshOverview = useCallback(() => {
    try {
      window.localStorage.removeItem(OVERVIEW_CACHE_KEY);
    } catch {
      // ignore
    }
    setOverview({});
    setOverviewStarted(false);
  }, []);

  const loadCorrelationInvestor = useCallback(async (id: string) => {
    setCorr((prev) => ({ ...prev, [id]: { status: "loading" } }));
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(
          `/api/institutions/correlation?investor=${id}&quarters=8`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `加载失败（${response.status}）`);
        }
        const data = (await response.json()) as ReturnSeries;
        corrDirtyRef.current = true;
        setCorr((prev) => ({ ...prev, [id]: { status: "done", series: data } }));
        return;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    setCorr((prev) => ({
      ...prev,
      [id]: {
        status: "error",
        error: lastError instanceof Error ? lastError.message : "加载失败",
      },
    }));
  }, []);

  // 相关性：先用 6 小时本地缓存秒开，再补拉缺失数据
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CORR_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          savedAt?: number;
          entries?: Record<string, ReturnSeries>;
        };
        if (parsed.savedAt && Date.now() - parsed.savedAt < OVERVIEW_CACHE_TTL && parsed.entries) {
          setCorr((prev) => {
            const next = { ...prev };
            for (const [id, series] of Object.entries(parsed.entries ?? {})) {
              next[id] = { status: "done", series };
            }
            return next;
          });
        }
      }
    } catch {
      // ignore
    }
    setCorrHydrated(true);
  }, []);

  // 相关性：首次进入时 3 路并发拉取，逐位填充
  useEffect(() => {
    if (!corrHydrated || tab !== "correlation" || corrStarted) return;
    setCorrStarted(true);
    setCorr((prev) => {
      const next = { ...prev };
      for (const item of SUPER_INVESTORS) {
        if (!next[item.id]) next[item.id] = { status: "loading" };
      }
      return next;
    });
    const queue = SUPER_INVESTORS.map((item) => item.id).filter(
      (id) => corr[id]?.status !== "done",
    );
    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        await loadCorrelationInvestor(id);
      }
    };
    void Promise.all([worker(), worker(), worker()]);
  }, [tab, corrStarted, corrHydrated, corr, loadCorrelationInvestor]);

  // 缓存收益序列
  useEffect(() => {
    if (tab !== "correlation" || !corrDirtyRef.current) return;
    const entries: Record<string, ReturnSeries> = {};
    for (const item of SUPER_INVESTORS) {
      const entry = corr[item.id];
      if (entry?.status === "done" && entry.series) entries[item.id] = entry.series;
    }
    if (Object.keys(entries).length === 0) return;
    try {
      window.localStorage.setItem(
        CORR_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), entries }),
      );
      corrDirtyRef.current = false;
    } catch {
      // ignore
    }
  }, [corr, tab]);

  const refreshCorrelation = useCallback(() => {
    try {
      window.localStorage.removeItem(CORR_CACHE_KEY);
    } catch {
      // ignore
    }
    setCorr({});
    setCorrStarted(false);
  }, []);

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

  const latestChangeMap = useMemo(() => {
    const map = new Map<string, PositionChange>();
    for (const change of filing?.latestChanges ?? []) {
      map.set(`${change.cusip}|${change.putCall ?? ""}`, change);
    }
    return map;
  }, [filing]);

  const netTrend = useMemo(() => {
    // 由旧到新，便于从左到右看加减趋势
    const quarters = [...(filing?.quarters ?? [])].reverse();
    const max = Math.max(
      1,
      ...quarters.map((quarter) => Math.abs(quarter.buysValue - quarter.sellsValue)),
    );
    return { quarters, max };
  }, [filing]);

  const rows = useMemo(() => {
    if (!filing) return [];
    const total = filing.totalValue || 0;
    const list = filing.holdings.map((holding, index) => ({
      ...holding,
      rank: index + 1,
      weight:
        total > 0 && holding.value !== null ? (holding.value / total) * 100 : null,
      change: latestChangeMap.get(`${holding.cusip}|${holding.putCall ?? ""}`),
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
  }, [filing, filter, ascending, latestChangeMap]);

  // 前十大持仓始终按市值排序，不受表格过滤/升降序影响
  const topHoldings = useMemo(() => {
    if (!filing) return [];
    const total = filing.totalValue || 0;
    return filing.holdings.slice(0, 10).map((holding, index) => ({
      ...holding,
      rank: index + 1,
      weight:
        total > 0 && holding.value !== null ? (holding.value / total) * 100 : null,
      change: latestChangeMap.get(`${holding.cusip}|${holding.putCall ?? ""}`),
    }));
  }, [filing, latestChangeMap]);
  const concentration = useMemo(
    () => topHoldings.reduce((sum, item) => sum + (item.weight ?? 0), 0),
    [topHoldings],
  );
  const maxTopWeight = topHoldings[0]?.weight ?? 0;

  const overviewRows = useMemo(() => {
    const rows = SUPER_INVESTORS.map((investor) => ({
      investor,
      entry: overview[investor.id] ?? { status: "loading" as const },
    }));
    const netOf = (entry: OverviewEntry): number | null => {
      const latest = entry.filing?.quarters[0];
      return latest ? latest.buysValue - latest.sellsValue : null;
    };
    const filtered = rows.filter(({ entry }) => {
      if (overviewFilter === "all") return true;
      const net = netOf(entry);
      if (net === null) return false;
      return overviewFilter === "buy" ? net > 0 : net < 0;
    });

    // 还在加载时保持稳定顺序，避免卡片随数据到达不断跳动
    const settled = SUPER_INVESTORS.every((item) => {
      const status = overview[item.id]?.status;
      return status === "done" || status === "error";
    });
    if (!settled && overviewSort !== "name") return filtered;

    return filtered.sort((a, b) => {
      if (overviewSort === "name") return a.investor.nameZh.localeCompare(b.investor.nameZh);
      const aNet = netOf(a.entry);
      const bNet = netOf(b.entry);
      if (aNet === null && bNet === null) return 0;
      if (aNet === null) return 1;
      if (bNet === null) return -1;
      return overviewSort === "netDesc" ? bNet - aNet : aNet - bNet;
    });
  }, [overview, overviewFilter, overviewSort]);

  const overviewStats = useMemo(() => {
    let loaded = 0;
    let buys = 0;
    let sells = 0;
    let net = 0;
    let period: string | null = null;
    for (const investor of SUPER_INVESTORS) {
      const entry = overview[investor.id];
      if (entry?.status !== "done" || !entry.filing) continue;
      loaded += 1;
      if (entry.filing.period && (!period || entry.filing.period > period)) {
        period = entry.filing.period;
      }
      const latest = entry.filing.quarters[0];
      if (!latest) continue;
      const quarterNet = latest.buysValue - latest.sellsValue;
      net += quarterNet;
      if (quarterNet > 0) buys += 1;
      else if (quarterNet < 0) sells += 1;
    }
    return { loaded, total: SUPER_INVESTORS.length, buys, sells, net, period };
  }, [overview]);

  const topAggregatedChanges = useMemo(() => {
    const entries = SUPER_INVESTORS.flatMap((investor) => {
      const entry = overview[investor.id];
      if (entry?.status !== "done") return [];
      const quarter = entry.filing?.quarters[0];
      return quarter ? [{ investorId: investor.id, quarter }] : [];
    });
    return {
      buys: aggregateTopChanges(entries, "buy", 5),
      sells: aggregateTopChanges(entries, "sell", 5),
    };
  }, [overview]);

  const correlationModel = useMemo(() => {
    const seriesMap = new Map<string, Map<string, number>>();
    const quarterSet = new Set<string>();
    for (const investor of SUPER_INVESTORS) {
      const series = corr[investor.id]?.series;
      if (!series) continue;
      const points = new Map(series.points.map((point) => [point.quarter, point.returnPct]));
      seriesMap.set(investor.id, points);
      for (const quarter of points.keys()) quarterSet.add(quarter);
    }

    const matrix = new Map<string, Map<string, { r: number | null; n: number }>>();
    for (const row of SUPER_INVESTORS) {
      const rowMap = new Map<string, { r: number | null; n: number }>();
      const rowPoints = seriesMap.get(row.id);
      for (const col of SUPER_INVESTORS) {
        const colPoints = seriesMap.get(col.id);
        let r: number | null = null;
        let n = 0;
        if (rowPoints && colPoints) {
          const xs: number[] = [];
          const ys: number[] = [];
          for (const [quarter, value] of rowPoints) {
            const other = colPoints.get(quarter);
            if (other !== undefined) {
              xs.push(value);
              ys.push(other);
            }
          }
          n = xs.length;
          if (n >= 5) r = pearsonCorrelation(xs, ys);
        }
        rowMap.set(col.id, { r, n });
      }
      matrix.set(row.id, rowMap);
    }

    const pairs: { a: (typeof SUPER_INVESTORS)[number]; b: (typeof SUPER_INVESTORS)[number]; r: number }[] = [];
    let sum = 0;
    for (let i = 0; i < SUPER_INVESTORS.length; i += 1) {
      for (let j = i + 1; j < SUPER_INVESTORS.length; j += 1) {
        const a = SUPER_INVESTORS[i];
        const b = SUPER_INVESTORS[j];
        const r = matrix.get(a.id)?.get(b.id)?.r;
        if (r === null || r === undefined) continue;
        pairs.push({ a, b, r });
        sum += r;
      }
    }
    pairs.sort((left, right) => right.r - left.r);
    const quarters = [...quarterSet].sort().slice(-8);

    return {
      matrix,
      loaded: seriesMap.size,
      average: pairs.length > 0 ? sum / pairs.length : null,
      highest: pairs[0] ?? null,
      lowest: pairs[pairs.length - 1] ?? null,
      pairCount: pairs.length,
      quarters,
    };
  }, [corr]);

  const corrFocus = SUPER_INVESTORS.find((item) => item.id === corrFocusId) ?? SUPER_INVESTORS[0];
  const corrFocusRanked = SUPER_INVESTORS.filter((item) => item.id !== corrFocus.id)
    .map((item) => {
      const cell = correlationModel.matrix.get(corrFocus.id)?.get(item.id);
      return cell && cell.r !== null ? { investor: item, r: cell.r, n: cell.n } : null;
    })
    .filter(
      (item): item is { investor: (typeof SUPER_INVESTORS)[number]; r: number; n: number } =>
        item !== null,
    )
    .sort((left, right) => right.r - left.r);
  const corrTopPositive = corrFocusRanked.filter((item) => item.r > 0).slice(0, 5);
  const corrTopNegative = [...corrFocusRanked]
    .reverse()
    .filter((item) => item.r < 0)
    .slice(0, 5);

  return (
    <PageShell
      title={t("机构持仓")}
      description={t("名人 13F 季度持仓 · 机构持股 · 内部人交易")}
      actions={
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {([
            { key: "overview", label: t("调仓总览") },
            { key: "correlation", label: t("名人相关性") },
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
      {tab === "overview" ? (
        <div className="space-y-3">
          <section className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-[84px]">
                <p className="text-[10px] text-muted-foreground">{t("数据季度")}</p>
                <p className="num mt-0.5 text-[13px] font-medium text-foreground">
                  {quarterLabel(overviewStats.period)}
                </p>
              </div>
              <Stat
                label={t("已加载")}
                value={`${overviewStats.loaded}/${overviewStats.total}`}
              />
              <Stat label={t("净买入人数")} value={String(overviewStats.buys)} />
              <Stat label={t("净卖出人数")} value={String(overviewStats.sells)} />
              <Stat label={t("合计净额")} value={signedMoney(overviewStats.net)} />
              <div className="ml-auto flex items-center gap-2">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-accent/70 transition-[width]"
                    style={{
                      width: `${(overviewStats.loaded / Math.max(1, overviewStats.total)) * 100}%`,
                    }}
                  />
                </span>
                <button
                  type="button"
                  onClick={refreshOverview}
                  className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-hover hover:text-foreground"
                >
                  {t("刷新全部")}
                </button>
              </div>
              {overviewStats.loaded < overviewStats.total && (
                <p className="w-full text-[9px] text-muted-foreground/70">
                  {t("首次加载受 SEC 限流影响，约需 20-30 秒，之后缓存 6 小时")}
                </p>
              )}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <AggregatedChangeList
              title={t("机构加仓 Top 5")}
              tone="positive"
              items={topAggregatedChanges.buys}
              loading={overviewStats.loaded === 0}
            />
            <AggregatedChangeList
              title={t("机构减仓 Top 5")}
              tone="negative"
              items={topAggregatedChanges.sells}
              loading={overviewStats.loaded === 0}
            />
          </section>

          <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <span className="text-[10px] text-muted-foreground">{t("筛选")}</span>
            {([
              { key: "all", label: t("全部名人") },
              { key: "buy", label: t("净买入") },
              { key: "sell", label: t("净卖出") },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setOverviewFilter(item.key)}
                aria-pressed={overviewFilter === item.key}
                className={`h-6 rounded-md border px-2 text-[10.5px] transition-colors ${
                  overviewFilter === item.key
                    ? "border-accent/50 bg-accent-soft font-medium text-accent"
                    : "border-border text-muted-foreground hover:bg-hover hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-muted-foreground">{t("排序")}</span>
            {([
              { key: "netDesc", label: `${t("净额")} ↓` },
              { key: "netAsc", label: `${t("净额")} ↑` },
              { key: "name", label: t("名称") },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setOverviewSort(item.key)}
                aria-pressed={overviewSort === item.key}
                className={`h-6 rounded-md border px-2 text-[10.5px] transition-colors ${
                  overviewSort === item.key
                    ? "border-accent/50 bg-accent-soft font-medium text-accent"
                    : "border-border text-muted-foreground hover:bg-hover hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </section>

          {overviewRows.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-[11.5px] text-muted-foreground">
              {t("暂无数据")}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {overviewRows.map(({ investor: item, entry }) => (
                <OverviewCard
                  key={item.id}
                  investor={item}
                  entry={entry}
                  onOpen={() => {
                    setInvestorId(item.id);
                    setFilter("");
                    setTab("investors");
                  }}
                  onRetry={() => void loadOverviewInvestor(item.id)}
                />
              ))}
            </div>
          )}
          <p className="text-[9px] text-muted-foreground/70">
            {t("净额 = 加仓市值 − 减仓市值，含股价波动")}
          </p>
        </div>
      ) : tab === "correlation" ? (
        <div className="space-y-3">
          <section className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Stat
                label={t("已加载")}
                value={`${correlationModel.loaded}/${SUPER_INVESTORS.length}`}
              />
              <Stat
                label={t("样本季度")}
                value={
                  correlationModel.quarters.length > 0
                    ? `${quarterLabel(correlationModel.quarters[0])} – ${quarterLabel(
                        correlationModel.quarters[correlationModel.quarters.length - 1],
                      )}`
                    : "--"
                }
              />
              <Stat
                label={t("平均相关性")}
                value={correlationModel.average === null ? "--" : corrLabel(correlationModel.average)}
              />
              <div className="min-w-[150px]">
                <p className="text-[10px] text-muted-foreground">{t("最高相关")}</p>
                <p className="num mt-0.5 truncate text-[11px] text-foreground">
                  {correlationModel.highest
                    ? `${shortInvestorName(correlationModel.highest.a.nameZh)} ↔ ${shortInvestorName(
                        correlationModel.highest.b.nameZh,
                      )}`
                    : "--"}
                  {correlationModel.highest && (
                    <span className="ml-1 text-positive-text">
                      {corrLabel(correlationModel.highest.r)}
                    </span>
                  )}
                </p>
              </div>
              <div className="min-w-[150px]">
                <p className="text-[10px] text-muted-foreground">{t("最低相关")}</p>
                <p className="num mt-0.5 truncate text-[11px] text-foreground">
                  {correlationModel.lowest
                    ? `${shortInvestorName(correlationModel.lowest.a.nameZh)} ↔ ${shortInvestorName(
                        correlationModel.lowest.b.nameZh,
                      )}`
                    : "--"}
                  {correlationModel.lowest && (
                    <span className="ml-1 text-negative-text">
                      {corrLabel(correlationModel.lowest.r)}
                    </span>
                  )}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshCorrelation}
                  className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-hover hover:text-foreground"
                >
                  {t("刷新全部")}
                </button>
              </div>
              {correlationModel.loaded < SUPER_INVESTORS.length && (
                <p className="w-full text-[9px] text-muted-foreground/70">
                  {t("首次加载约需 60-90 秒（SEC 限流），之后缓存 6 小时")}
                </p>
              )}
            </div>
          </section>

          <details open className="rounded-xl border border-border bg-card px-4 py-3">
            <summary className="cursor-pointer text-[12.5px] font-medium text-foreground">
              {t("相关性系数怎么用")}
            </summary>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
              {t(
                "用最近 8 个季度 13F 反推的组合收益计算两两 Pearson 相关系数（−1 ~ +1），衡量涨跌是否同步，不是持仓重叠度。",
              )}
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-positive/20 bg-positive-soft px-2.5 py-2">
                <p className="text-[10.5px] font-medium text-positive-text">
                  {t("+0.6 以上 · 高度同步")}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t("风格接近，合并配置的分散效果有限")}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                <p className="text-[10.5px] font-medium text-foreground">
                  {t("−0.2 ~ +0.2 · 基本无关")}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t("组合在一起能明显降低波动")}
                </p>
              </div>
              <div className="rounded-lg border border-negative/20 bg-negative-soft px-2.5 py-2">
                <p className="text-[10.5px] font-medium text-negative-text">
                  {t("< −0.2 · 反向")}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t("分散价值最高，但需确认不是数据异常")}
                </p>
              </div>
            </div>
            <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
              <li>• {t("用法一：挑低相关的 2-3 位名人组合，降低单一风格风险。")}</li>
              <li>• {t("用法二：高相关名人避免重复配置；选风格差异大的组合。")}</li>
              <li>• {t("用法三：结合调仓趋势看——高相关且同向加仓是共识，反向操作是分歧。")}</li>
              <li>• {t("多数名人都是美股多头，相关性整体偏正；重点比较相对高低，而不是把 0 当基准。")}</li>
              <li>• {t("样本只有 8 个季度，|r| 低于约 0.7 时统计意义有限，别过度解读。")}</li>
            </ul>
            <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground/80">
              {t(
                "局限：13F 只含美股多头且季度滞后；现金/债券/做空/非美持仓未体现；8 个季度样本有限；拆股与期权可能造成偏差。相关性不代表因果，历史不代表未来。",
              )}
            </p>
          </details>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-medium">{t("相关性矩阵")}</h2>
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span>−1</span>
                <span className="h-2.5 w-5 rounded-sm bg-negative/80" />
                <span className="h-2.5 w-5 rounded-sm bg-muted/40" />
                <span className="h-2.5 w-5 rounded-sm bg-positive/80" />
                <span>+1</span>
                <span className="ml-2">{t("绿=正相关 · 红=负相关")}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{t("空白 = 共同季度不足 5 个")}</span>
              </div>
            </div>
            {correlationModel.loaded === 0 ? (
              <div className="space-y-1.5 p-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="skeleton h-6 rounded-md" />
                ))}
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto scroll-thin p-2">
                <table className="border-separate border-spacing-0 text-[9px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-30 w-[92px] bg-card px-1.5 py-1 text-left text-[9px] font-medium text-muted-foreground">
                        {t("名人")}
                      </th>
                      {SUPER_INVESTORS.map((item) => (
                        <th
                          key={item.id}
                          className="sticky top-0 z-20 h-[96px] w-[30px] bg-card p-0 align-bottom"
                        >
                          <button
                            type="button"
                            onClick={() => setCorrFocusId(item.id)}
                            title={item.nameZh}
                            className="flex h-full w-full items-end justify-center pb-1"
                          >
                            <span
                              className={`text-[9px] [writing-mode:vertical-rl] ${
                                item.id === corrFocus.id
                                  ? "font-medium text-accent"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {shortInvestorName(item.nameZh)}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SUPER_INVESTORS.map((row) => {
                      const rowCells = correlationModel.matrix.get(row.id);
                      return (
                        <tr key={row.id}>
                          <th
                            className={`sticky left-0 z-10 w-[92px] border-t border-border/40 bg-card px-1.5 py-0.5 text-left text-[9px] ${
                              row.id === corrFocus.id
                                ? "font-medium text-accent"
                                : "font-normal text-foreground/85"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setCorrFocusId(row.id)}
                              title={row.nameZh}
                              className="w-full truncate text-left"
                            >
                              {shortInvestorName(row.nameZh)}
                            </button>
                          </th>
                          {SUPER_INVESTORS.map((col) => {
                            const cell = rowCells?.get(col.id);
                            const isSelf = row.id === col.id;
                            return (
                              <td
                                key={col.id}
                                onClick={() => setCorrFocusId(row.id)}
                                title={`${row.nameZh} × ${col.nameZh} · ${t("共同季度")} ${
                                  cell?.n ?? 0
                                }`}
                                className={`h-[26px] w-[30px] cursor-pointer border-l border-t border-border/30 p-0 text-center align-middle ${
                                  isSelf
                                    ? "bg-muted/30 text-muted-foreground/40"
                                    : correlationCellClass(cell?.r ?? null)
                                }`}
                              >
                                <span className="num text-[7.5px]">
                                  {isSelf ? "—" : corrLabel(cell?.r ?? null)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-medium">{t("相关性排行")}</h2>
              <select
                value={corrFocusId}
                onChange={(event) => setCorrFocusId(event.target.value)}
                aria-label={t("选择名人")}
                className="ml-auto h-7 max-w-[220px] rounded-md border border-border bg-card px-2 text-[11px] text-foreground outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
              >
                {SUPER_INVESTORS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nameZh}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 p-3 md:grid-cols-2">
              <CorrelationRankList
                title={t("正相关 Top 5")}
                tone="positive"
                items={corrTopPositive}
                onSelect={setCorrFocusId}
              />
              <CorrelationRankList
                title={t("负相关 Top 5")}
                tone="negative"
                items={corrTopNegative}
                onSelect={setCorrFocusId}
              />
            </div>
          </section>
        </div>
      ) : tab === "investors" ? (
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
                  {filing ? `${t("报告期")} ${filing.period ?? filing.filedAt ?? "--"}` : "--"}
                </span>
                {filing?.filedAt && (
                  <span className="num text-muted-foreground/70">
                    {t("提交日")} {filing.filedAt}
                  </span>
                )}
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
                              <span
                                className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/90"
                                title={`${item.issuer} · ${item.cusip}`}
                              >
                                {item.issuer}
                                {item.titleOfClass && item.titleOfClass !== "COM" ? (
                                  <span className="ml-1 text-[8.5px] text-muted-foreground">
                                    {item.titleOfClass}
                                  </span>
                                ) : null}
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
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                    <h2 className="text-[13px] font-medium">{t("近期调仓")}</h2>
                    <span className="text-[10px] text-muted-foreground">
                      {t("最近 3 个季度 · 对比上季 13F · 按市值变动排序")}
                    </span>
                  </div>
                  {filingLoading && !filing ? (
                    <div className="space-y-1.5 p-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="skeleton h-16 rounded-md" />
                      ))}
                    </div>
                  ) : (filing?.quarters?.length ?? 0) === 0 ? (
                    <p className="px-4 py-5 text-[11.5px] text-muted-foreground">
                      {t("暂无调仓数据")}
                    </p>
                  ) : (
                    <>
                      <div className="border-b border-border/60 bg-muted/10 px-4 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <p className="text-[10px] font-medium text-muted-foreground">
                            {t("近 3 季净买入 / 净卖出")}
                          </p>
                          <p className="text-[9px] text-muted-foreground/70">
                            {t("绿=净买入 · 红=净卖出 · 由旧到新")}
                          </p>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-4">
                          {netTrend.quarters.map((quarter) => {
                            const net = quarter.buysValue - quarter.sellsValue;
                            const height = Math.max(6, (Math.abs(net) / netTrend.max) * 100);
                            return (
                              <div key={quarter.quarter} className="min-w-0">
                                <div className="flex h-12 items-end justify-center">
                                  <span
                                    className={`w-8 max-w-full rounded-t ${
                                      net >= 0 ? "bg-positive/70" : "bg-negative/70"
                                    }`}
                                    style={{ height: `${height}%` }}
                                  />
                                </div>
                                <div className="mt-1 flex items-baseline justify-between gap-1">
                                  <span className="num text-[9px] text-muted-foreground">
                                    {quarterLabel(quarter.quarter)}
                                  </span>
                                  <span
                                    className={`num text-[9.5px] ${
                                      net >= 0 ? "text-positive-text" : "text-negative-text"
                                    }`}
                                  >
                                    {signedMoney(net)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="divide-y divide-border/60">
                        {filing!.quarters.map((quarter) => (
                        <div key={quarter.quarter} className="px-4 py-3">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="num text-[12px] font-medium text-foreground">
                              {quarterLabel(quarter.quarter)}
                            </span>
                            <span className="num text-[9.5px] text-muted-foreground">
                              {t("报告期")} {quarter.quarter}
                            </span>
                            <span className="num text-[9.5px] text-muted-foreground/70">
                              {t("对比")} {quarterLabel(quarter.previousQuarter)}
                            </span>
                            <span className="num ml-auto text-[9.5px] text-muted-foreground">
                              {t("加仓市值")}{" "}
                              <span className="text-positive-text">
                                {signedMoney(quarter.buysValue)}
                              </span>
                              <span className="mx-1 text-muted-foreground/50">·</span>
                              {t("减仓市值")}{" "}
                              <span className="text-negative-text">
                                {signedMoney(-quarter.sellsValue)}
                              </span>
                            </span>
                          </div>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <ChangeList
                              title={t("加仓")}
                              tone="positive"
                              items={quarter.buys}
                              count={quarter.buysCount}
                              empty={t("本季无加仓")}
                            />
                            <ChangeList
                              title={t("减仓")}
                              tone="negative"
                              items={quarter.sells}
                              count={quarter.sellsCount}
                              empty={t("本季无减仓")}
                            />
                          </div>
                        </div>
                        ))}
                      </div>
                    </>
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
                      <table className="w-full min-w-[700px] text-[11.5px]">
                        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                          <tr className="text-[10px] text-muted-foreground">
                            <th className="w-8 px-2 py-1.5 text-right font-medium">#</th>
                            <th className="px-3 py-1.5 text-left font-medium">{t("标的")}</th>
                            <th className="px-3 py-1.5 text-left font-medium">{t("类别")}</th>
                            <th className="px-3 py-1.5 text-right font-medium">{t("股数")}</th>
                            <th className="px-3 py-1.5 text-right font-medium">{t("市值")}</th>
                            <th className="w-[150px] px-3 py-1.5 text-right font-medium">{t("占比")}</th>
                            <th className="w-[86px] px-3 py-1.5 text-right font-medium">{t("较上季")}</th>
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
                                <span className="block truncate text-foreground/90">
                                  {holding.issuer}
                                  {holding.putCall ? (
                                    <span className="ml-1 rounded bg-muted px-1 text-[8.5px] text-muted-foreground">
                                      {holding.putCall}
                                    </span>
                                  ) : null}
                                </span>
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
                              <td className="num px-3 py-1.5 text-right text-[10.5px]">
                                <ChangeBadge change={holding.change} />
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
