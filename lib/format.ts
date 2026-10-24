/** 数字与日期格式化工具，前后端共用。 */

export function formatPrice(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const digits = Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatSigned(
  value: number | null | undefined,
  options: { suffix?: string; digits?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const { suffix = "", digits = 2 } = options;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), digits)}${suffix}`;
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  return formatSigned(value, { suffix: "%", digits });
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/** 按交易所时区格式化时间，例如 16:00:00 EDT */
export function formatTimeInZone(
  iso: string | number | null | undefined,
  timeZone = "America/New_York",
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  if (iso === null || iso === undefined) return "--";
  const date = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  try {
    return new Intl.DateTimeFormat("zh-CN", { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat("zh-CN", options).format(date);
  }
}

/** 根据周期选择合适的横轴时间格式 */
export function formatAxisTime(timestamp: number, range: string, timeZone: string): string {
  const date = new Date(timestamp * 1000);
  const base: Intl.DateTimeFormatOptions =
    range === "1D"
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : range === "5D"
        ? { month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }
        : range === "MAX" || range === "5Y"
          ? { year: "numeric", month: "2-digit" }
          : { month: "2-digit", day: "2-digit" };

  try {
    return new Intl.DateTimeFormat("zh-CN", { timeZone, ...base }).format(date);
  } catch {
    return new Intl.DateTimeFormat("zh-CN", base).format(date);
  }
}

export function formatFullTime(timestamp: number, timeZone: string): string {
  const date = new Date(timestamp * 1000);
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
