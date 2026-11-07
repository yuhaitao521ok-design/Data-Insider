import { NextRequest } from "next/server";
import { loadChart } from "@/lib/market";
import { cached } from "@/lib/cache";
import { hasInsightLlm, insightModel, insightProvider, llmInsight } from "@/lib/ai";
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

  if (!hasInsightLlm()) {
    return jsonError(
      "未配置 AI 服务密钥，AI 解读不可用。请在环境变量中配置 LLM_API_KEY（或对应 provider 的密钥）后重启服务。",
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

    // 缓存 key 带上 provider/model，切换模型后不会命中旧缓存
    const cacheKey = `insight:${symbol}:${range}:${insightProvider()}:${insightModel()}`;
    const result = await cached(cacheKey, 600, 3600, () => llmInsight(context));

    return Response.json(
      { ...result.value, cached: result.cached },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
