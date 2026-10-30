import { NextResponse } from "next/server";
import { loadIndices } from "@/lib/indices";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 全球指数概览（美股 + 亚太），一次请求拿全部指标 */
export async function GET() {
  try {
    const data = await loadIndices();
    return NextResponse.json(
      {
        indices: data.quotes,
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
