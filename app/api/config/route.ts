import { hasInsightLlm, insightModel, insightProvider } from "@/lib/ai";
import { resolveConfig } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 前端用它判断是否展示 AI 相关入口（不暴露密钥本身） */
export async function GET() {
  const ai = hasInsightLlm();
  const config = resolveConfig("insight");
  return Response.json(
    {
      ai,
      provider: ai ? insightProvider() : null,
      model: ai ? insightModel() : null,
      webSearch: config.webSearch,
      /** 兼容旧字段：历史上用 perplexity 布尔值表示 AI 是否可用 */
      perplexity: ai,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
