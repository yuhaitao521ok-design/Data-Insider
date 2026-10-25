import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare 适配器配置。
 *
 * 当前应用没有使用 ISR / on-demand revalidation，页面为静态预渲染，
 * API 路由按请求执行，因此使用默认配置即可（不依赖 R2 / KV）。
 * 如果后续需要 ISR 或跨实例缓存，可按官方文档启用 R2 incremental cache。
 */
export default defineCloudflareConfig();
