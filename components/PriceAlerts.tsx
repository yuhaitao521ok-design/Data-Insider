"use client";

import { useEffect, useRef, useState } from "react";
import { describeAlert, type AlertDirection, type PriceAlert } from "@/lib/alerts";
import { formatPrice, formatTimeInZone } from "@/lib/format";

interface PriceAlertsProps {
  symbol: string;
  currency: string;
  currentPrice: number | null;
  /** 全部提醒（组件内只展示当前标的的） */
  alerts: PriceAlert[];
  notificationState: NotificationPermission | "unsupported";
  onCreate: (direction: AlertDirection, price: number) => void;
  onRemove: (id: string) => void;
  onReenable: (id: string) => void;
  onRequestPermission: () => void;
}

/** 价格提醒入口：图表工具栏的铃铛 + 弹层（新增 / 查看 / 删除 / 重新启用） */
export default function PriceAlerts({
  symbol,
  currency,
  currentPrice,
  alerts,
  notificationState,
  onCreate,
  onRemove,
  onReenable,
  onRequestPermission,
}: PriceAlertsProps) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const symbolAlerts = alerts.filter((alert) => alert.symbol === symbol);
  const activeCount = alerts.filter((alert) => !alert.triggeredAt).length;

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // 打开弹层时用现价做默认值，减少手输
  useEffect(() => {
    if (!open || draft) return;
    if (currentPrice && Number.isFinite(currentPrice)) setDraft(currentPrice.toFixed(2));
  }, [open, currentPrice, draft]);

  function submit() {
    const price = Number.parseFloat(draft);
    if (!Number.isFinite(price) || price <= 0) {
      setError("请输入有效的目标价");
      return;
    }
    setError(null);
    onCreate(direction, price);
    setDraft("");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-7 items-center gap-1 rounded-lg border bg-card px-2 text-[11px] transition-colors hover:bg-muted hover:text-foreground ${
          activeCount > 0 ? "border-accent/40 text-foreground" : "border-border text-muted-foreground"
        }`}
        title="价格提醒"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 4a5 5 0 0 0-5 5v3.5L5.5 16h13L17 12.5V9a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        提醒
        {activeCount > 0 && (
          <span className="num rounded-full bg-accent-soft px-1 text-[10px] leading-4 text-accent">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${symbol} 价格提醒`}
          className="absolute right-0 top-full z-50 mt-1.5 w-[290px] rounded-lg border border-border bg-popover p-2.5 shadow-[var(--shadow-pop)] rise"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium">{symbol} 价格提醒</span>
            <span className="text-[10px] text-muted-foreground">仅本地保存</span>
          </div>

          <div className="flex items-center gap-1">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {([
                { key: "above", label: "涨到" },
                { key: "below", label: "跌破" },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setDirection(item.key)}
                  aria-pressed={direction === item.key}
                  className={`h-6 rounded-md px-1.5 text-[11px] transition-colors ${
                    direction === item.key
                      ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              inputMode="decimal"
              placeholder="目标价"
              aria-label="目标价"
              className="num h-7 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-[11px] outline-none focus:border-accent/60"
            />

            <button
              type="button"
              onClick={submit}
              className="h-7 rounded-md bg-foreground px-2 text-[11px] font-medium text-background transition-opacity hover:opacity-90"
            >
              添加
            </button>
          </div>

          {error && <p className="mt-1 text-[10.5px] text-negative-text">{error}</p>}

          {notificationState === "default" && (
            <button
              type="button"
              onClick={onRequestPermission}
              className="mt-2 w-full rounded-md border border-border px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              开启浏览器通知（页面在后台时也能收到）
            </button>
          )}
          {notificationState === "denied" && (
            <p className="mt-2 text-[10.5px] text-muted-foreground">
              浏览器通知已被拒绝，触发时仍会显示页面提示。
            </p>
          )}

          <div className="scroll-thin mt-2 max-h-[190px] space-y-1 overflow-y-auto">
            {symbolAlerts.length === 0 ? (
              <p className="rounded-md bg-muted px-2 py-2 text-[10.5px] leading-4 text-muted-foreground">
                还没有提醒。设定目标价后，价格穿越时会弹出提示（可配合浏览器通知）。
              </p>
            ) : (
              symbolAlerts.map((alert) => {
                const triggered = Boolean(alert.triggeredAt);
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        triggered ? "bg-muted-foreground/40" : "bg-accent"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="num truncate text-[11px] text-foreground/85">
                        {describeAlert(alert, (value) => formatPrice(value, currency))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {triggered && alert.triggeredAt
                          ? `已触发 · 现价 ${formatPrice(alert.triggeredPrice, currency)} · ${formatTimeInZone(
                              alert.triggeredAt,
                              "Asia/Shanghai",
                              { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
                            )}`
                          : "生效中"}
                      </p>
                    </div>
                    {triggered && (
                      <button
                        type="button"
                        onClick={() => onReenable(alert.id)}
                        className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="重新启用"
                      >
                        重开
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(alert.id)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[12px] leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-negative-text"
                      title="删除提醒"
                      aria-label="删除提醒"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
