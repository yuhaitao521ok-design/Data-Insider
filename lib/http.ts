import { NextResponse } from "next/server";
import { isValidSymbol, normalizeSymbol, type ApiErrorBody } from "@/lib/types";

export function jsonError(message: string, status: number, code?: ApiErrorBody["code"]) {
  return NextResponse.json<ApiErrorBody>({ error: message, code }, { status });
}

/** 解析 ?symbols=AAPL,msft 并做基本校验 / 去重 */
export function parseSymbols(raw: string | null, max = 20): string[] {
  if (!raw) return [];
  const symbols = raw
    .split(",")
    .map(normalizeSymbol)
    .filter((symbol) => symbol.length > 0 && isValidSymbol(symbol));

  return Array.from(new Set(symbols)).slice(0, max);
}

export function cacheHeaders(freshSeconds: number, staleSeconds: number) {
  return {
    "Cache-Control": `public, s-maxage=${freshSeconds}, stale-while-revalidate=${staleSeconds}`,
  };
}

export function noStoreHeaders() {
  return { "Cache-Control": "no-store" };
}

export function errorStatus(error: unknown): { status: number; message: string; code?: ApiErrorBody["code"] } {
  const candidate = error as { status?: number; message?: string; code?: ApiErrorBody["code"] } | null;
  const status =
    typeof candidate?.status === "number" && candidate.status >= 400 && candidate.status <= 599
      ? candidate.status
      : 502;
  const message = candidate?.message || "服务器处理请求时发生错误";
  const code = candidate?.code;
  return { status, message, code };
}
