import { NextRequest } from "next/server";
import { loadChart } from "@/lib/market";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";
import {
  INTERVAL_CONFIG,
  RANGE_CONFIG,
  RANGE_INTERVALS,
  defaultIntervalFor,
  isIntervalAllowed,
  isIntervalKey,
  isRangeKey,
  isValidSymbol,
  normalizeSymbol,
  type IntervalKey,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = normalizeSymbol(params.get("symbol") ?? "");
  const rangeParam = params.get("range") ?? "1M";
  const intervalParam = params.get("interval");

  if (!symbol || !isValidSymbol(symbol)) {
    return jsonError("请提供有效的股票代码，例如 ?symbol=AAPL", 400, "invalid_request");
  }
  if (!isRangeKey(rangeParam)) {
    return jsonError(
      "不支持的周期参数，可选值：" + Object.keys(RANGE_CONFIG).join(" / "),
      400,
      "invalid_request",
    );
  }

  const range = rangeParam.toUpperCase() as keyof typeof RANGE_CONFIG;

  let interval: IntervalKey;
  if (intervalParam === null || intervalParam === "") {
    interval = defaultIntervalFor(range);
  } else if (!isIntervalKey(intervalParam) || !isIntervalAllowed(range, intervalParam)) {
    return jsonError(
      `周期 ${range} 不支持该间隔，可选值：${RANGE_INTERVALS[range]
        .map((key) => `${key}（${INTERVAL_CONFIG[key].label}）`)
        .join(" / ")}`,
      400,
      "invalid_request",
    );
  } else {
    interval = intervalParam;
  }

  const intervalConfig = INTERVAL_CONFIG[interval];

  try {
    const data = await loadChart(symbol, range, interval);
    return Response.json(data, {
      headers: cacheHeaders(
        data.stale ? 5 : intervalConfig.freshSeconds,
        intervalConfig.staleSeconds,
      ),
    });
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}

