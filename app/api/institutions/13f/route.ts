import { NextRequest } from "next/server";
import { SUPER_INVESTORS, findInvestor, get13F } from "@/lib/institutions";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 超级投资者的最新 13F：?investor=berkshire（不带参数时返回可选列表） */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("investor");

  if (!id) {
    return Response.json({ investors: SUPER_INVESTORS }, { headers: cacheHeaders(3600, 86400) });
  }

  const investor = findInvestor(id);
  if (!investor) {
    return jsonError("未知的投资者，可选值见 /api/institutions/13f", 400, "invalid_request");
  }

  try {
    const data = await get13F(investor);
    return Response.json(data, { headers: cacheHeaders(21600, 86400) });
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
