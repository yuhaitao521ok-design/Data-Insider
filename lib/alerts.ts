/**
 * 价格提醒（纯前端，localStorage 持久化）。
 *
 * 语义：`above` 表示价格涨到目标价之上触发，`below` 表示跌破目标价触发；
 * 每条提醒只触发一次，触发后可在面板里「重新启用」。
 */

export const ALERTS_KEY = "data-insider:alerts:v1";
export const MAX_ALERTS = 30;

export type AlertDirection = "above" | "below";

export interface PriceAlert {
  id: string;
  symbol: string;
  direction: AlertDirection;
  /** 目标价 */
  price: number;
  createdAt: string;
  /** 触发时间（ISO），未触发为 null */
  triggeredAt: string | null;
  /** 触发时的现价 */
  triggeredPrice: number | null;
}

export function isAlertDirection(value: unknown): value is AlertDirection {
  return value === "above" || value === "below";
}

function isSymbol(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9.^=-]{1,12}$/.test(value);
}

export function createAlert(
  symbol: string,
  direction: AlertDirection,
  price: number,
  now = new Date(),
): PriceAlert {
  return {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: symbol.toUpperCase(),
    direction,
    price,
    createdAt: now.toISOString(),
    triggeredAt: null,
    triggeredPrice: null,
  };
}

/** 从 localStorage 读到的任意值里挑出合法提醒（容错，不抛异常） */
export function sanitizeAlerts(raw: unknown): PriceAlert[] {
  if (!Array.isArray(raw)) return [];

  const alerts: PriceAlert[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (!isSymbol(candidate.symbol)) continue;
    if (!isAlertDirection(candidate.direction)) continue;
    if (typeof candidate.price !== "number" || !Number.isFinite(candidate.price)) continue;
    if (candidate.price <= 0) continue;

    const triggeredAt = typeof candidate.triggeredAt === "string" ? candidate.triggeredAt : null;
    alerts.push({
      id:
        typeof candidate.id === "string" && candidate.id.length > 0
          ? candidate.id
          : `${alerts.length}-${candidate.symbol}-${candidate.price}`,
      symbol: candidate.symbol,
      direction: candidate.direction,
      price: candidate.price,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
      triggeredAt,
      triggeredPrice:
        typeof candidate.triggeredPrice === "number" && Number.isFinite(candidate.triggeredPrice)
          ? candidate.triggeredPrice
          : null,
    });
    if (alerts.length >= MAX_ALERTS) break;
  }

  return alerts;
}

/** 当前价格是否满足提醒条件 */
export function isAlertCrossed(alert: PriceAlert, price: number | null | undefined): boolean {
  if (price === null || price === undefined || !Number.isFinite(price)) return false;
  return alert.direction === "above" ? price >= alert.price : price <= alert.price;
}

export interface AlertEvaluation {
  /** 本次新触发（需要弹出 toast / 系统通知）的提醒 */
  fired: PriceAlert[];
  /** 每条提醒上一次观察到的满足状态，用于识别「从不满足到满足」的穿越 */
  seen: Record<string, boolean>;
}

/**
 * 逐条比较「上一次观察到的状态」与当前状态：
 * - 第一次观察只记录状态，不触发（避免刚打开页面就误报）
 * - 只有从未满足 → 满足的瞬间才触发，且同一条提醒只触发一次
 */
export function evaluateAlerts(
  alerts: PriceAlert[],
  prices: Record<string, number | undefined>,
  seen: Record<string, boolean>,
): AlertEvaluation {
  const nextSeen: Record<string, boolean> = {};
  const fired: PriceAlert[] = [];

  for (const alert of alerts) {
    const price = prices[alert.symbol];
    if (price === undefined || !Number.isFinite(price)) continue;

    const crossed = isAlertCrossed(alert, price);
    const previous = seen[alert.id];
    nextSeen[alert.id] = crossed;

    if (alert.triggeredAt) continue;
    if (previous === undefined) continue; // 第一次观察：只记录，不触发
    if (previous === false && crossed) fired.push(alert);
  }

  return { fired, seen: nextSeen };
}

/** 提醒文案，例如「AAPL 涨到 $350.00 以上」 */
export function describeAlert(alert: PriceAlert, format: (value: number) => string): string {
  const target = format(alert.price);
  return alert.direction === "above" ? `${alert.symbol} 涨到 ${target} 以上` : `${alert.symbol} 跌破 ${target}`;
}
