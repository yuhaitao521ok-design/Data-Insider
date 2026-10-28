import type { ChartPoint, ChartResponse } from "@/lib/types";

/** 把图表数据转成 CSV（同时包含 UTC 与交易所当地时间，方便 Excel / Python 分析） */
export function chartToCsv(chart: ChartResponse): string {
  const localTime = (point: ChartPoint) => {
    const date = new Date(point.t * 1000);
    try {
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: chart.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return date.toISOString();
    }
  };

  const header = [
    "symbol",
    "range",
    "interval",
    "time_exchange",
    "time_utc",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "currency",
  ];

  const rows = chart.points.map((point) => [
    chart.symbol,
    chart.range,
    chart.interval,
    localTime(point),
    new Date(point.t * 1000).toISOString(),
    point.open ?? "",
    point.high ?? "",
    point.low ?? "",
    point.close,
    point.volume ?? "",
    chart.currency,
  ]);

  return [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
}

function escapeCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
