import { cached } from "@/lib/cache";
import { requestNasdaq } from "@/lib/nasdaq";

/**
 * 机构持仓数据：
 *  1. Nasdaq `company/{symbol}/institutional-holdings` —— 按标的看机构持股比例、增减仓统计
 *  2. Nasdaq `company/{symbol}/insider-trades`         —— 内部人买卖
 *  3. SEC EDGAR 13F（data.sec.gov + Archives XML）     —— 名人 / 机构的最新季度持仓
 */

export interface OwnershipSummary {
  institutionalPercent: number | null;
  totalSharesMillion: number | null;
  totalValueMillion: number | null;
}

export interface PositionStat {
  label: string;
  holders: number | null;
  shares: number | null;
}

export interface InsiderTrade {
  label: string;
  months3: number | null;
  months12: number | null;
}

export interface SymbolOwnership {
  symbol: string;
  summary: OwnershipSummary;
  active: PositionStat[];
  changes: PositionStat[];
  insider: InsiderTrade[];
  fetchedAt: string;
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const cleaned = String(value).replace(/[$,%\s]/g, "").replace(/^\+/, "");
  if (!cleaned || /^(N\/A|NA|--)$/i.test(cleaned)) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

type NasdaqTable = { headers?: Record<string, string> | null; rows?: Array<Record<string, string>> | null } | null;

function parseStatTable(table: NasdaqTable, labelKey: string): PositionStat[] {
  return (table?.rows ?? []).map((row) => ({
    label: (row[labelKey] ?? "").trim(),
    holders: parseNumber(row.holders),
    shares: parseNumber(row.shares),
  }));
}

/** 单只标的的机构持仓概览（缓存 30 分钟） */
export async function getSymbolOwnership(
  symbol: string,
): Promise<SymbolOwnership & { cached: boolean }> {
  const result = await cached(`institutions:${symbol}`, 1800, 7200, async () => {
    const [holdings, insider] = await Promise.all([
      requestNasdaq<{
        ownershipSummary?: {
          SharesOutstandingPCT?: { value?: string };
          ShareoutstandingTotal?: { value?: string };
          TotalHoldingsValue?: { value?: string };
        };
        activePositions?: NasdaqTable;
        newSoldOutPositions?: NasdaqTable;
      }>(`/company/${encodeURIComponent(symbol)}/institutional-holdings?limit=15`).catch(() => null),
      requestNasdaq<{ numberOfTrades?: NasdaqTable }>(
        `/company/${encodeURIComponent(symbol)}/insider-trades?limit=10`,
      ).catch(() => null),
    ]);

    return {
      symbol: symbol.toUpperCase(),
      summary: {
        institutionalPercent: parseNumber(holdings?.ownershipSummary?.SharesOutstandingPCT?.value),
        totalSharesMillion: parseNumber(holdings?.ownershipSummary?.ShareoutstandingTotal?.value),
        totalValueMillion: parseNumber(holdings?.ownershipSummary?.TotalHoldingsValue?.value),
      },
      active: parseStatTable(holdings?.activePositions ?? null, "positions"),
      changes: parseStatTable(holdings?.newSoldOutPositions ?? null, "positions"),
      insider: (insider?.numberOfTrades?.rows ?? []).map((row) => ({
        label: (row.insiderTrade ?? "").trim(),
        months3: parseNumber(row.months3),
        months12: parseNumber(row.months12),
      })),
      fetchedAt: new Date().toISOString(),
    };
  });

  return { ...result.value, cached: result.cached };
}

/* -------------------------------------------------------------------------- */
/*                          SEC EDGAR 13F（名人持仓）                          */
/* -------------------------------------------------------------------------- */

export interface SuperInvestor {
  id: string;
  name: string;
  /** 中文显示名 */
  nameZh: string;
  cik: string;
  fund: string;
}

/** 预置的超级投资者（CIK 来自 SEC EDGAR） */
export const SUPER_INVESTORS: SuperInvestor[] = [
  { id: "berkshire", name: "Berkshire Hathaway", nameZh: "伯克希尔 · 巴菲特", cik: "0001067983", fund: "Berkshire Hathaway Inc" },
  { id: "bridgewater", name: "Bridgewater Associates", nameZh: "桥水 · 达利欧", cik: "0001350694", fund: "Bridgewater Associates LP" },
  { id: "scion", name: "Scion Asset Management", nameZh: "Scion · 迈克尔·伯里", cik: "0001649339", fund: "Scion Asset Management" },
  { id: "ark", name: "ARK Investment Management", nameZh: "ARK · 木头姐", cik: "0001697748", fund: "ARK Investment Management LLC" },
  { id: "pershing", name: "Pershing Square Capital", nameZh: "潘兴广场 · 阿克曼", cik: "0001336528", fund: "Pershing Square Capital Management" },
  { id: "baupost", name: "Baupost Group", nameZh: "Baupost · 克拉曼", cik: "0001061768", fund: "Baupost Group LLC" },
  { id: "greenlight", name: "Greenlight Capital", nameZh: "绿光资本 · 艾因霍恩", cik: "0001079114", fund: "Greenlight Capital Inc" },
  { id: "thirdpoint", name: "Third Point LLC", nameZh: "Third Point · 勒布", cik: "0001040273", fund: "Third Point LLC" },
  { id: "himalaya", name: "Himalaya Capital", nameZh: "喜马拉雅资本 · 李录", cik: "0001709323", fund: "Himalaya Capital Management LLC" },
  { id: "duanyongping", name: "H&H International Investment", nameZh: "段永平", cik: "0001759760", fund: "H&H International Investment LLC" },
  // —— 以下为扩充名单（CIK 均已在 SEC EDGAR 校验，且近期有 13F-HR 申报）——
  { id: "soros", name: "Soros Fund Management", nameZh: "索罗斯基金 · 索罗斯", cik: "0001029160", fund: "Soros Fund Management LLC" },
  { id: "citadel", name: "Citadel Advisors", nameZh: "城堡投资 · 格里芬", cik: "0001423053", fund: "Citadel Advisors LLC" },
  { id: "point72", name: "Point72 Asset Management", nameZh: "Point72 · 科恩", cik: "0001603466", fund: "Point72 Asset Management, L.P." },
  { id: "renaissance", name: "Renaissance Technologies", nameZh: "文艺复兴 · 西蒙斯", cik: "0001037389", fund: "Renaissance Technologies LLC" },
  { id: "duquesne", name: "Duquesne Family Office", nameZh: "杜肯家族办公室 · 德鲁肯米勒", cik: "0001536411", fund: "Duquesne Family Office LLC" },
  { id: "appaloosa", name: "Appaloosa LP", nameZh: "Appaloosa · 泰珀", cik: "0001656456", fund: "Appaloosa LP" },
  { id: "oaktree", name: "Oaktree Capital Management", nameZh: "橡树资本 · 霍华德·马克斯", cik: "0000949509", fund: "Oaktree Capital Management LP" },
  { id: "tci", name: "TCI Fund Management", nameZh: "TCI · 克里斯·霍恩", cik: "0001647251", fund: "TCI Fund Management Ltd" },
  { id: "hhlr", name: "HHLR Advisors", nameZh: "高瓴 HHLR · 张磊", cik: "0001762304", fund: "HHLR Advisors, Ltd." },
  { id: "fairfax", name: "Fairfax Financial", nameZh: "费尔法克斯 · 瓦萨", cik: "0000915191", fund: "Fairfax Financial Holdings Ltd" },
  { id: "fundsmith", name: "Fundsmith LLP", nameZh: "Fundsmith · 特里·史密斯", cik: "0001569205", fund: "Fundsmith LLP" },
  { id: "tiger", name: "Tiger Global Management", nameZh: "老虎环球 · 科尔曼", cik: "0001167483", fund: "Tiger Global Management LLC" },
  { id: "coatue", name: "Coatue Management", nameZh: "Coatue · 拉方", cik: "0001135730", fund: "Coatue Management LLC" },
  { id: "elliott", name: "Elliott Investment Management", nameZh: "埃利奥特 · 辛格", cik: "0001791786", fund: "Elliott Investment Management L.P." },
  { id: "icahn", name: "Icahn Carl C", nameZh: "伊坎 · 卡尔·伊坎", cik: "0000921669", fund: "Icahn Capital" },
  { id: "gates", name: "Gates Foundation Trust", nameZh: "盖茨基金会信托", cik: "0001166559", fund: "Bill & Melinda Gates Foundation Trust" },
  { id: "gmo", name: "Grantham Mayo Van Otterloo", nameZh: "GMO · 格兰瑟姆", cik: "0001352662", fund: "Grantham, Mayo, Van Otterloo & Co. LLC" },
  { id: "akre", name: "Akre Capital Management", nameZh: "Akre 资本 · 阿克雷", cik: "0001112520", fund: "Akre Capital Management LLC" },
  { id: "gotham", name: "Gotham Asset Management", nameZh: "Gotham · 格林布拉特", cik: "0001510387", fund: "Gotham Asset Management, LLC" },
];

export function findInvestor(id: string): SuperInvestor | null {
  return SUPER_INVESTORS.find((item) => item.id === id) ?? null;
}

const SEC_HEADERS = {
  "User-Agent": "Data Insider research contact@data-insider.local",
  Accept: "application/json, application/xml, text/xml, */*",
};

export interface SecSubmissions {
  name?: string;
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      reportDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
    };
  };
}

