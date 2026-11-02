"use client";

import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import MobileTabBar from "@/components/MobileTabBar";

/** 功能页外壳：共用头部 / 页脚 / 容器宽度 */
export default function PageShell({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-5 lg:px-6 lg:pb-6 xl:max-w-[1640px] 2xl:max-w-[2200px]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-medium leading-tight tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
