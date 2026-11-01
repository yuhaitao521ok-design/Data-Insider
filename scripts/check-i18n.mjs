#!/usr/bin/env node
/**
 * i18n 覆盖率检查（无需构建）：
 *   1. 组件里 `t("…")` 用到的词条是否都在简体 / 繁体 / 英文词典里
 *   2. 界面文案里还有哪些中文字符串没有走 `t()`（漏翻）
 *
 * 用法：
 *   node scripts/check-i18n.mjs          # 只报告，不阻断（exit 0）
 *   node scripts/check-i18n.mjs --strict # 有问题时 exit 1（可接 CI）
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const STRICT = process.argv.includes("--strict");

const CJK = /[\u4e00-\u9fff]/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

/** 从 lib/i18n.ts 里解析出两本词典的 key */
function readDictionaryKeys() {
  const source = readFileSync(join(ROOT, "lib/i18n.ts"), "utf8");
  const keys = new Set();
  for (const match of source.matchAll(/^\s{2}"([^"]+)":/gm)) {
    keys.add(match[1]);
  }
  return keys;
}

const dictionaryKeys = readDictionaryKeys();
const files = [
  ...walk(join(ROOT, "components")),
  ...walk(join(ROOT, "app")),
].filter((file) => !file.endsWith(".d.ts"));

const usedKeys = new Set();
const untranslated = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const label = relative(ROOT, file);

  for (const match of source.matchAll(/\bt\("([^"]+)"\)/g)) {
    usedKeys.add(match[1]);
  }

  // JSX 文本节点：>中文<（允许跨行，但排除表达式 / 代码片段）
  for (const match of source.matchAll(/>([\s\S]{1,160}?)</g)) {
    const text = match[1].trim();
    if (!text || !CJK.test(text)) continue;
    if (/[{}()=;"'`[\]]/.test(text)) continue;
    untranslated.push({ file: label, text });
  }

  // 属性：aria-label / title / placeholder 直接写中文
  for (const match of source.matchAll(
    /\b(aria-label|title|placeholder)="([^"]*[\u4e00-\u9fff][^"]*)"/g,
  )) {
    untranslated.push({ file: label, text: `${match[1]}="${match[2]}"` });
  }
}

const missing = [...usedKeys].filter((key) => !dictionaryKeys.has(key)).sort();
const covered = usedKeys.size - missing.length;
const total = usedKeys.size + untranslated.length;
const rate = total === 0 ? 100 : Math.round((covered / total) * 100);

console.log(`i18n 检查：${usedKeys.size} 个词条已接入 t()，其中 ${missing.length} 个缺少翻译`);
console.log(`界面文案覆盖率约 ${rate}%（漏翻 ${untranslated.length} 处）\n`);

if (missing.length > 0) {
  console.log("缺少词典条目（请补到 lib/i18n.ts 的 ZH_HANT / EN）：");
  for (const key of missing) console.log(`  - ${key}`);
  console.log("");
}

const byFile = new Map();
for (const item of untranslated) {
  const list = byFile.get(item.file) ?? [];
  list.push(item.text);
  byFile.set(item.file, list);
}

if (byFile.size > 0) {
  console.log("未接入 t() 的中文文案：");
  for (const [file, texts] of byFile) {
    console.log(`  ${file}（${texts.length}）`);
    for (const text of texts.slice(0, 6)) console.log(`    · ${text.slice(0, 60)}`);
    if (texts.length > 6) console.log(`    …还有 ${texts.length - 6} 处`);
  }
  console.log("");
}

const hasIssues = missing.length > 0 || untranslated.length > 0;
if (!hasIssues) {
  console.log("✅ 所有文案都已接入 t() 且有对应翻译");
}
if (STRICT && hasIssues) process.exit(1);