export interface Holding13F {
  issuer: string;
  titleOfClass: string;
  cusip: string;
  /** 股数 */
  shares: number | null;
  /** 市值（美元，已做单位归一） */
  value: number | null;
  /** 13F 申报的持股类型：SH（普通股/ETF）或 PRN（可转债/权证等） */
  type: string | null;
  /** 期权方向：CALL / PUT；普通股为 null */
  putCall?: string | null;
}

/**
 * 同一份 13F 会把同一只股票按不同申报主体（`otherManager`）拆成多条 `infoTable`。
 * 例如伯克希尔 2026Q2 的苹果有 12 条，直接逐条展示就会变成「好几个苹果」。
 * 这里按 `CUSIP + putCall` 聚合成一条真实持仓：股数、市值求和，其余字段取首条。
 * 期权（CALL/PUT）与普通股分开，避免把期权名义股数混进正股。
 */
export function aggregateHoldings(holdings: Holding13F[]): Holding13F[] {
  const sum = (a: number | null, b: number | null): number | null =>
    a === null ? b : b === null ? a : a + b;

  const merged = new Map<string, Holding13F>();
  for (const item of holdings) {
    const putCall = (item.putCall ?? "").toUpperCase();
    const key = item.cusip
      ? `${item.cusip}|${putCall}`
      : `${item.issuer}|${item.titleOfClass}|${putCall}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item, putCall: putCall || null });
      continue;
    }
    merged.set(key, {
      ...existing,
      shares: sum(existing.shares, item.shares),
      value: sum(existing.value, item.value),
      type: existing.type ?? item.type,
    });
  }

  return [...merged.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

export type PositionAction = "new" | "add" | "reduce" | "exit";

/** 相邻两个季度之间某只标的的持仓变化 */
export interface PositionChange {
  cusip: string;
  issuer: string;
  titleOfClass: string;
  putCall: string | null;
  /** 本季股数；清仓时为 null */
  shares: number | null;
  /** 上季股数；新建仓时为 null */
  prevShares: number | null;
  /** 股数变动（负数代表减仓） */
  shareChange: number | null;
  /** 股数变动比例（%）；新建仓 / 清仓为 null / -100 */
  changePercent: number | null;
  /** 本季市值；清仓时为 null */
  value: number | null;
  prevValue: number | null;
  /** 市值变动（USD，用于排序与净买入/净卖出汇总） */
  valueChange: number | null;
  action: PositionAction;
}

/** 单个季度的调仓汇总（对比上一个季度） */
export interface QuarterChange {
  /** 本季报告期（YYYY-MM-DD） */
  quarter: string;
  filedAt: string | null;
  /** 对比的上季报告期 */
  previousQuarter: string | null;
  positions: number;
  totalValue: number;
  /** 加仓（含新建仓），按市值变动降序，最多 8 条 */
  buys: PositionChange[];
  /** 减仓（含清仓），按市值变动升序，最多 8 条 */
  sells: PositionChange[];
  /** 本季加仓标的数（完整数量） */
  buysCount: number;
  /** 本季减仓标的数（完整数量） */
  sellsCount: number;
  /** 本季加仓市值合计（USD） */
  buysValue: number;
  /** 本季减仓市值合计（USD，正数） */
  sellsValue: number;
}

export interface QuarterSnapshot {
  quarter: string;
  filedAt: string | null;
  holdings: Holding13F[];
  totalValue: number;
}

const holdingKey = (item: Holding13F): string =>
  `${item.cusip || item.issuer}|${item.putCall ?? ""}`;

/**
 * 对比相邻两个季度的持仓，输出每只标的的加仓 / 减仓 / 新建仓 / 清仓。
 * 股数为 0 变化的不算调仓（市值随股价波动不计入加仓/减仓）。
 */
export function computePositionChanges(
  current: Holding13F[],
  previous: Holding13F[],
): PositionChange[] {
  const previousMap = new Map(previous.map((item) => [holdingKey(item), item]));
  const currentKeys = new Set<string>();
  const changes: PositionChange[] = [];

  for (const item of current) {
    const key = holdingKey(item);
    currentKeys.add(key);
    const prev = previousMap.get(key);
    const shares = item.shares;
    const prevShares = prev?.shares ?? null;

    if (!prev) {
      changes.push({
        cusip: item.cusip,
        issuer: item.issuer,
        titleOfClass: item.titleOfClass,
        putCall: item.putCall ?? null,
        shares,
        prevShares: null,
        shareChange: shares,
        changePercent: null,
        value: item.value,
        prevValue: null,
        valueChange: item.value,
        action: "new",
      });
      continue;
    }

    if (shares === null || prevShares === null) continue;
    const shareChange = shares - prevShares;
    if (shareChange === 0) continue;

    const valueChange =
      item.value === null && prev.value === null
        ? null
        : (item.value ?? 0) - (prev.value ?? 0);

    changes.push({
      cusip: item.cusip,
      issuer: item.issuer,
      titleOfClass: item.titleOfClass,
      putCall: item.putCall ?? null,
      shares,
      prevShares,
      shareChange,
      changePercent: prevShares > 0 ? (shareChange / prevShares) * 100 : null,
      value: item.value,
      prevValue: prev.value,
      valueChange,
      action: shareChange > 0 ? "add" : "reduce",
    });
  }

  for (const prev of previous) {
    if (currentKeys.has(holdingKey(prev))) continue;
    changes.push({
      cusip: prev.cusip,
      issuer: prev.issuer,
      titleOfClass: prev.titleOfClass,
      putCall: prev.putCall ?? null,
      shares: null,
      prevShares: prev.shares,
      shareChange: prev.shares === null ? null : -prev.shares,
      changePercent: -100,
      value: null,
      prevValue: prev.value,
      valueChange: prev.value === null ? null : -prev.value,
      action: "exit",
    });
  }

  return changes;
}

/** 把按时间倒序的季度快照转成最近 3 个季度的调仓汇总（新→旧） */
export function buildQuarterChanges(snapshots: QuarterSnapshot[]): QuarterChange[] {
  const quarters: QuarterChange[] = [];

  for (let index = 0; index < snapshots.length - 1; index += 1) {
    const current = snapshots[index];
    const previous = snapshots[index + 1];
    const changes = computePositionChanges(current.holdings, previous.holdings);

    const buys = changes
      .filter((item) => item.action === "new" || item.action === "add")
      .sort((a, b) => (b.valueChange ?? 0) - (a.valueChange ?? 0));
    const sells = changes
      .filter((item) => item.action === "reduce" || item.action === "exit")
      .sort((a, b) => (a.valueChange ?? 0) - (b.valueChange ?? 0));

    quarters.push({
      quarter: current.quarter,
      filedAt: current.filedAt,
      previousQuarter: previous.quarter,
      positions: current.holdings.length,
      totalValue: current.totalValue,
      buys: buys.slice(0, 8),
      sells: sells.slice(0, 8),
      buysCount: buys.length,
      sellsCount: sells.length,
      buysValue: buys.reduce((sum, item) => sum + Math.max(0, item.valueChange ?? 0), 0),
      sellsValue: sells.reduce((sum, item) => sum + Math.abs(Math.min(0, item.valueChange ?? 0)), 0),
    });
  }

  return quarters;
}

export interface ThirteenFResult {
  investor: SuperInvestor;
  /** SEC 申报主体名（与 preset 的 fund 可能不同，展示以它为准） */
  entityName: string;
  /** 最新一次 13F 的提交日（YYYY-MM-DD） */
  filedAt: string | null;
  /** 最新持仓的报告期（YYYY-MM-DD） */
  period: string | null;
  /** 展示用持仓（按市值降序，最多 200 条） */
  holdings: Holding13F[];
  /** 全量持仓条数（可能远多于展示条数） */
  totalPositions: number;
  /** 全量持仓总市值（USD，已做单位归一） */
  totalValue: number;
  /** 最近 3 个季度的加仓 / 减仓汇总（新→旧） */
  quarters: QuarterChange[];
  /** 最新季度对比上季的全部调仓（供持仓表「较上季」列使用） */
  latestChanges: PositionChange[];
  fetchedAt: string;
}

/**
 * 13F 申报的 value 单位不统一：有的按美元、有的按千美元。
 * 判定只用「普通股/ETF（SH）」样本——可转债/权证（PRN）的 value/shares 不是股价，
 * 会污染统计。规则：SH 样本的隐含价格（value/shares）中位数 < $2，或最大持仓的
 * 隐含价 < $2，即认定为千美元申报，需要 ×1000 归一到美元。
 */
export function detectValueScale(
  holdings: { value: number | null; shares: number | null; type?: string | null }[],
): number {
  const shared = holdings.filter(
    (item) =>
      (item.type ?? "SH") === "SH" &&
      item.value !== null &&
      item.value > 0 &&
      item.shares !== null &&
      item.shares > 0,
  );
  // 没有 SH 样本（全是可转债等）时退回全部样本
  const pool = shared.length > 0 ? shared : holdings;
  const samples = pool
    .map((item) => ({
      value: item.value as number,
      implied: (item.value as number) / (item.shares as number),
    }))
    .filter((item) => Number.isFinite(item.implied) && item.implied > 0);
  if (samples.length === 0) return 1;

  const sorted = [...samples].sort((a, b) => a.implied - b.implied);
  const median = sorted[Math.floor(sorted.length / 2)].implied;
  const topImplied = [...samples].sort((a, b) => b.value - a.value)[0].implied;

  return median < 2 || topImplied < 2 ? 1000 : 1;
}

/** 解码 13F XML 中常见的 HTML/XML 实体（如 `&amp;` → `&`） */
export function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 解析 13F information table XML（兼容带命名空间前缀的 ns1: 形式），返回全量、按市值降序、单位归一到美元 */
export function parseInformationTable(xml: string): Holding13F[] {
  const holdings: Holding13F[] = [];
  // 有些申报用 <ns1:infoTable>，有些不带前缀
  const blocks = xml.split(/<(?:[A-Za-z0-9]+:)?infoTable>/);
  const pick = (block: string, tag: string): string => {
    const pattern = new RegExp(`<(?:[A-Za-z0-9]+:)?${tag}>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${tag}>`);
    return pattern.exec(block)?.[1]?.trim() ?? "";
  };

  for (const block of blocks.slice(1)) {
    const issuer = pick(block, "nameOfIssuer");
    if (!issuer) continue;

    const value = parseNumber(pick(block, "value"));
    const shares = parseNumber(pick(block, "sshPrnamt"));

    holdings.push({
      issuer: decodeXmlText(issuer).replace(/\s+/g, " "),
      titleOfClass: decodeXmlText(pick(block, "titleOfClass")),
      cusip: pick(block, "cusip"),
      shares,
      value,
      type: pick(block, "sshPrnamtType") || null,
      putCall: pick(block, "putCall") || null,
    });
  }

  // 单位归一：value / shares 的中位数能可靠区分「美元」与「千美元」申报
  const scale = detectValueScale(holdings);
  const normalized = holdings.map((item) => ({
    ...item,
    value: item.value === null ? null : item.value * scale,
  }));

  // 同一 CUSIP 的多条申报明细合并为一条持仓（数据本身正确，展示需要聚合）
  return aggregateHoldings(normalized);
}

export interface FilingRef {
  accession: string;
  filedAt: string | null;
  period: string | null;
}

/** 取最近 N 份 13F-HR（忽略 /A 修订件，按报告期去重，新→旧） */
export function recent13FFilings(submissions: SecSubmissions, limit: number): FilingRef[] {
  const recent = submissions.filings?.recent;
  if (!recent) return [];

  const seen = new Set<string>();
  const refs: FilingRef[] = [];
  (recent.form ?? []).forEach((form, index) => {
    if (form !== "13F-HR") return;
    const accession = recent.accessionNumber?.[index] ?? "";
    if (!accession) return;
    const period = recent.reportDate?.[index] || null;
    const dedupeKey = period ?? accession;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    refs.push({
      accession,
      filedAt: recent.filingDate?.[index] ?? null,
      period,
    });
  });

  return refs.slice(0, limit);
}

/** 拉取并解析某一次 13F 申报的 information table（已按 CUSIP 聚合、单位归一到美元） */
async function fetchQuarterHoldings(cik: string, accession: string): Promise<Holding13F[]> {
  const digits = accession.replace(/-/g, "");
  if (!digits) throw new Error("SEC 申报编号缺失");
  const cikNoZero = String(Number(cik));
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNoZero}/${digits}`;

  const indexResponse = await fetch(`${base}/index.json`, {
    headers: SEC_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!indexResponse.ok) throw new Error(`SEC 文件索引不可用（${indexResponse.status}）`);

  const folder = (await indexResponse.json()) as {
    directory?: { item?: Array<{ name?: string }> };
  };
  const files = (folder.directory?.item ?? [])
    .map((item) => item.name ?? "")
    .filter((name) => /\.xml$/i.test(name) && !/primary_doc\.xml$/i.test(name));

  if (files.length === 0) throw new Error("SEC 没有 information table");
  const tableFile = files.find((name) => /infotable/i.test(name)) ?? files[0];

  const tableResponse = await fetch(`${base}/${tableFile}`, {
    headers: SEC_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!tableResponse.ok) throw new Error(`SEC 持仓表不可用（${tableResponse.status}）`);

  const holdings = parseInformationTable(await tableResponse.text());
  if (holdings.length === 0) throw new Error("13F 持仓表为空");
  return holdings;
}

/** 获取某位投资者最近 4 份 13F 与最近 3 个季度的调仓（缓存 6 小时，SEC 建议低频访问） */
export async function get13F(
  investor: SuperInvestor,
): Promise<ThirteenFResult & { cached: boolean }> {
  const result = await cached(`13f:${investor.cik}`, 21600, 86400, async () => {
    const submissionsResponse = await fetch(
      `https://data.sec.gov/submissions/CIK${investor.cik}.json`,
      { headers: SEC_HEADERS, cache: "no-store", signal: AbortSignal.timeout(12_000) },
    );
    if (!submissionsResponse.ok) {
      throw new Error(`SEC 提交列表不可用（${submissionsResponse.status}）`);
    }

    const submissions = (await submissionsResponse.json()) as SecSubmissions;
    // 最近 4 个季度即可得到 3 次季度环比调仓
    const filings = recent13FFilings(submissions, 4);
    if (filings.length === 0) throw new Error("该机构最近没有 13F 持仓申报");

    const snapshots: QuarterSnapshot[] = [];
    for (let index = 0; index < filings.length; index += 1) {
      const filing = filings[index];
      try {
        const holdings = await fetchQuarterHoldings(investor.cik, filing.accession);
        snapshots.push({
          quarter: filing.period ?? filing.filedAt ?? filing.accession,
          filedAt: filing.filedAt,
          holdings,
          totalValue: holdings.reduce((sum, item) => sum + (item.value ?? 0), 0),
        });
      } catch (error) {
        // 最新季度必须成功；历史季度拉取失败时降级，至少保留已有对比
        if (index === 0) throw error;
      }
    }

    const latest = snapshots[0];
    const all = latest.holdings;
    const visible = all.slice(0, 200);
    const visibleKeys = new Set(visible.map((item) => `${item.cusip}|${item.putCall ?? ""}`));
    const quarters = buildQuarterChanges(snapshots);
    // 持仓表只展示前 200 条，调仓明细也只需覆盖这些标的，避免千只持仓的响应过大
    const latestChanges =
      snapshots.length > 1
        ? computePositionChanges(snapshots[0].holdings, snapshots[1].holdings).filter((item) =>
            visibleKeys.has(`${item.cusip}|${item.putCall ?? ""}`),
          )
        : [];

    return {
      investor,
      entityName: submissions.name ?? investor.fund,
      filedAt: latest.filedAt,
      period: latest.quarter,
      holdings: visible,
      totalPositions: all.length,
      totalValue: latest.totalValue,
      quarters,
      latestChanges,
      fetchedAt: new Date().toISOString(),
    };
  });

  return { ...result.value, cached: result.cached };
}
