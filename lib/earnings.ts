import { cached } from "@/lib/cache";
import { requestNasdaq } from "@/lib/nasdaq";
import { formatCompact, formatNumber, formatPrice } from "@/lib/format";

/**
 * 财报站数据（Nasdaq 公开接口，无需 Key）：
 *  - calendar/earnings?date=YYYY-MM-DD   当天的财报日历
 *  - company/{symbol}/earnings-surprise  近几季 EPS 实际 vs 预期
 *  - company/{symbol}/earnings-forecast  未来季度 EPS 预期
 *  - company/{symbol}/financials         利润表 / 资产负债表 / 现金流 / 财务比率
 */

export type EarningsSession = "pre" | "post" | "unknown";

export interface EarningsCalendarRow {
  symbol: string;
  name: string;
  /** ISO 日期 */
  date: string;
  session: EarningsSession;
  marketCap: number | null;
  fiscalQuarterEnding: string | null;
  epsForecast: number | null;
  estimates: number | null;
  lastYearEps: number | null;
}

export interface EarningsSurpriseRow {
  fiscalQuarterEnd: string;
  reportedAt: string | null;
  eps: number | null;
  consensus: number | null;
  /** 百分比数值，例如 3.2 表示超出预期 3.2% */
  surprisePercent: number | null;
}

export interface EarningsForecastRow {
  fiscalEnd: string;
  consensusEps: number | null;
  high: number | null;
  low: number | null;
  estimates: number | null;
}

export interface FinancialStatement {
  title: string;
  /** 期次标签，例如 2025-09-27 */
  periods: string[];
  rows: { label: string; values: (number | null)[] }[];
}

export interface EarningsDetail {
  symbol: string;
  surprise: EarningsSurpriseRow[];
  forecast: EarningsForecastRow[];
  statements: {
    income: FinancialStatement | null;
    balance: FinancialStatement | null;
    cashflow: FinancialStatement | null;
  };
  fetchedAt: string;
}

function parseMoney(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const cleaned = String(value).replace(/[$,%\s]/g, "").replace(/^\+/, "");
  if (!cleaned || cleaned.toUpperCase() === "N/A" || cleaned === "--") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function sessionFromTime(time: string | undefined): EarningsSession {
  if (!time) return "unknown";
  const value = time.toLowerCase();
  if (value.includes("pre")) return "pre";
  if (value.includes("after") || value.includes("post")) return "post";
  return "unknown";
}

/** YYYY-MM-DD → 当天财报日历（缓存 10 分钟） */
export async function getEarningsCalendar(date: string): Promise<{
  date: string;
  rows: EarningsCalendarRow[];
  cached: boolean;
}> {
  const result = await cached(`earnings:calendar:${date}`, 600, 3600, async () => {
    const data = await requestNasdaq<{
      asOf?: string;
      rows?: Array<Record<string, string>> | null;
    }>(`/calendar/earnings?date=${encodeURIComponent(date)}`);

    const rows: EarningsCalendarRow[] = (data.rows ?? []).flatMap((row) => {
      const symbol = (row.symbol ?? "").trim().toUpperCase();
      if (!symbol) return [];
      return [
        {
          symbol,
          name: (row.name ?? symbol).trim(),
          date,
          session: sessionFromTime(row.time),
          marketCap: parseMoney(row.marketCap),
          fiscalQuarterEnding: row.fiscalQuarterEnding?.trim() ?? null,
          epsForecast: parseMoney(row.epsForecast),
          estimates: parseMoney(row.noOfEsts),
          lastYearEps: parseMoney(row.lastYearEPS),
        },
      ];
    });

    return { date, rows };
  });

  return { ...result.value, cached: result.cached };
}

/** 报表通用解析：headers.value1..value5 + rows.value1..value5 */
function parseStatement(
  title: string,
  table:
    | {
        headers?: Record<string, string> | null;
        rows?: Array<Record<string, string>> | null;
      }
    | null
    | undefined,
): FinancialStatement | null {
  if (!table?.rows || table.rows.length === 0) return null;

  const headers = table.headers ?? {};
  const periods: string[] = [];
  const valueKeys: string[] = [];
  for (let index = 2; index <= 6; index += 1) {
    const key = `value${index}`;
    const label = headers[key]?.trim();
    if (label) {
      periods.push(label);
      valueKeys.push(key);
    }
  }
  if (valueKeys.length === 0) return null;

  const rows = table.rows.slice(0, 30).map((row) => ({
    label: (row.value1 ?? "").trim(),
    values: valueKeys.map((key) => parseMoney(row[key])),
  }));

  return { title, periods, rows };
}

/** 单个公司的财报详情（缓存 30 分钟） */
export async function getEarningsDetail(
  symbol: string,
): Promise<EarningsDetail & { cached: boolean }> {
  const result = await cached(`earnings:detail:${symbol}`, 1800, 7200, async () => {
    const [surprise, forecast, financials] = await Promise.all([
      requestNasdaq<{
        earningsSurpriseTable?: {
          rows?: Array<Record<string, string>> | null;
        } | null;
      }>(`/company/${encodeURIComponent(symbol)}/earnings-surprise`).catch(() => null),
      requestNasdaq<{
        quarterlyForecast?: { rows?: Array<Record<string, unknown>> | null } | null;
      }>(`/analyst/${encodeURIComponent(symbol)}/earnings-forecast`).catch(() => null),
      requestNasdaq<{
        incomeStatementTable?: { headers?: Record<string, string>; rows?: Array<Record<string, string>> } | null;
        balanceSheetTable?: { headers?: Record<string, string>; rows?: Array<Record<string, string>> } | null;
        cashFlowTable?: { headers?: Record<string, string>; rows?: Array<Record<string, string>> } | null;
      }>(`/company/${encodeURIComponent(symbol)}/financials?frequency=1`).catch(() => null),
    ]);

    const surpriseRows: EarningsSurpriseRow[] = (surprise?.earningsSurpriseTable?.rows ?? [])
      .slice(0, 8)
      .map((row) => ({
        fiscalQuarterEnd: (row.fiscalQtrEnd ?? "").trim(),
        reportedAt: row.dateReported?.trim() ?? null,
        eps: parseMoney(row.eps),
        consensus: parseMoney(row.consensusForecast),
        surprisePercent: parseMoney(row.percentageSurprise ?? row.surprise),
      }));

    const forecastRows: EarningsForecastRow[] = (forecast?.quarterlyForecast?.rows ?? [])
      .slice(0, 6)
      .map((row) => ({
        fiscalEnd: String(row.fiscalEnd ?? "").trim(),
        consensusEps: parseMoney(row.consensusEPSForecast as string),
        high: parseMoney(row.highEPSForecast as string),
        low: parseMoney(row.lowEPSForecast as string),
        estimates: parseMoney(row.noOfEstimates as string),
      }));

    return {
      symbol: symbol.toUpperCase(),
      surprise: surpriseRows,
      forecast: forecastRows,
      statements: {
        income: parseStatement("利润表", financials?.incomeStatementTable),
        balance: parseStatement("资产负债表", financials?.balanceSheetTable),
        cashflow: parseStatement("现金流", financials?.cashFlowTable),
      },
      fetchedAt: new Date().toISOString(),
    };
  });

  return { ...result.value, cached: result.cached };
}

/** 供 UI 复用的格式化 */
export const earningsFormat = { formatCompact, formatNumber, formatPrice };
