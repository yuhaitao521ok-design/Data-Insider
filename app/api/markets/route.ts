import { NextResponse } from "next/server";
import { loadMarketPanels } from "@/lib/markets";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 右栏市场全景：板块热力图 + 跨资产 */
export async function GET() {
  try {
    const data = await loadMarketPanels();
    return NextResponse.json(
      {
        sectors: data.sectors,
        crossAssets: data.crossAssets,
        errors: data.errors,
        provider: data.provider,
        fetchedAt: data.fetchedAt,
        cached: data.cached,
        stale: data.stale,
      },
      { headers: { ...cacheHeaders(30, 120), "X-Data-Source": data.provider } },
    );
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
