"use client";

import type { MarketSession } from "@/lib/types";
import { sessionLabel } from "@/lib/session";
import { formatCompact, formatTimeInZone } from "@/lib/format";

interface SessionBadgeProps {
  session?: MarketSession | null;
  /** 该时段最新成交时间（ISO），detailed 时显示为美东时间 */
  marketTime?: string | null;
  /** 扩展时段成交量（Nasdaq 提供） */
  volume?: number | null;
  size?: "xs" | "sm";
  /** 显示时间与成交量 */
  detailed?: boolean;
  className?: string;
}

const SESSION_TONE: Record<MarketSession, { wrap: string; dot: string }> = {
  pre: {
    wrap: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  post: {
    wrap: "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  overnight: {
    wrap: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  regular: {
    wrap: "border-positive/35 bg-positive-soft text-positive-text",
    dot: "bg-positive live-dot",
  },
  closed: {
    wrap: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

/** 交易时段徽标：盘前 / 交易中 / 盘后 / 夜盘 / 已收盘 */
export default function SessionBadge({
  session,
  marketTime,
  volume,
  size = "sm",
  detailed = false,
  className = "",
}: SessionBadgeProps) {
  if (!session) return null;

  const tone = SESSION_TONE[session];
  const label = sessionLabel(session);
  const time = detailed && marketTime
    ? formatTimeInZone(marketTime, "America/New_York", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;
  const volumeLabel = detailed && volume ? formatCompact(volume) : null;

  const title = [
    label,
    time ? `美东 ${time}` : null,
    volumeLabel ? `成交量 ${volumeLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 leading-4 ${
        size === "xs" ? "text-[9.5px]" : "text-[10px]"
      } ${tone.wrap} ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      <span className="shrink-0">{label}</span>
      {time && <span className="num opacity-80">{time}</span>}
      {volumeLabel && <span className="num opacity-70">量 {volumeLabel}</span>}
    </span>
  );
}
