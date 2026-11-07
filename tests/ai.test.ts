import { test } from "node:test";
import assert from "node:assert/strict";

import { extractJson } from "@/lib/ai";
import { hasLlmConfig, resolveConfig } from "@/lib/llm";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const backup: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    backup[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(backup)) {
      if (backup[key] === undefined) delete process.env[key];
      else process.env[key] = backup[key];
    }
  }
}

test("extractJson：容忍 ```json 包裹与前后说明文字", () => {
  assert.deepEqual(extractJson<{ a: number }>('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson<{ a: number }>('好的，结果如下： {"a":2} 希望有帮助'), { a: 2 });
});

test("extractJson：无法解析时返回 null", () => {
  assert.equal(extractJson("这不是 JSON"), null);
  assert.equal(extractJson("{broken"), null);
});

const CLEAN_ENV: Record<string, string | undefined> = {
  LLM_PROVIDER: undefined,
  LLM_MODEL: undefined,
  LLM_BASE_URL: undefined,
  LLM_API_KEY: undefined,
  QUOTE_LLM_PROVIDER: undefined,
  QUOTE_LLM_MODEL: undefined,
  QUOTE_LLM_BASE_URL: undefined,
  DEEPSEEK_API_KEY: undefined,
  PERPLEXITY_API_KEY: undefined,
  CUSTOM_LLM_API_KEY: undefined,
};

test("默认配置：insight 用 perplexity，quote 用 deepseek", () => {
  withEnv(CLEAN_ENV, () => {
    const insight = resolveConfig("insight");
    assert.equal(insight.provider, "perplexity");
    assert.equal(insight.model, "sonar");
    assert.equal(insight.webSearch, true);
    assert.equal(insight.endpoint, "https://api.perplexity.ai/chat/completions");

    const quote = resolveConfig("quote");
    assert.equal(quote.provider, "deepseek");
    assert.equal(quote.model, "deepseek-flash");
    assert.equal(quote.webSearch, false);
    assert.equal(quote.endpoint, "https://api.deepseek.com/chat/completions");
  });
});

test("环境变量可切换 provider / model，legacy PERPLEXITY_API_KEY 仍生效", () => {
  withEnv(
    {
      ...CLEAN_ENV,
      LLM_PROVIDER: "deepseek",
      LLM_MODEL: "deepseek-v4.1-flash-1017",
      PERPLEXITY_API_KEY: undefined,
      DEEPSEEK_API_KEY: "sk-test",
      LLM_API_KEY: undefined,
      QUOTE_LLM_PROVIDER: undefined,
      QUOTE_LLM_MODEL: undefined,
    },
    () => {
      const insight = resolveConfig("insight");
      assert.equal(insight.provider, "deepseek");
      assert.equal(insight.model, "deepseek-v4.1-flash-1017");
      assert.equal(insight.apiKey, "sk-test");
      assert.equal(hasLlmConfig("insight"), true);
    },
  );

  withEnv(
    { ...CLEAN_ENV, PERPLEXITY_API_KEY: "pplx-old" },
    () => {
      const insight = resolveConfig("insight");
      assert.equal(insight.provider, "perplexity");
      assert.equal(insight.apiKey, "pplx-old");
    },
  );
});

test("custom provider 必须给出 LLM_BASE_URL 才算可用", () => {
  withEnv(
    {
      ...CLEAN_ENV,
      QUOTE_LLM_PROVIDER: "custom",
      QUOTE_LLM_MODEL: "mimo-v2.6-pro",
      CUSTOM_LLM_API_KEY: "key",
    },
    () => {
      const quote = resolveConfig("quote");
      assert.equal(quote.provider, "custom");
      assert.equal(quote.model, "mimo-v2.6-pro");
      assert.equal(quote.endpoint, "");
      assert.equal(hasLlmConfig("quote"), false);
    },
  );

  withEnv(
    {
      ...CLEAN_ENV,
      QUOTE_LLM_PROVIDER: "custom",
      QUOTE_LLM_MODEL: "mimo-v2.6-pro",
      QUOTE_LLM_BASE_URL: "https://example.com/v1/chat/completions",
      CUSTOM_LLM_API_KEY: "key",
    },
    () => {
      const quote = resolveConfig("quote");
      assert.equal(quote.endpoint, "https://example.com/v1/chat/completions");
      assert.equal(hasLlmConfig("quote"), true);
    },
  );
});
