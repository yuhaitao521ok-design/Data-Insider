import { NextRequest } from "next/server";
import { findInvestor, get13FReturnSeries } from "@/lib/institutions";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 单个名人的 13F 反推季度收益序列：/api/institutions/correlation?investor=berkshire&quarters=8 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("investor");
  if (!id) {
    return jsonError("缺少 investor 参数", 400, "invalid_request");
  }

  const investor = findInvestor(id);
  if (!investor) {
    return jsonError("未知的投资者，可选值见 /api/institutions/13f", 400, "invalid_request");
  }

  const rawQuarters = Number(request.nextUrl.searchParams.get("quarters") ?? 8);
  const quarters = Number.isFinite(rawQuarters)
    ? Math.min(12, Math.max(4, Math.round(rawQuarters)))
    : 8;

  try {
    const data = await get13FReturnSeries(investor, quarters);
    return Response.json(data, { headers: cacheHeaders(21600, 86400) });
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
