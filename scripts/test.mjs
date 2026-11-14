#!/usr/bin/env node
/**
 * 单元测试：用 esbuild 打包 tests/*.test.ts（解析 tsconfig 的 @/ 别名），再交给 node --test 运行。
 * 用法：npm test
 */

import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TESTS_DIR = join(ROOT, "tests");
const OUT_DIR = join(ROOT, ".test-dist");

const entries = readdirSync(TESTS_DIR)
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => join(TESTS_DIR, name));

if (entries.length === 0) {
  console.error("tests/ 下没有 .test.ts 文件");
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });

await build({
  entryPoints: entries,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outdir: OUT_DIR,
  outExtension: { ".js": ".mjs" },
  logLevel: "warning",
});

// 用 basename 而不是切 "/"，否则 Windows 的反斜杠路径会拼出错误的输出文件名
const outputs = entries.map((entry) => join(OUT_DIR, basename(entry).replace(/\.ts$/, ".mjs")));

const result = spawnSync(process.execPath, ["--test", ...outputs], {
  stdio: "inherit",
  cwd: ROOT,
});

rmSync(OUT_DIR, { recursive: true, force: true });
process.exit(result.status ?? 1);
