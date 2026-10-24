"use client";

import { useState } from "react";
import type { InsightResponse, RangeKey } from "@/lib/types";
import { formatTimeInZone } from "@/lib/format";

interface InsightPanelProps {
  symbol: string;
  range: RangeKey;
  enabled: boolean;
  onRequest: () => Promise<void>;
  data: (InsightResponse & { cached?: boolean }) | null;
  loading: boolean;
  error: string | null;
}

const SENTIMENT: Record<
  InsightResponse["sentiment"],
  { label: string; className: string; dot: string }
> = {
  bullish: { label: "偏多", className: "text-up bg-up/10 border-up/30", dot: "bg-up" },
  bearish: { label: "偏空", className: "text-down bg-down/10 border-down/30", dot: "bg-down" },
  neutral: { label: "中性", className: "text-muted bg-white/5 border-line", dot: "bg-muted" },
};

export default function InsightPanel({
  symbol,
  range,
  enabled,
  onRequest,
  data,
  loading,
  error,
}: InsightPanelProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="panel rounded-2xl p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-purple-500/20 text-accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2v3m0 14v3M2 12h3m14 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          <div>
            <h2 className="text-sm font-semibold">AI 解读</h2>
            <p className="text-[11px] text-muted">
              {symbol} · 由 Perplexity 联网检索生成，仅供参考
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {data && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] ${SENTIMENT[data.sentiment].className}`}
            >
              <span
                className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${SENTIMENT[data.sentiment].dot}`}
              />
              {SENTIMENT[data.sentiment].label}
            </span>
          )}
          {enabled && (
            <button
              type="button"
              onClick={() => void onRequest()}
              disabled={loading}
              className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "生成中…" : data ? "重新生成" : "生成解读"}
            </button>
          )}
          {data && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded-lg border border-line px-2 py-1.5 text-[11px] text-muted transition hover:text-ink"
              aria-label={expanded ? "收起" : "展开"}
            >
              {expanded ? "收起" : "展开"}
            </button>
          )}
        </div>
      </header>

      {!enabled && (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-white/[0.02] p-3 text-xs leading-relaxed text-muted">
          未检测到{" "}
          <code className="rounded bg-white/5 px-1 py-0.5 text-[11px] text-ink/80">
            PERPLEXITY_API_KEY
          </code>
          ，AI 解读已关闭。在项目根目录创建{" "}
          <code className="rounded bg-white/5 px-1 py-0.5 text-[11px] text-ink/80">.env.local</code>
          ，填入密钥后重启即可启用（行情数据不受影响）。
        </p>
      )}

      {enabled && error && (
        <p className="mt-4 rounded-xl border border-down/30 bg-down/5 p-3 text-xs leading-relaxed text-down/90">
          {error}
        </p>
      )}

      {enabled && loading && !data && (
        <div className="mt-4 space-y-2">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-[92%] rounded" />
          <div className="skeleton h-3 w-[70%] rounded" />
        </div>
      )}

      {enabled && !loading && !data && !error && (
        <p className="mt-4 text-xs leading-relaxed text-muted">
          点击「生成解读」，让 Perplexity 结合最新新闻分析 {symbol} 当前 {range}{" "}
          周期的价格表现、关键观察与潜在风险。每次生成约需 5–15 秒。
        </p>
      )}

      {data && expanded && (
        <div className="mt-4 space-y-3 rise">
          <p className="text-[13px] leading-6 text-ink/90">{data.summary}</p>

          {data.bullets.length > 0 && (
            <ul className="space-y-1.5">
              {data.bullets.map((bullet, index) => (
                <li key={index} className="flex gap-2 text-xs leading-5 text-ink/80">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          {data.risks.length > 0 && (
            <div className="rounded-xl border border-down/20 bg-down/[0.04] p-3">
              <p className="mb-1 text-[11px] font-medium text-down/90">风险提示</p>
              <ul className="space-y-1">
                {data.risks.map((risk, index) => (
                  <li key={index} className="text-[11px] leading-5 text-ink/70">
                    · {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.citations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {data.citations.map((citation) => (
                <a
                  key={citation.url}
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="max-w-[220px] truncate rounded-md border border-line bg-white/[0.02] px-2 py-1 text-[10px] text-muted transition hover:border-accent/40 hover:text-accent"
                >
                  ↗ {citation.title}
                </a>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted/70">
            {data.model} · 生成于{" "}
            {formatTimeInZone(data.generatedAt, "Asia/Shanghai", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {data.cached ? " · 缓存结果" : ""} · AI 内容可能存在错误，不构成投资建议
          </p>
        </div>
      )}

    </section>
  );
}
