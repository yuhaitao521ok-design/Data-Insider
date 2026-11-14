#!/usr/bin/env node
/**
 * Workers Builds 预览构建（Preview command = `npx wrangler preview`）的兼容处理。
 *
 * 背景：`wrangler preview` 会把静态资源目录里的路由文件 `_headers` / `_redirects`
 * 当作 **Worker 模块**上传，Previews API 会拒绝这个请求：
 *
 *   ✘ A request to the Cloudflare API (.../previews/<name>/deployments) failed.
 *     module with name '_headers' must have content type 'text/plain' [code: 10021]
 *
 * 生产部署走 `wrangler deploy`，这两个文件是放进 assets 配置里的，所以 main 一直成功；
 * 只有 PR / 非生产分支的 preview build 会在 build 成功后的 deploy 阶段 100% 失败。
 * 上游 issue：https://github.com/cloudflare/workers-sdk/issues/15791
 * （修复 PR https://github.com/cloudflare/workers-sdk/pull/16086 未合并，4.152 / 4.162 仍有该行为）
 *
 * 处理方式：只在 Workers Builds 的**非生产分支**构建里移除这两个路由文件。
 * 预览 URL 只用于看效果，不需要生产级的长缓存头；生产分支与本地构建完全不受影响。
 *
 * Workers Builds 注入的环境变量：WORKERS_CI=1、WORKERS_CI_BRANCH=<推送的分支名>。
 * 生产分支默认 main，可用 PRODUCTION_BRANCH 覆盖。
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const PRODUCTION_BRANCH = process.env.PRODUCTION_BRANCH || "main";
const branch = process.env.WORKERS_CI_BRANCH;
const isWorkersBuild = Boolean(process.env.WORKERS_CI);
// 以 WORKERS_CI_BRANCH 为准（Workers Builds 一定会注入）；本地不设置该变量就不会触发。
const isPreviewBuild = Boolean(branch) && branch !== PRODUCTION_BRANCH;

const assetsDir = join(process.cwd(), ".open-next", "assets");

if (!isPreviewBuild) {
  const where = branch
    ? `生产分支 ${branch}${isWorkersBuild ? "（Workers Builds）" : ""}`
    : "本地 / 非 Workers Builds 构建";
  console.log(`[cf-preview] ${where}：保留 _headers / _redirects`);
  process.exit(0);
}

const removed = [];
for (const file of ["_headers", "_redirects"]) {
  const target = join(assetsDir, file);
  if (existsSync(target)) {
    rmSync(target, { force: true });
    removed.push(file);
  }
}

console.log(
  removed.length > 0
    ? `[cf-preview] 预览分支 ${branch}：已从 .open-next/assets 移除 ${removed.join(" / ")}（规避 wrangler preview 的 10021 报错）`
    : `[cf-preview] 预览分支 ${branch}：.open-next/assets 中没有 _headers / _redirects，无需处理`,
);
