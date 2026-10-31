import { INDEX_DEFINITIONS } from "@/lib/index-groups";
import { MARKET_PANELS } from "@/lib/market-panels";
import { DEFAULT_WATCHLIST, type SearchResult } from "@/lib/types";

/**
 * 本地搜索建议（纯前端）。
 *
 * `/api/search` 依赖 Yahoo，机房 IP 经常被限流；这里内置一份「常见标的」候选，
 * 输入时代码/名称/中文别名都能立刻命中，保证用户至少能看到公司是否存在，
 * 不会因为接口超时/失败而出现「什么都搜不到」。
 */

const NAMES: Record<string, string> = {
  AAPL: "Apple Inc. 苹果",
  MSFT: "Microsoft Corporation 微软",
  NVDA: "NVIDIA Corporation 英伟达",
  AMZN: "Amazon.com, Inc. 亚马逊",
  GOOGL: "Alphabet Inc. 谷歌",
  META: "Meta Platforms, Inc. 脸书",
  TSLA: "Tesla, Inc. 特斯拉",
  NFLX: "Netflix, Inc. 奈飞",
  AMD: "Advanced Micro Devices 超威半导体",
  AVGO: "Broadcom Inc. 博通",
  JPM: "JPMorgan Chase & Co. 摩根大通",
  TSM: "Taiwan Semiconductor 台积电",
  BABA: "Alibaba Group 阿里巴巴",
  PDD: "PDD Holdings 拼多多",
  JD: "JD.com 京东",
  NIO: "NIO Inc. 蔚来",
  SPY: "SPDR S&P 500 ETF Trust 标普500",
  QQQ: "Invesco QQQ Trust 纳斯达克100",
  DIA: "SPDR Dow Jones ETF 道琼斯",
  IWM: "iShares Russell 2000 ETF 罗素2000",
  VOO: "Vanguard S&P 500 ETF",
};

const ETF_SYMBOLS = new Set(["SPY", "QQQ", "DIA", "IWM", "VOO", "XLK", "XLC", "XLY", "XLP", "XLF", "XLV", "XLI", "XLE", "XLB", "XLU", "XLRE"]);

function buildCandidates(): SearchResult[] {
  const candidates = new Map<string, SearchResult>();

  const add = (symbol: string, name: string, exchange = "US", type = "EQUITY") => {
    if (!symbol || candidates.has(symbol.toUpperCase())) return;
    candidates.set(symbol.toUpperCase(), {
      symbol: symbol.toUpperCase(),
      name,
      exchange,
      type: type ?? "EQUITY",
    });
  };

  for (const symbol of DEFAULT_WATCHLIST) {
    add(symbol, NAMES[symbol] ?? symbol, ETF_SYMBOLS.has(symbol) ? "NYSE Arca" : "NASDAQ", ETF_SYMBOLS.has(symbol) ? "ETF" : "EQUITY");
  }
  for (const symbol of Object.keys(NAMES)) {
    add(symbol, NAMES[symbol], ETF_SYMBOLS.has(symbol) ? "NYSE Arca" : "NASDAQ", ETF_SYMBOLS.has(symbol) ? "ETF" : "EQUITY");
  }
  for (const item of INDEX_DEFINITIONS) {
    add(item.symbol, `${item.label} ${item.short}`, "INDEX", "INDEX");
  }
  for (const item of MARKET_PANELS) {
    add(item.symbol, `${item.label} ${item.short}`, item.kind === "sector" ? "NYSE Arca" : "MARKET", item.kind === "sector" ? "ETF" : "INDEX");
  }

  return [...candidates.values()];
}

const CANDIDATES = buildCandidates();

/** 本地匹配：代码完全匹配 > 代码前缀 > 代码包含 > 名称包含（含中文） */
export function matchLocalSuggestions(query: string, limit = 6): SearchResult[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];
  const upper = keyword.toUpperCase();

  const scored = CANDIDATES.map((candidate) => {
    const symbol = candidate.symbol.toUpperCase();
    const name = candidate.name.toLowerCase();

    let score = -1;
    if (symbol === upper) score = 100;
    else if (symbol.startsWith(upper)) score = 80 - Math.min(symbol.length, 40);
    else if (symbol.includes(upper)) score = 40;
    else if (name.includes(keyword)) score = 30;

    return { candidate, score };
  })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.candidate);
}

/** 合并接口结果与本地结果（按代码去重，接口结果优先） */
export function mergeSuggestions(
  apiResults: SearchResult[],
  localResults: SearchResult[],
  limit = 6,
): SearchResult[] {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const item of [...apiResults, ...localResults]) {
    const key = item.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
}
