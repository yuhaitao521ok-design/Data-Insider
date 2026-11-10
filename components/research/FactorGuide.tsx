"use client";


import { useI18n } from "@/lib/i18n";
import {
  CORRELATION_NOTES,
  FACTOR_DOCS,
  FACTOR_GROUPS,
  READING_STEPS,
  localize,
  type FactorGroup,
} from "@/lib/research-factors";

const GROUP_ORDER: FactorGroup[] = ["momentum", "risk", "relative", "correlation", "trend"];

interface FactorGuideProps {
  /** 从表头 i 点进来的因子 id，会高亮对应卡片 */
  highlight: string | null;
  open: boolean;
  onToggle: () => void;
}

/** 因子说明：每个因子是什么、怎么读，以及整张表的阅读顺序 */
export default function FactorGuide({ highlight, open, onToggle }: FactorGuideProps) {
  const { t, locale } = useI18n();

  return (
    <section id="factor-guide" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium">{t("因子说明")}</h2>
          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {t("每个因子在算什么、怎么读、参考区间，以及整张表的阅读顺序")}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="h-7 shrink-0 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          {open ? t("收起") : t("展开")}
        </button>
      </div>

      {open && (
        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-[11.5px] font-medium text-foreground">{t("怎么看这张表")}</p>
            <ol className="space-y-1.5">
              {READING_STEPS.map((step, index) => (
                <li key={index} className="flex gap-2 text-[11.5px] leading-relaxed text-foreground/80">
                  <span className="num mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent/15 text-[9.5px] text-accent">
                    {index + 1}
                  </span>
                  <span>{localize(step, locale)}</span>
                </li>
              ))}
            </ol>
          </div>

          {GROUP_ORDER.map((group) => {
            const docs = FACTOR_DOCS.filter((doc) => doc.group === group);
            if (docs.length === 0) return null;
            return (
              <div key={group}>
                <p className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <span className="h-2.5 w-0.5 rounded-full bg-accent/70" />
                  {localize(FACTOR_GROUPS[group], locale)}
                </p>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {docs.map((doc) => (
                    <article
                      key={doc.id}
                      id={`factor-${doc.id}`}
                      className={`rounded-lg border p-2.5 transition-colors ${
                        highlight === doc.id
                          ? "border-accent bg-accent/5"
                          : "border-border/70 bg-card"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                        <h3 className="text-[11.5px] font-semibold text-foreground">
                          {localize(doc.label, locale)}
                        </h3>
                        {doc.formula && (
                          <code className="num text-[9.5px] text-muted-foreground/80">
                            {localize(doc.formula, locale)}
                          </code>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed text-foreground/80">
                        <span className="mr-1 text-muted-foreground">{t("是什么")}</span>
                        {localize(doc.what, locale)}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-foreground/70">
                        <span className="mr-1 text-muted-foreground">{t("怎么读")}</span>
                        {localize(doc.how, locale)}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="mb-1.5 text-[11.5px] font-medium text-foreground">
              {t("相关性矩阵怎么读")}
            </p>
            <ul className="space-y-1">
              {CORRELATION_NOTES.map((note, index) => (
                <li
                  key={index}
                  className="flex gap-2 text-[11px] leading-relaxed text-foreground/75"
                >
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span>{localize(note, locale)}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[10.5px] text-muted-foreground">
            {t(
              "计算口径：日线收盘价、区间内全部交易日；夏普 / 索提诺 / 下行波动按 252 交易日年化，无风险利率与目标收益取 0；Alpha / Beta 以 SPY 为基准。",
            )}
          </p>
        </div>
      )}
    </section>
  );
}
