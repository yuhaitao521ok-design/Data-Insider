import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;

// 让 `next dev` 也能拿到 Cloudflare 的本地绑定（当前项目未使用绑定，保留以兼容后续扩展）
initOpenNextCloudflareForDev();

