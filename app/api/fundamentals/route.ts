import { NextRequest } from "next/server";
import { getFundamentals } from "@/lib/fundamentals";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";
import { isValidSymbol, normalizeSymbol } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const symbol = normalizeSymbol(request.nextUrl.searchParams.get("symbol") ?? "");

  if (!symbol || !isValidSymbol(symbol)) {
    return jsonError("请提供有效的股票代码，例如 ?symbol=AAPL", 400, "invalid_request");
  }

  try {
    const data = await getFundamentals(symbol);
    return Response.json(data, { headers: cacheHeaders(600, 3600) });
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
