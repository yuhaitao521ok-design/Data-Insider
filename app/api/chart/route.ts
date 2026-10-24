import { NextRequest } from "next/server";
import { loadChart } from "@/lib/market";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";
import { RANGE_CONFIG, isRangeKey, isValidSymbol, normalizeSymbol } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = normalizeSymbol(params.get("symbol") ?? "");
  const rangeParam = params.get("range") ?? "1M";

  if (!symbol || !isValidSymbol(symbol)) {
    return jsonError("请提供有效的股票代码，例如 ?symbol=AAPL", 400, "invalid_request");
  }
  if (!isRangeKey(rangeParam)) {
    return jsonError("不支持的周期参数，可选值：" + Object.keys(RANGE_CONFIG).join(" / "), 400, "invalid_request");
  }

  const range = rangeParam.toUpperCase() as keyof typeof RANGE_CONFIG;
  const config = RANGE_CONFIG[range];

  try {
    const data = await loadChart(symbol, range);
    return Response.json(data, {
      headers: cacheHeaders(data.stale ? 5 : config.freshSeconds, config.staleSeconds),
    });
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
