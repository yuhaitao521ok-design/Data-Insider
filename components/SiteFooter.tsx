"use client";

import { useI18n } from "@/lib/i18n";

/** 全站页脚 */
export default function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="mt-4 border-t border-border">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 pb-24 pt-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-6 lg:pb-6 xl:max-w-[1640px] 2xl:max-w-[2200px]">
        <p>
          {t("数据来源 Yahoo Finance / Nasdaq / Perplexity · 行情可能延迟 15 分钟 · 仅供学习研究，不构成投资建议")}
        </p>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/yuhaitao521ok-design/TideWhale"
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <span className="hidden sm:inline">TideWhale · {t("潮鲸")}</span>
        </div>
      </div>
    </footer>
  );
}
