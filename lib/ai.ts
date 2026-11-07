import type { InsightResponse, Quote, RangeKey } from "@/lib/types";
import { chat, resolveConfig, hasLlmConfig, type LlmProviderId } from "@/lib/llm";

/**
 * AI 业务层：
 *  1. AI 解读：把行情上下文喂给模型，生成带引用来源的简报（默认 Perplexity，联网检索）；
 *  2. 兜底报价：Yahoo 完全不可用时，让模型返回结构化报价（默认 DeepSeek，前端标记 estimated）。
 *
 * 具体用哪个模型由 LLM_PROVIDER / QUOTE_LLM_PROVIDER 等环境变量决定，见 lib/llm.ts。
 * 未配置密钥时相关函数直接抛出 missing_perplexity_key，页面会降级为「仅 Yahoo 数据」。
 */

export function insightProvider(): LlmProviderId {
  return resolveConfig("insight").provider;
}

export function insightModel(): string {
  return resolveConfig("insight").model;
}

export function quoteProvider(): LlmProviderId {
  return resolveConfig("quote").provider;
}

export function quoteModel(): string {
  return resolveConfig("quote").model;
}

export const hasInsightLlm = () => hasLlmConfig("insight");
export const hasQuoteLlm = () => hasLlmConfig("quote");

/** 从模型输出里尽力抽取 JSON 对象（容忍 ```json``` 包裹与前后说明文字） */
export function extractJson<T>(content: string): T | null {
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
 * 用大模型获取兜底报价，仅当 Yahoo 不可用时调用。
 * 注意：这是模型给出的估算，精度与实时性都不如交易所数据，前端必须明确标注。
 */
export async function llmQuote(symbol: string): Promise<Quote> {
  const { content, provider, model } = await chat(
    "quote",
    [
      {
        role: "system",
        content:
          "你是金融数据助手。只输出 JSON，不要 markdown 代码块，不要任何解释。" +
          "如果无法确定某个字段，用 null。所有数字必须是数值类型。",
      },
      {
        role: "user",
        content:
          `给出 ${symbol} 最近一个交易日的美股报价，输出 JSON：\n` +
          '{"symbol":"代码","name":"公司名","price":最新价,"previousClose":昨收,"change":涨跌额,"changePercent":涨跌百分比,"currency":"USD","exchange":"交易所","asOf":"ISO8601 时间"}',
      },
    ],
    { maxTokens: 300, temperature: 0 },
  );

  const raw = extractJson<RawQuoteJson>(content);
  const price = toNumber(raw?.price);
  if (price === null || price <= 0) {
    throw new Error(`${model} 未能给出有效报价`);
  }

  const previousClose = toNumber(raw?.previousClose);
  const changePercent = toNumber(raw?.changePercent);
  const asOf = raw?.asOf ? new Date(raw.asOf) : null;

  return {
    symbol: (clampText(raw?.symbol, 12) || symbol).toUpperCase(),
    name: clampText(raw?.name, 80) || symbol,
    price,
    previousClose,
    change: toNumber(raw?.change),
    changePercent:
      changePercent ??
      (previousClose !== null && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : null),
    currency: clampText(raw?.currency, 6) || "USD",
    exchange: clampText(raw?.exchange, 40),
    marketTime: asOf && !Number.isNaN(asOf.getTime()) ? asOf.toISOString() : null,
    sparkline: [],
    source: "llm",
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

export async function llmInsight(context: InsightContext): Promise<InsightResponse> {
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

  const config = resolveConfig("insight");
  const newsHint = config.webSearch
    ? "并结合最近一周的公开新闻"
    : "只基于给出的行情数据，不要引用未提供的新闻或事件";

  const facts = [
    `Ticker: ${symbol} (${name})`,
    `Latest price: ${price} ${currency}`,
    `Daily change: ${changePercent === null ? "unknown" : `${changePercent.toFixed(2)}%`}`,
    `Change over the selected window (${rangeLabel}): ${periodChangePercent === null ? "unknown" : `${periodChangePercent.toFixed(2)}%`}`,
    `Window high / low: ${periodHigh ?? "n/a"} / ${periodLow ?? "n/a"}`,
    `52-week high / low: ${week52High ?? "n/a"} / ${week52Low ?? "n/a"}`,
    `Latest volume: ${volume ?? "n/a"}`,
  ].join("\n");

  const { content, citations, provider, model } = await chat(
    "insight",
    [
      {
        role: "system",
        content:
          `你是一名严谨的美股研究员。基于给出的行情数据，${newsHint}，输出简洁、客观、可验证的中文解读。` +
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
    { maxTokens: 700, temperature: 0.2, recency: config.webSearch ? "week" : undefined },
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
    provider,
    model,
    generatedAt: new Date().toISOString(),
  };
}
