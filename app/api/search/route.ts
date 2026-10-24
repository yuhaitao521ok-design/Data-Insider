import { NextRequest } from "next/server";
import { searchSymbols } from "@/lib/yahoo";
import { DEFAULT_WATCHLIST } from "@/lib/types";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POPULAR: Record<string, { name: string; exchange: string; type: string }> = {
  AAPL: { name: "Apple Inc.", exchange: "NASDAQ", type: "EQUITY" },
  MSFT: { name: "Microsoft Corporation", exchange: "NASDAQ", type: "EQUITY" },
  NVDA: { name: "NVIDIA Corporation", exchange: "NASDAQ", type: "EQUITY" },
  AMZN: { name: "Amazon.com, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  GOOGL: { name: "Alphabet Inc.", exchange: "NASDAQ", type: "EQUITY" },
  META: { name: "Meta Platforms, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  TSLA: { name: "Tesla, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  SPY: { name: "SPDR S&P 500 ETF Trust", exchange: "NYSE Arca", type: "ETF" },
  QQQ: { name: "Invesco QQQ Trust", exchange: "NASDAQ", type: "ETF" },
  DIA: { name: "SPDR Dow Jones Industrial Average ETF", exchange: "NYSE Arca", type: "ETF" },
  IWM: { name: "iShares Russell 2000 ETF", exchange: "NYSE Arca", type: "ETF" },
  VOO: { name: "Vanguard S&P 500 ETF", exchange: "NYSE Arca", type: "ETF" },
  NFLX: { name: "Netflix, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  AMD: { name: "Advanced Micro Devices, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  AVGO: { name: "Broadcom Inc.", exchange: "NASDAQ", type: "EQUITY" },
  JPM: { name: "JPMorgan Chase & Co.", exchange: "NYSE", type: "EQUITY" },
  BRK_B: { name: "Berkshire Hathaway Inc.", exchange: "NYSE", type: "EQUITY" },
  TSM: { name: "Taiwan Semiconductor Manufacturing", exchange: "NYSE", type: "EQUITY" },
  BABA: { name: "Alibaba Group Holding", exchange: "NYSE", type: "EQUITY" },
  PDD: { name: "PDD Holdings Inc.", exchange: "NASDAQ", type: "EQUITY" },
  JD: { name: "JD.com, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  NIO: { name: "NIO Inc.", exchange: "NYSE", type: "EQUITY" },
};

/** 中文 / 常见别名，Yahoo 搜索不可用时也能用中文查询热门标的 */
const ALIASES: Record<string, string[]> = {
  AAPL: ["苹果", "apple"],
  MSFT: ["微软", "microsoft"],
  NVDA: ["英伟达", "辉达", "nvidia"],
  AMZN: ["亚马逊", "amazon"],
  GOOGL: ["谷歌", "谷歌a", "alphabet", "google"],
  META: ["脸书", "facebook", "meta"],
  TSLA: ["特斯拉", "tesla"],
  NFLX: ["奈飞", "网飞", "netflix"],
  AMD: ["超威", "超微半导体"],
  AVGO: ["博通", "broadcom"],
  JPM: ["摩根大通", "jpmorgan"],
  TSM: ["台积电", "tsmc"],
  BABA: ["阿里巴巴", "阿里", "alibaba"],
  PDD: ["拼多多"],
  JD: ["京东"],
  NIO: ["蔚来"],
  SPY: ["标普500", "sp500"],
  QQQ: ["纳斯达克100", "纳指"],
  VOO: ["先锋标普"],
};

function localSearch(query: string) {
  const upper = query.trim().toUpperCase();
  const lower = query.trim().toLowerCase();
  return Object.entries(POPULAR)
    .filter(([symbol, info]) => {
      if (!upper) return false;
      if (symbol.replace("_", "").includes(upper.replace("_", ""))) return true;
      if (info.name.toLowerCase().includes(lower)) return true;
      return (ALIASES[symbol] ?? []).some((alias) => alias.includes(lower));
    })
    .map(([symbol, info]) => ({ symbol, ...info }));
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (!query) {
    return jsonError("请提供搜索关键词，例如 ?q=apple", 400, "invalid_request");
  }

  try {
    const results = await searchSymbols(query);
    if (results.length > 0) {
      return Response.json({ results }, { headers: cacheHeaders(30, 300) });
    }
    return Response.json({ results: localSearch(query) }, { headers: cacheHeaders(30, 300) });
  } catch {
    // Yahoo 搜索不可用时退回内置热门列表
    return Response.json(
      { results: localSearch(query), degraded: true },
      { headers: cacheHeaders(10, 60) },
    );
  }
}
