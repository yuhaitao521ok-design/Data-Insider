import { NextRequest } from "next/server";
import { loadChart } from "@/lib/market";
import { cached } from "@/lib/cache";
import { hasPerplexityKey, perplexityInsight } from "@/lib/perplexity";
import { errorStatus, jsonError } from "@/lib/http";
import { RANGE_CONFIG, isRangeKey, isValidSymbol, normalizeSymbol } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POINTS_FOR_EXTREMES = 2000;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = normalizeSymbol(params.get("symbol") ?? "");
  const rangeParam = params.get("range") ?? "1M";

  if (!symbol || !isValidSymbol(symbol)) {
    return jsonError("请提供有效的股票代码，例如 ?symbol=AAPL", 400, "invalid_request");
  }
  if (!isRangeKey(rangeParam)) {
    return jsonError("不支持的周期参数", 400, "invalid_request");
  }

  if (!hasPerplexityKey()) {
    return jsonError(
      "未配置 PERPLEXITY_API_KEY，AI 解读不可用。请在环境变量中配置后重启服务。",
      501,
      "missing_perplexity_key",
    );
  }

  const range = rangeParam.toUpperCase() as keyof typeof RANGE_CONFIG;

  try {
    const chart = await loadChart(symbol, range);
    const points = chart.points.slice(-MAX_POINTS_FOR_EXTREMES);
    const first = points[0];
    const last = points[points.length - 1];
    const highs = points.map((point) => point.high ?? point.close);
    const lows = points.map((point) => point.low ?? point.close);

    const context = {
      symbol: chart.symbol,
      name: chart.name,
      range,
      rangeLabel: RANGE_CONFIG[range].label,
      currency: chart.currency,
      price: chart.meta.price,
      changePercent: chart.meta.changePercent,
      periodChangePercent:
        first && last && first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : null,
      periodHigh: Math.max(...highs),
      periodLow: Math.min(...lows),
      week52High: chart.meta.week52High,
      week52Low: chart.meta.week52Low,
      volume: chart.meta.volume,
    };

    const result = await cached(
      `insight:${symbol}:${range}`,
      600,
      3600,
      () => perplexityInsight(context),
    );

    return Response.json(
      { ...result.value, cached: result.cached },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
