import type { InsightResponse, Quote, RangeKey } from "@/lib/types";

/**
 * Perplexity (sonar) 集成。
 *
 * 两个用途：
 *  1. AI 解读：把行情上下文喂给 sonar，生成带引用来源的简报；
 *  2. 兜底报价：Yahoo 完全不可用时，让 sonar 返回结构化报价（前端会标记 estimated）。
 *
 * 未配置 PERPLEXITY_API_KEY 时相关函数直接抛出 missing_perplexity_key，
 * 页面会降级为「仅 Yahoo 数据」，不影响主流程。
 */

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const DEFAULT_MODEL = "sonar";

export class PerplexityError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
    readonly code: "missing_perplexity_key" | "perplexity_error" | "invalid_request" = "perplexity_error",
  ) {
    super(message);
    this.name = "PerplexityError";
  }
}

export function hasPerplexityKey(): boolean {
  return Boolean(process.env.PERPLEXITY_API_KEY?.trim());
}

export function perplexityModel(): string {
  return process.env.PERPLEXITY_MODEL?.trim() || DEFAULT_MODEL;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
  search_results?: Array<{ title?: string; url?: string }>;
  error?: { message?: string; type?: string };
}

async function chat(
  messages: Array<{ role: "system" | "user"; content: string }>,
  options: { maxTokens?: number; temperature?: number; recency?: "day" | "week" | "month" } = {},
): Promise<{ content: string; citations: { title: string; url: string }[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) {
    throw new PerplexityError("未配置 PERPLEXITY_API_KEY，AI 功能不可用", 501, "missing_perplexity_key");
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: perplexityModel(),
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 800,
        ...(options.recency ? { search_recency_filter: options.recency } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
  } catch {
    throw new PerplexityError("连接 Perplexity 超时或网络异常", 504);
  }

  const text = await response.text();
  let data: ChatCompletionResponse | null = null;
  try {
    data = JSON.parse(text) as ChatCompletionResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.error?.message || text.slice(0, 200) || `HTTP ${response.status}`;
    throw new PerplexityError(`Perplexity 请求失败：${detail}`, response.status);
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new PerplexityError("Perplexity 返回了空内容");
  }

  const citations: { title: string; url: string }[] = [];
  if (Array.isArray(data?.search_results)) {
    for (const item of data.search_results) {
      if (item?.url) citations.push({ title: item.title || item.url, url: item.url });
    }
  }
  if (citations.length === 0 && Array.isArray(data?.citations)) {
    for (const url of data.citations) {
      if (typeof url === "string") citations.push({ title: url, url });
    }
  }

  return { content, citations: citations.slice(0, 6) };
}

/** 从模型输出里尽力抽取 JSON 对象（容忍 ```json``` 包裹与前后说明文字） */
function extractJson<T>(content: string): T | null {
  const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const candidates: string[] = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null;
}

const clampText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const toStringArray = (value: unknown, max: number, maxLength = 160): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => clampText(item, maxLength))
        .filter(Boolean)
        .slice(0, max)
    : [];

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/* -------------------------------------------------------------------------- */
/*                                  兜底报价                                    */
/* -------------------------------------------------------------------------- */

interface RawQuoteJson {
  symbol?: string;
  name?: string;
  price?: number | string;
  previousClose?: number | string;
  change?: number | string;
  changePercent?: number | string;
  currency?: string;
  exchange?: string;
  asOf?: string;
}

/**
 * 用 Perplexity 获取兜底报价，仅当 Yahoo 不可用时调用。
 * 注意：这是模型基于联网检索给出的估算，精度与实时性都不如交易所数据，前端必须明确标注。
 */
