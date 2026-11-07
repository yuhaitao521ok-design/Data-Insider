/**
 * 大模型接入层：统一 OpenAI 兼容接口 + Perplexity（内置联网检索与引用）。
 *
 * 支持的 provider：
 *  - perplexity：内置 web search，返回 citations（AI 解读默认）
 *  - deepseek：OpenAI 兼容（https://api.deepseek.com），无联网（兜底报价默认）
 *  - custom：任何 OpenAI 兼容服务（例如小米 MiMo 等），需填 LLM_BASE_URL
 *
 * 按用途（role）区分配置，见 resolveConfig()：
 *  - insight（AI 解读）：LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL
 *  - quote（兜底报价）：QUOTE_LLM_PROVIDER / QUOTE_LLM_MODEL / QUOTE_LLM_BASE_URL
 *
 * 密钥按 provider 取：LLM_API_KEY 或 DEEPSEEK_API_KEY / CUSTOM_LLM_API_KEY /
 * PERPLEXITY_API_KEY（兼容旧配置）。
 */

export type LlmProviderId = "perplexity" | "deepseek" | "custom";
export type LlmRole = "insight" | "quote";

export interface LlmChatOptions {
  maxTokens?: number;
  temperature?: number;
  /** 仅 Perplexity 支持的检索时间窗 */
  recency?: "day" | "week" | "month";
}

export interface LlmChatResult {
  content: string;
  citations: { title: string; url: string }[];
  model: string;
  provider: LlmProviderId;
}

/** 错误码沿用 ApiErrorBody 里的旧取值，前端/接口无需改动 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
    readonly code: "missing_perplexity_key" | "perplexity_error" | "invalid_request" = "perplexity_error",
  ) {
    super(message);
    this.name = "LlmError";
  }
}

interface ProviderDefaults {
  /** chat completions 端点 */
  endpoint: string;
  model: string;
  /** 是否内置联网检索并返回引用 */
  webSearch: boolean;
  keyEnv: string[];
}

const PROVIDER_DEFAULTS: Record<LlmProviderId, ProviderDefaults> = {
  perplexity: {
    endpoint: "https://api.perplexity.ai/chat/completions",
    model: "sonar",
    webSearch: true,
    keyEnv: ["PERPLEXITY_API_KEY"],
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-flash",
    webSearch: false,
    keyEnv: ["DEEPSEEK_API_KEY"],
  },
  custom: {
    // 任意 OpenAI 兼容服务（如小米 MiMo 等），端点必须通过 LLM_BASE_URL 显式给出
    endpoint: "",
    model: "",
    webSearch: false,
    keyEnv: ["CUSTOM_LLM_API_KEY"],
  },
};

export interface LlmConfig {
  role: LlmRole;
  provider: LlmProviderId;
  model: string;
  endpoint: string;
  apiKey: string;
  webSearch: boolean;
}

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function isProvider(value: string): value is LlmProviderId {
  return value === "perplexity" || value === "deepseek" || value === "custom";
}

/** 解析某个用途（AI 解读 / 兜底报价）的完整调用配置 */
export function resolveConfig(role: LlmRole): LlmConfig {
  const prefix = role === "quote" ? "QUOTE_" : "";
  const rawProvider = readEnv(`${prefix}LLM_PROVIDER`, role === "quote" ? "" : "LLM_PROVIDER");
  const provider: LlmProviderId = isProvider(rawProvider)
    ? rawProvider
    : role === "quote"
      ? "deepseek"
      : "perplexity";
  const defaults = PROVIDER_DEFAULTS[provider];

  const model =
    readEnv(`${prefix}LLM_MODEL`, role === "quote" ? "" : "LLM_MODEL") || defaults.model;
  const endpoint =
    readEnv(`${prefix}LLM_BASE_URL`, role === "quote" ? "" : "LLM_BASE_URL") || defaults.endpoint;
  const apiKey = readEnv("LLM_API_KEY", ...defaults.keyEnv);

  return {
    role,
    provider,
    model,
    endpoint,
    apiKey,
    webSearch: defaults.webSearch,
  };
}

/** 该用途是否已具备可用配置（custom 必须给出端点） */
export function hasLlmConfig(role: LlmRole): boolean {
  const config = resolveConfig(role);
  return Boolean(config.apiKey && config.model && config.endpoint);
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
  search_results?: Array<{ title?: string; url?: string }>;
  error?: { message?: string; type?: string };
}

/** 发起一次 chat completions 请求，返回正文与（Perplexity 的）引用来源 */
export async function chat(
  role: LlmRole,
  messages: ChatMessage[],
  options: LlmChatOptions = {},
): Promise<LlmChatResult> {
  const config = resolveConfig(role);
  if (!config.apiKey) {
    throw new LlmError(
      `未配置 ${config.provider} 的 API Key，AI 功能不可用（可设置 LLM_API_KEY 或 ${PROVIDER_DEFAULTS[config.provider].keyEnv[0]}）`,
      501,
      "missing_perplexity_key",
    );
  }
  if (!config.endpoint) {
    throw new LlmError("custom 模型未配置 LLM_BASE_URL（OpenAI 兼容的 chat completions 地址）", 501, "invalid_request");
  }

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 800,
        ...(options.recency && config.provider === "perplexity"
          ? { search_recency_filter: options.recency }
          : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    });
  } catch {
    throw new LlmError("连接 AI 服务超时或网络异常", 504);
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
    throw new LlmError(`${config.provider} 请求失败：${detail}`, response.status);
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new LlmError("AI 服务返回了空内容");
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

  return {
    content,
    citations: citations.slice(0, 6),
    model: config.model,
    provider: config.provider,
  };
}
