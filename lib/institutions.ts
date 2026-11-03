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
  { id: "duanyongping", name: "Duanyongping", nameZh: "段永平", cik: "0001759760", fund: "Duanyongping" },
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

interface SecSubmissions {
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
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
  /** 市值（美元） */
  value: number | null;
}

export interface ThirteenFResult {
  investor: SuperInvestor;
  /** 报告期（YYYY-MM-DD，来自 13F 提交） */
  filedAt: string | null;
  holdings: Holding13F[];
  totalValue: number;
  fetchedAt: string;
}

/** 解析 13F information table XML（兼容带命名空间前缀的 ns1: 形式） */
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
      issuer: issuer.replace(/\s+/g, " "),
      titleOfClass: pick(block, "titleOfClass"),
      cusip: pick(block, "cusip"),
      shares,
      value,
    });
  }

  return holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 200);
}

/** 获取某位投资者的最新 13F（缓存 6 小时，SEC 建议低频访问） */
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
    const recent = submissions.filings?.recent;
    const index = (recent?.form ?? []).findIndex((form) => form?.startsWith("13F-HR"));
    if (index < 0) throw new Error("该机构最近没有 13F 持仓申报");

    const accession = recent?.accessionNumber?.[index] ?? "";
    const digits = accession.replace(/-/g, "");
    const filedAt = recent?.filingDate?.[index] ?? null;
    if (!digits) throw new Error("SEC 申报编号缺失");

    const cikNoZero = String(Number(investor.cik));
    const indexResponse = await fetch(
      `https://www.sec.gov/Archives/edgar/data/${cikNoZero}/${digits}/index.json`,
      { headers: SEC_HEADERS, cache: "no-store", signal: AbortSignal.timeout(12_000) },
    );
    if (!indexResponse.ok) throw new Error(`SEC 文件索引不可用（${indexResponse.status}）`);

    const folder = (await indexResponse.json()) as {
      directory?: { item?: Array<{ name?: string }> };
    };
    const files = (folder.directory?.item ?? [])
      .map((item) => item.name ?? "")
      .filter((name) => /\.xml$/i.test(name) && !/primary_doc\.xml$/i.test(name));

    if (files.length === 0) throw new Error("SEC 没有 information table");

    const tableResponse = await fetch(
      `https://www.sec.gov/Archives/edgar/data/${cikNoZero}/${digits}/${files[0]}`,
      { headers: SEC_HEADERS, cache: "no-store", signal: AbortSignal.timeout(15_000) },
    );
    if (!tableResponse.ok) throw new Error(`SEC 持仓表不可用（${tableResponse.status}）`);

    const holdings = parseInformationTable(await tableResponse.text());
    if (holdings.length === 0) throw new Error("13F 持仓表为空");

    const totalValue = holdings.reduce((sum, item) => sum + (item.value ?? 0), 0);

    return {
      investor,
      filedAt,
      holdings,
      totalValue,
      fetchedAt: new Date().toISOString(),
    };
  });

  return { ...result.value, cached: result.cached };
}
