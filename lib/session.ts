import type { MarketSession } from "@/lib/types";

/** 时段中文名 */
export const SESSION_LABEL: Record<MarketSession, string> = {
  pre: "盘前",
  regular: "交易中",
  post: "盘后",
  overnight: "夜盘",
  closed: "已收盘",
};

export function sessionLabel(session: MarketSession | null | undefined): string {
  if (!session) return SESSION_LABEL.closed;
  return SESSION_LABEL[session] ?? SESSION_LABEL.closed;
}

/** 是否处于扩展交易时段（盘前 / 盘后 / 夜盘） */
export function isExtendedSession(session: MarketSession | null | undefined): boolean {
  return session === "pre" || session === "post" || session === "overnight";
}

/**
 * Yahoo `marketState` → 时段。
 * PREPRE 是开盘前的早期盘前，POSTPOST 是收盘后的夜盘（20:00–04:00 ET）。
 */
export function sessionFromYahooState(state: string | null | undefined): MarketSession {
  switch ((state ?? "").toUpperCase()) {
    case "PRE":
    case "PREPRE":
      return "pre";
    case "REGULAR":
      return "regular";
    case "POST":
      return "post";
    case "POSTPOST":
      return "overnight";
    case "CLOSED":
      return "closed";
    default:
      return "closed";
  }
}

/** Nasdaq `marketStatus`（"Pre-Market" / "Open" / "After-Hours" / "Closed"）→ 时段 */
export function sessionFromNasdaqStatus(status: string | null | undefined): MarketSession {
  const value = (status ?? "").toLowerCase();
  if (value.includes("pre")) return "pre";
  if (value.includes("after") || value.includes("post")) return "post";
  if (value.includes("open") || value.includes("trading")) return "regular";
  return "closed";
}
