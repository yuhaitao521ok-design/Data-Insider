import { NextRequest, NextResponse } from "next/server";
import { loadChart } from "@/lib/market";
import { cacheHeaders, errorStatus, jsonError, parseSymbols } from "@/lib/http";
import { isRangeKey, type RangeKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 批量日线（量化研究 / 相关性用）：?symbols=AAPL,MSFT&range=1Y */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbols = parseSymbols(params.get("symbols"), 16);
  const rangeParam = (params.get("range") ?? "1Y").toUpperCase();

  if (symbols.length === 0) {
    return jsonError("请提供至少一个股票代码，例如 ?symbols=AAPL,MSFT", 400, "invalid_request");
  }
  if (!isRangeKey(rangeParam)) {
    return jsonError("不支持的周期参数", 400, "invalid_request");
  }

  const range = rangeParam as RangeKey;

  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const data = await loadChart(symbol, range, "1d");
      return {
        symbol,
        points: data.points.map((point) => ({ t: point.t, close: point.close })),
      };
    }),
  );

  const series = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
  const errors = settled.flatMap((item, index) =>
    item.status === "rejected"
      ? [
          {
            symbol: symbols[index],
            message: item.reason instanceof Error ? item.reason.message : "加载失败",
          },
        ]
      : [],
  );

  if (series.length === 0) {
    const { status, message, code } = errorStatus(errors[0] ?? new Error("加载失败"));
    return jsonError(message, status, code);
  }

  return NextResponse.json({ range, series, errors }, { headers: cacheHeaders(120, 600) });
}
