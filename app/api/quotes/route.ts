import { NextRequest, NextResponse } from "next/server";
import { loadQuotes } from "@/lib/market";
import { hasPerplexityKey, perplexityQuote } from "@/lib/perplexity";
import { cacheHeaders, errorStatus, jsonError, parseSymbols } from "@/lib/http";
import type { Quote, QuotesResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FALLBACK_SYMBOLS = 6;

/** Yahoo 完全不可用时，用 Perplexity 兜底（最多 6 个代码，并行请求） */
async function perplexityFallback(symbols: string[]) {
  const targets = symbols.slice(0, MAX_FALLBACK_SYMBOLS);
  const settled = await Promise.allSettled(targets.map((symbol) => perplexityQuote(symbol)));

  const quotes: Quote[] = [];
  const errors: { symbol: string; message: string }[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    } else {
      errors.push({
        symbol: targets[index],
        message:
          result.reason instanceof Error ? result.reason.message : "Perplexity 兜底报价失败",
      });
    }
  });

  return { quotes, errors };
}

export async function GET(request: NextRequest) {
  const symbols = parseSymbols(request.nextUrl.searchParams.get("symbols"));

  if (symbols.length === 0) {
    return jsonError("请提供至少一个有效的股票代码，例如 ?symbols=AAPL,MSFT", 400, "invalid_request");
  }

  try {
    const data = await loadQuotes(symbols);

    // 部分代码缺失（例如拼写错误 / 数据源漏数据）时不主动走 Perplexity，
    // 让前端展示具体错误即可，避免无谓的模型调用费用。
    const headers = {
      ...cacheHeaders(data.stale ? 5 : 15, 60),
      "X-Data-Source": data.provider,
    };
    return NextResponse.json<QuotesResponse>(
      {
        quotes: data.quotes,
        errors: data.errors,
        fetchedAt: data.fetchedAt,
        cached: data.cached,
        stale: data.stale,
        provider: data.provider,
      },
      { headers },
    );
  } catch (error) {
    const { status, message, code } = errorStatus(error);

    if (hasPerplexityKey()) {
      try {
        const fallback = await perplexityFallback(symbols);
        if (fallback.quotes.length > 0) {
          return NextResponse.json<QuotesResponse>(
            {
              quotes: fallback.quotes,
              errors: fallback.errors,
              fetchedAt: new Date().toISOString(),
              cached: false,
              stale: false,
              provider: "perplexity",
            },
            { headers: { ...cacheHeaders(10, 30), "X-Data-Source": "perplexity-fallback" } },
          );
        }
      } catch {
        // 兜底也失败，继续返回原始错误
      }
    }

    return jsonError(message, status, code);
  }
}
