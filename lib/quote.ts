/** 报价字段归一化：保证 price / previousClose / change / changePercent 口径一致。 */

const EASTERN_MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** 某个时刻「美东时间 - UTC」的偏移（毫秒，纽约为负） */
function easternOffsetMs(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/**
 * 解析 Nasdaq 的时间戳（美东时间，可能带「Closed at」前缀），例如：
 *   "Oct 28, 2026 9:33 AM ET"
 *   "Closed at Oct 27, 2026 4:00 PM ET"
 * 返回 ISO 字符串；无法解析时返回 null。
 */
export function parseEasternTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;

  const cleaned = value.replace(/^closed at\s+/i, "").trim();
  const match =
    /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(
      cleaned,
    );
  if (!match) return null;

  const month = EASTERN_MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;

  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const meridiem = match[7]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const guess = Date.UTC(Number(match[3]), month, Number(match[2]), hour, minute, second);
  // 先按猜测值求偏移，再用修正后的时刻复算一次，覆盖夏令时切换当天
  let utc = guess - easternOffsetMs(new Date(guess));
  utc = guess - easternOffsetMs(new Date(utc));

  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface ChangeInput {
  price: number | null;
  previousClose?: number | null;
  change?: number | null;
  changePercent?: number | null;
}

export interface ChangeResult {
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
}

/** 四舍五入到 4 位小数，避免 `price - change` 反推昨收时出现 531.3299999999999 这类浮点噪声 */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * 统一涨跌口径。
 *
 * 数据源经常只给出其中一两个字段（例如 Yahoo spark 只有 price + 昨收，
 * Nasdaq chart 只有上一个交易日的 previousClose），这里按下面的优先级补齐并**重算**：
 *
 *  1. 有 price 和昨收 → 直接算 change / changePercent（保证三者自洽）
 *  2. 只有 price + change → 反推昨收再算
 *  3. 只有 price + changePercent → 反推昨收再算
 *  4. 任何一项缺失 → 保留能拿到的原值，避免展示「涨跌幅和价差对不上」
 */
export function reconcileChange(input: ChangeInput): ChangeResult {
  const price = input.price;
  let previousClose = input.previousClose ?? null;

  if ((previousClose === null || previousClose <= 0) && price !== null && input.change != null) {
    previousClose = price - input.change;
  }
  if (
    (previousClose === null || previousClose <= 0) &&
    price !== null &&
    input.changePercent != null &&
    input.changePercent !== -100
  ) {
    previousClose = price / (1 + input.changePercent / 100);
  }

  if (price === null || previousClose === null || !Number.isFinite(previousClose) || previousClose <= 0) {
    return {
      previousClose: null,
      change: input.change ?? null,
      changePercent: input.changePercent ?? null,
    };
  }

  const roundedPreviousClose = round4(previousClose);
  const change = round4(price - roundedPreviousClose);
  return {
    previousClose: roundedPreviousClose,
    change,
    changePercent: round4((change / roundedPreviousClose) * 100),
  };
}
