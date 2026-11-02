import { NextRequest } from "next/server";
import { getEarningsCalendar } from "@/lib/earnings";
import { cacheHeaders, errorStatus, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 财报日历：?date=YYYY-MM-DD（默认今天，美东） */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("date");
  const date =
    raw && DATE_RE.test(raw)
      ? raw
      : new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  if (raw && !DATE_RE.test(raw)) {
    return jsonError("日期格式应为 YYYY-MM-DD", 400, "invalid_request");
  }

  try {
    const data = await getEarningsCalendar(date);
    return Response.json(data, { headers: cacheHeaders(600, 3600) });
  } catch (error) {
    const { status, message, code } = errorStatus(error);
    return jsonError(message, status, code);
  }
}
