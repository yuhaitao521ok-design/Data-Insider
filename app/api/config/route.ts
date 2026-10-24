import { hasPerplexityKey, perplexityModel } from "@/lib/perplexity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 前端用它判断是否展示 AI 相关入口（不暴露密钥本身） */
export async function GET() {
  return Response.json(
    {
      perplexity: hasPerplexityKey(),
      model: hasPerplexityKey() ? perplexityModel() : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
