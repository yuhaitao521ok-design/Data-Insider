import { INDEX_DEFINITION_MAP } from "@/lib/index-groups";
import { reconcileChange } from "@/lib/quote";
import type { Quote } from "@/lib/types";

/**
 * 新浪财经的指数 / ETF 快照（GBK 文本，无需 Key），作为 Yahoo / Nasdaq 都不可用时的兜底。
 *
 * 支持两种代码：
 *  - `gb_spy` 这类美股（ETF）代码：字段为 名称, 现价, 涨跌幅, 时间, 涨跌额, 开, 高, 低, …
 *  - `int_hangseng` / `sh000001` 这类指数代码：全球指数为 名称, 现价, 涨跌额, 涨跌幅；
 *    A 股指数为 名称, 今开, 昨收, 现价, 最高, 最低, …
 *
 * Sina 没有迷你走势，也没有 KOSPI / STI，因此只在降级时使用。
 */

const ENDPOINT = "https://hq.sinajs.cn/list=";

/** 我们内部的代码 → Sina 代码（Sina 能覆盖的部分） */
export const SINA_CODES: Record<string, string> = {
  SPY: "gb_spy",
  QQQ: "gb_qqq",
  DIA: "gb_dia",
  IWM: "gb_iwm",
  "^HSI": "int_hangseng",
  "000001.SS": "sh000001",
  "000300.SS": "sh000300",
  // 注意：Sina 的 int_nikkei 长期停在旧值（与 Yahoo 的 ^N225 相差 ~30%），
  // 为避免展示错误点位，日经只走 Yahoo，不用 Sina 兜底。
};

const CODE_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SINA_CODES).map(([symbol, code]) => [code, symbol]),
);

function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    // Cloudflare Workers 等环境不一定支持 gbk；数值字段都是 ASCII，用 latin1 也能解析
    return new TextDecoder("latin1").decode(buffer);
  }
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Sina 的时间是北京时间（如 2026-10-30 20:14:52），转成 ISO */
function parseSinaTime(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(`${value.replace(" ", "T")}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** 解析 Sina 返回的文本为 Quote（失败的行直接忽略） */
export function parseSinaQuotes(payload: string): Quote[] {
  const quotes: Quote[] = [];
  const pattern = /var hq_str_([a-z0-9_]+)="([^"]*)";/gi;

  for (const match of payload.matchAll(pattern)) {
    const code = match[1].toLowerCase();
    const symbol = CODE_TO_SYMBOL[code];
    if (!symbol) continue;

    const fields = match[2].split(",");
    if (fields.length < 4) continue;

    let price: number | null;
    let previousClose: number | null = null;
    let change: number | null = null;
    let changePercent: number | null = null;
    let marketTime: string | null = null;

    if (code.startsWith("gb_")) {
      // 美股：名称, 现价, 涨跌幅, 更新时间, 涨跌额, 开, 高, 低, …
      price = toNumber(fields[1]);
      changePercent = toNumber(fields[2]);
      change = toNumber(fields[4]);
      marketTime = parseSinaTime(fields[3]);
    } else if (fields.length >= 10) {
      // A 股指数：名称, 今开, 昨收, 现价, 最高, 最低, …
      price = toNumber(fields[3]);
      previousClose = toNumber(fields[2]);
    } else {
      // 全球指数：名称, 现价, 涨跌额, 涨跌幅
      price = toNumber(fields[1]);
      change = toNumber(fields[2]);
      changePercent = toNumber(fields[3]);
    }

    if (price === null || price <= 0) continue;

    const reconciled = reconcileChange({ price, previousClose, change, changePercent });
    const definition = INDEX_DEFINITION_MAP[symbol];

    quotes.push({
      symbol,
      name: definition?.label ?? symbol,
      price,
      previousClose: reconciled.previousClose,
      change: reconciled.change,
      changePercent: reconciled.changePercent,
      currency: definition?.currency ?? "USD",
      exchange: "Sina",
      marketTime: marketTime ?? new Date().toISOString(),
      sparkline: [],
      source: "sina",
      estimated: false,
    });
  }

  return quotes;
}

/** 拉取指定标的的 Sina 快照（只请求 Sina 支持的代码） */
export async function sinaIndexQuotes(symbols: string[]): Promise<Quote[]> {
  const codes = Array.from(
    new Set(
      symbols
        .map((symbol) => SINA_CODES[symbol])
        .filter((code): code is string => Boolean(code)),
    ),
  );
  if (codes.length === 0) return [];

  const response = await fetch(`${ENDPOINT}${codes.join(",")}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: "https://finance.sina.com.cn/",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) throw new Error(`Sina 接口异常（${response.status}）`);

  const payload = decodeText(await response.arrayBuffer());
  const quotes = parseSinaQuotes(payload);
  if (quotes.length === 0) throw new Error("Sina 没有返回指数数据");
  return quotes;
}