export async function perplexityQuote(symbol: string): Promise<Quote> {
  const { content } = await chat(
    [
      {
        role: "system",
        content:
          "You are a financial data extraction engine. Use web search to find the latest available US market quote. " +
          "Respond with STRICT JSON only, no markdown, no commentary. Numbers must be plain numbers (no currency symbols, no commas).",
      },
      {
        role: "user",
        content:
          `Get the latest quote for the US ticker "${symbol}". ` +
          'Return JSON: {"symbol":"","name":"","price":0,"previousClose":0,"change":0,"changePercent":0,"currency":"USD","exchange":"","asOf":"ISO-8601 timestamp of the quote"}. ' +
          "changePercent is a percentage number such as -1.25. If a field is unknown use null. " +
          'If the ticker does not exist, return {"symbol":"","price":null}.',
      },
    ],
    { maxTokens: 400, temperature: 0, recency: "day" },
  );

  const raw = extractJson<RawQuoteJson>(content);
  const price = toNumber(raw?.price);
  if (!raw || price === null || price <= 0) {
    throw new PerplexityError(`Perplexity 未能返回 ${symbol} 的有效报价`, 502);
  }

  const previousClose = toNumber(raw.previousClose);
  const changePercent = toNumber(raw.changePercent);
  const change = previousClose !== null ? price - previousClose : toNumber(raw.change);
  const asOf = raw.asOf ? new Date(raw.asOf) : null;

  return {
    symbol: (clampText(raw.symbol, 12) || symbol).toUpperCase(),
    name: clampText(raw.name, 80) || symbol,
    price,
    previousClose,
    change,
    changePercent:
      changePercent ??
      (previousClose !== null && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : null),
    currency: clampText(raw.currency, 6) || "USD",
    exchange: clampText(raw.exchange, 40),
    marketTime: asOf && !Number.isNaN(asOf.getTime()) ? asOf.toISOString() : null,
    sparkline: [],
    source: "perplexity",
    estimated: true,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  AI 解读                                     */
/* -------------------------------------------------------------------------- */

export interface InsightContext {
  symbol: string;
  name: string;
  range: RangeKey;
  rangeLabel: string;
  currency: string;
  price: number;
  changePercent: number | null;
  periodChangePercent: number | null;
  periodHigh: number | null;
  periodLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
}

interface RawInsightJson {
  summary?: string;
  bullets?: unknown;
  sentiment?: string;
  risks?: unknown;
}

export async function perplexityInsight(context: InsightContext): Promise<InsightResponse> {
  const {
    symbol,
    name,
    range,
    rangeLabel,
    currency,
    price,
    changePercent,
    periodChangePercent,
    periodHigh,
    periodLow,
    week52High,
    week52Low,
    volume,
  } = context;

  const facts = [
    `Ticker: ${symbol} (${name})`,
    `Latest price: ${price} ${currency}`,
    `Daily change: ${changePercent === null ? "unknown" : `${changePercent.toFixed(2)}%`}`,
    `Change over the selected window (${rangeLabel}): ${periodChangePercent === null ? "unknown" : `${periodChangePercent.toFixed(2)}%`}`,
    `Window high / low: ${periodHigh ?? "n/a"} / ${periodLow ?? "n/a"}`,
    `52-week high / low: ${week52High ?? "n/a"} / ${week52Low ?? "n/a"}`,
    `Latest volume: ${volume ?? "n/a"}`,
  ].join("\n");

  const { content, citations } = await chat(
    [
      {
        role: "system",
        content:
          "你是一名严谨的美股研究员。基于给出的行情数据，并结合最近一周的公开新闻，输出简洁、客观、可验证的中文解读。" +
          "不要给出投资建议或目标价，不要编造数据。只输出 JSON，不要 markdown 代码块。",
      },
      {
        role: "user",
        content:
          `行情数据：\n${facts}\n\n` +
          "请输出如下 JSON：\n" +
          '{"summary":"两到三句话的整体解读","bullets":["3-5 条关键观察，每条不超过 60 字"],' +
          '"sentiment":"bullish|neutral|bearish","risks":["1-3 条需要关注的风险"]}',
      },
    ],
    { maxTokens: 700, temperature: 0.2, recency: "week" },
  );

  const parsed = extractJson<RawInsightJson>(content);
  const sentiment =
    parsed?.sentiment === "bullish" || parsed?.sentiment === "bearish" ? parsed.sentiment : "neutral";

  const bullets = toStringArray(parsed?.bullets, 5, 120);
  const risks = toStringArray(parsed?.risks, 3, 120);
  const summary = clampText(parsed?.summary, 600);

  return {
    symbol,
    range,
    summary: summary || content.slice(0, 600),
    bullets: bullets.length > 0 ? bullets : summary ? [summary] : [],
    sentiment,
    risks,
    citations,
    model: perplexityModel(),
    generatedAt: new Date().toISOString(),
  };
}

