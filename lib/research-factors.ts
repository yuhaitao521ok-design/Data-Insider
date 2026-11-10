import type { Locale } from "@/lib/i18n";

/**
 * 量化研究页的因子词典与阅读说明。
 * 这里直接存三语原文（而不是塞进 i18n 词典），因为每条都是一段说明文字，
 * 用 localize() 取当前语言即可。
 */

export interface LocalizedText {
  zh: string;
  hant: string;
  en: string;
}

export function localize(text: LocalizedText, locale: Locale): string {
  if (locale === "zh-Hant") return text.hant;
  if (locale === "en") return text.en;
  return text.zh;
}

export type FactorGroup = "momentum" | "risk" | "relative" | "correlation" | "trend";

export const FACTOR_GROUPS: Record<FactorGroup, LocalizedText> = {
  momentum: { zh: "动量与趋势", hant: "動量與趨勢", en: "Momentum & trend" },
  risk: { zh: "风险与回撤", hant: "風險與回撤", en: "Risk & drawdown" },
  relative: { zh: "相对基准", hant: "相對基準", en: "Versus benchmark" },
  correlation: { zh: "相关性与组合", hant: "相關性與組合", en: "Correlation & portfolio" },
  trend: {
    zh: "趋势结构（单只）",
    hant: "趨勢結構（單隻）",
    en: "Trend structure (single name)",
  },
};

export interface FactorDoc {
  id: string;
  group: FactorGroup;
  label: LocalizedText;
  /** 这个因子在算什么 */
  what: LocalizedText;
  /** 怎么读、参考区间、常见坑 */
  how: LocalizedText;
  /** 计算口径 */
  formula?: LocalizedText;
}

export const FACTOR_DOCS: FactorDoc[] = [
  {
    id: "momentum1M",
    group: "momentum",
    label: { zh: "动量 1M", hant: "動量 1M", en: "Momentum 1M" },
    what: {
      zh: "最近 20 个交易日的涨跌幅，反映短期的资金节奏与情绪。",
      hant: "最近 20 個交易日的漲跌幅，反映短期的資金節奏與情緒。",
      en: "Change over the last 20 trading days — short-term money flow and sentiment.",
    },
    how: {
      zh: "大于 0 表示这一个月在涨。1M 是最容易被消息面扰动的一列，别用它单独下结论；把它和 3M、6M 比：1M 明显弱于 6M，说明趋势正在降温；1M 突然转正而 6M 仍为负，多半是超跌反弹。",
      hant: "大於 0 表示這一個月在漲。1M 是最容易被消息面擾動的一欄，別用它單獨下結論；把它和 3M、6M 比：1M 明顯弱於 6M，說明趨勢正在降溫；1M 突然轉正而 6M 仍為負，多半是超跌反彈。",
      en: "Above 0 means it rose this month. 1M is the most news-sensitive column, so never judge on it alone. Compare with 3M/6M: 1M much weaker than 6M means the trend is cooling; 1M flipping positive while 6M stays negative is usually a rebound, not a new trend.",
    },
    formula: {
      zh: "(最新收盘价 / 20 个交易日前收盘价 − 1) × 100%",
      hant: "（最新收盤價 / 20 個交易日前收盤價 − 1）× 100%",
      en: "(latest close / close 20 trading days ago − 1) × 100%",
    },
  },
  {
    id: "momentum3M",
    group: "momentum",
    label: { zh: "动量 3M", hant: "動量 3M", en: "Momentum 3M" },
    what: {
      zh: "最近 60 个交易日的涨跌幅，是判断中期趋势最常用的一档。",
      hant: "最近 60 個交易日的漲跌幅，是判斷中期趨勢最常用的一檔。",
      en: "Change over the last 60 trading days — the most common mid-term trend gauge.",
    },
    how: {
      zh: "多数量化动量策略用 3M 选股：>0 算中期向上，>10% 属于强势。3M 与 1M 同为正、且 1M 不过热（<15%），是相对健康的上涨节奏；3M 很高但 1M 转负，常见于主升段结束后的整理。",
      hant: "多數量化動量策略用 3M 選股：>0 算中期向上，>10% 屬於強勢。3M 與 1M 同為正、且 1M 不過熱（<15%），是相對健康的上漲節奏；3M 很高但 1M 轉負，常見於主升段結束後的整理。",
      en: "Many momentum strategies screen on 3M: above 0 is a mid-term uptrend, above 10% is strong. 3M positive with 1M positive but not overheated (<15%) is a healthy rhythm; a very high 3M with 1M turning negative usually means the first leg is over.",
    },
    formula: {
      zh: "(最新收盘价 / 60 个交易日前收盘价 − 1) × 100%",
      hant: "（最新收盤價 / 60 個交易日前收盤價 − 1）× 100%",
      en: "(latest close / close 60 trading days ago − 1) × 100%",
    },
  },
  {
    id: "momentum6M",
    group: "momentum",
    label: { zh: "动量 6M", hant: "動量 6M", en: "Momentum 6M" },
    what: {
      zh: "最近 120 个交易日的涨跌幅，代表更长一级的趋势与主线归属。",
      hant: "最近 120 個交易日的漲跌幅，代表更長一級的趨勢與主線歸屬。",
      en: "Change over the last 120 trading days — the longer trend and where the name sits in the cycle.",
    },
    how: {
      zh: "6M 更接近机构调仓的视角：>0 说明这只票今年仍站在资金这一边。理想结构是 6M > 3M > 1M > 0（稳步向上），如果反过来（1M > 3M > 6M）多为下跌中的反弹，持续性通常差。",
      hant: "6M 更接近機構調倉的視角：>0 說明這隻票今年仍站在資金這一邊。理想結構是 6M > 3M > 1M > 0（穩步向上），如果反過來（1M > 3M > 6M）多為下跌中的反彈，持續性通常差。",
      en: "6M is closer to an institutional view: above 0 means money has stayed on this name. The healthy shape is 6M > 3M > 1M > 0 (steady climb); the reverse is usually a bounce inside a downtrend and rarely lasts.",
    },
    formula: {
      zh: "(最新收盘价 / 120 个交易日前收盘价 − 1) × 100%",
      hant: "（最新收盤價 / 120 個交易日前收盤價 − 1）× 100%",
      en: "(latest close / close 120 trading days ago − 1) × 100%",
    },
  },
  {
    id: "resonance",
    group: "momentum",
    label: { zh: "共振分", hant: "共振分", en: "Alignment score" },
    what: {
      zh: "四个方向信号各记 1 分：价格 > MA20、价格 > MA60、1M 动量 > 0、6M 动量 > 0。",
      hant: "四個方向信號各記 1 分：價格 > MA20、價格 > MA60、1M 動量 > 0、6M 動量 > 0。",
      en: "One point each for: price > MA20, price > MA60, 1M momentum > 0, 6M momentum > 0.",
    },
    how: {
      zh: "4 分：短中长期一致向上，趋势最顺；3 分：多头但有分歧，回踩均线时可留意；2 分：方向不明，胜率最低；0–1 分：空头结构，除非做反转策略否则先放观察名单。分高但「距区间高点」还很远，说明仍在修复期，别当成新趋势。",
      hant: "4 分：短中長期一致向上，趨勢最順；3 分：多頭但有分歧，回踩均線時可留意；2 分：方向不明，勝率最低；0–1 分：空頭結構，除非做反轉策略否則先放觀察名單。分高但「距區間高點」還很遠，說明仍在修復期，別當成新趨勢。",
      en: "4 = all horizons aligned up (cleanest trend); 3 = bullish with disagreement, watch pullbacks; 2 = no direction, lowest hit rate; 0–1 = bearish structure, keep on watch unless you trade reversals. A high score with a still-large distance from the period high means repair, not a fresh trend.",
    },
    formula: {
      zh: "count(price > MA20, price > MA60, 20 日动量 > 0, 120 日动量 > 0)",
      hant: "count(price > MA20, price > MA60, 20 日動量 > 0, 120 日動量 > 0)",
      en: "count(price > MA20, price > MA60, 20d momentum > 0, 120d momentum > 0)",
    },
  },
  {
    id: "volatility",
    group: "risk",
    label: { zh: "年化波动", hant: "年化波動", en: "Volatility (ann.)" },
    what: {
      zh: "日收益标准差 × √252，衡量价格上下摆动的幅度，是最基础的风险刻度。",
      hant: "日收益標準差 × √252，衡量價格上下擺動的幅度，是最基礎的風險刻度。",
      en: "Standard deviation of daily returns × √252 — the basic unit of risk.",
    },
    how: {
      zh: "20% 以下偏稳，20%–35% 是美股大盘股常态，40% 以上意味着单日 ±2.5% 很常见，仓位要按比例缩小。波动本身没有好坏，它决定你应该用多大仓位：同样的收益，波动越低体验越好，所以要和夏普、卡玛一起读。",
      hant: "20% 以下偏穩，20%–35% 是美股大型股常態，40% 以上意味著單日 ±2.5% 很常見，倉位要按比例縮小。波動本身沒有好壞，它決定你應該用多大倉位：同樣的收益，波動越低體驗越好，所以要和夏普、卡瑪一起讀。",
      en: "Below 20% is calm, 20–35% is normal for large caps, above 40% means ±2.5% days are routine and position size should shrink. Volatility is neither good nor bad — it sets the right position size; pair it with Sharpe and Calmar.",
    },
    formula: {
      zh: "std(日收益) × √252 × 100%",
      hant: "std(日收益) × √252 × 100%",
      en: "std(daily returns) × √252 × 100%",
    },
  },
  {
    id: "downside",
    group: "risk",
    label: { zh: "下行波动", hant: "下行波動", en: "Downside deviation" },
    what: {
      zh: "只统计下跌日收益的标准差（年化），只把「亏钱」当成风险。",
      hant: "只統計下跌日收益的標準差（年化），只把「虧錢」當成風險。",
      en: "Annualised deviation of negative returns only — treats losses, not upside, as risk.",
    },
    how: {
      zh: "明显低于总波动是好事，说明波动主要来自上涨；两者接近甚至下行更高，说明跌起来又快又深。它是索提诺的分母，想比较两只票「跌的时候谁更难受」，直接比这一列。",
      hant: "明顯低於總波動是好事，說明波動主要來自上漲；兩者接近甚至下行更高，說明跌起來又快又深。它是索提諾的分母，想比較兩隻票「跌的時候誰更難受」，直接比這一欄。",
      en: "Well below total volatility is good: the swings come from the upside. If the two are close — or downside is higher — declines are fast and deep. It is the denominator of Sortino, so compare this column to answer 'who hurts more on the way down'.",
    },
    formula: {
      zh: "std(min(0, 日收益)) × √252 × 100%",
      hant: "std(min(0, 日收益)) × √252 × 100%",
      en: "std(min(0, daily return)) × √252 × 100%",
    },
  },
  {
    id: "sharpe",
    group: "risk",
    label: { zh: "夏普", hant: "夏普", en: "Sharpe" },
    what: {
      zh: "每承担 1 单位波动换来的年化超额收益（无风险利率按 0 处理）。",
      hant: "每承擔 1 單位波動換來的年化超額收益（無風險利率按 0 處理）。",
      en: "Annualised excess return per unit of volatility (risk-free rate assumed 0).",
    },
    how: {
      zh: "同一个区间内横向比较：>1 不错，>2 很好，>3 通常意味着区间太短或运气；为负说明这段时间在亏钱。不同区间、不同市场的夏普不能直接比，3M 的夏普天生比 5Y 更极端。",
      hant: "同一個區間內橫向比較：>1 不錯，>2 很好，>3 通常意味著區間太短或運氣；為負說明這段時間在虧錢。不同區間、不同市場的夏普不能直接比，3M 的夏普天生比 5Y 更極端。",
      en: "Compare within the same window: above 1 is decent, above 2 is strong, above 3 usually means a short window or luck; negative means it lost money. Never compare Sharpe across windows — 3M Sharpe is naturally more extreme than 5Y.",
    },
    formula: {
      zh: "年化收益 / 年化波动",
      hant: "年化收益 / 年化波動",
      en: "annual return / annual volatility",
    },
  },
  {
    id: "sortino",
    group: "risk",
    label: { zh: "索提诺", hant: "索提諾", en: "Sortino" },
    what: {
      zh: "和夏普同构，但分母只算下行波动，上涨的剧烈波动不再被当成风险。",
      hant: "和夏普同構，但分母只算下行波動，上漲的劇烈波動不再被當成風險。",
      en: "Same as Sharpe but the denominator only counts downside deviation.",
    },
    how: {
      zh: "索提诺 > 夏普是成长股的常态，差距越大说明波动越偏向上涨。如果索提诺反而低于夏普，说明下跌段特别凶，要配合 CVaR、最大回撤一起看。",
      hant: "索提諾 > 夏普是成長股的常態，差距越大說明波動越偏向上漲。如果索提諾反而低於夏普，說明下跌段特別凶，要配合 CVaR、最大回撤一起看。",
      en: "For growth names Sortino usually exceeds Sharpe; the bigger the gap, the more the volatility sits on the upside. If Sortino is below Sharpe, declines are unusually violent — check CVaR and max drawdown.",
    },
    formula: {
      zh: "年化收益 / 年化下行波动",
      hant: "年化收益 / 年化下行波動",
      en: "annual return / annual downside deviation",
    },
  },
  {
    id: "calmar",
    group: "risk",
    label: { zh: "卡玛", hant: "卡瑪", en: "Calmar" },
    what: {
      zh: "年化收益 ÷ 最大回撤深度，回答「为了这些收益，要忍受多深的水下」。",
      hant: "年化收益 ÷ 最大回撤深度，回答「為了這些收益，要忍受多深的水下」。",
      en: "Annual return divided by max drawdown depth: how deep an underwater stretch the return requires.",
    },
    how: {
      zh: ">1 说明一年的收益能覆盖历史最大回撤；0.5–1 属于常规；<0.3 意味着回撤远大于收益，更适合等回调而不是追。它对最大回撤非常敏感，一笔极端行情就能改写，别只看这一列做决定。",
      hant: ">1 說明一年的收益能覆蓋歷史最大回撤；0.5–1 屬於常規；<0.3 意味著回撤遠大於收益，更適合等回調而不是追。它對最大回撤非常敏感，一筆極端行情就能改寫，別只看這一欄做決定。",
      en: "Above 1 means a year of return covers the worst historical drawdown; 0.5–1 is normal; below 0.3 means drawdown dwarfs return, so wait for pullbacks instead of chasing. It is very sensitive to a single episode — never decide on this column alone.",
    },
    formula: {
      zh: "年化收益 / |最大回撤|",
      hant: "年化收益 / |最大回撤|",
      en: "annual return / |max drawdown|",
    },
  },
  {
    id: "maxDrawdown",
    group: "risk",
    label: { zh: "最大回撤", hant: "最大回撤", en: "Max drawdown" },
    what: {
      zh: "区间内从任一历史高点到之后最低点的最大跌幅（已经真实发生过）。",
      hant: "區間內從任一歷史高點到之後最低點的最大跌幅（已經真實發生過）。",
      en: "Worst peak-to-trough decline inside the window — something that actually happened.",
    },
    how: {
      zh: "-10% 以内算温和，-20% 左右是常态，-40% 以上要有「拿得住」的准备。它比波动率更直观：波动告诉你日常抖多大，回撤告诉你能不能扛。",
      hant: "-10% 以內算溫和，-20% 左右是常態，-40% 以上要有「拿得住」的準備。它比波動率更直觀：波動告訴你日常抖多大，回撤告訴你能不能扛。",
      en: "Within -10% is mild, around -20% is normal, beyond -40% you need real conviction. It is more intuitive than volatility: volatility is day-to-day shaking, drawdown is whether you can hold through it.",
    },
    formula: {
      zh: "min(收盘价 / 之前最高收盘价 − 1)",
      hant: "min(收盤價 / 之前最高收盤價 − 1)",
      en: "min(close / prior peak close − 1)",
    },
  },
  {
    id: "drawdownDays",
    group: "risk",
    label: { zh: "回撤持续", hant: "回撤持續", en: "Drawdown duration" },
    what: {
      zh: "从高点跌下去到重新创新高所花的自然日；「最长」取区间内最久的一次，尚未修复则算到区间末。",
      hant: "從高點跌下去到重新創新高所花的自然日；「最長」取區間內最久的一次，尚未修復則算到區間末。",
      en: "Calendar days from a peak until a new high is made; 'longest' is the worst episode in the window, counted to the end if still underwater.",
    },
    how: {
      zh: "深度看能不能扛，时长看资金要被占用多久。跌幅只有 -15% 但一直修复不了、拖了一年的标的，机会成本常常被低估；深度小、修复快（数月内）通常更适合长期持有。",
      hant: "深度看能不能扛，時長看資金要被佔用多久。跌幅只有 -15% 但一直修復不了、拖了一年的標的，機會成本常常被低估；深度小、修復快（數月內）通常更適合長期持有。",
      en: "Depth tests your stomach, duration tests your capital lock-up. A name that only fell 15% but stayed underwater for a year has a hidden opportunity cost; shallow and quickly repaired drawdowns suit long holds.",
    },
    formula: {
      zh: "最近一次回撤高峰 → 重新创新高的自然日",
      hant: "最近一次回撤高峰 → 重新創新高的自然日",
      en: "calendar days from the last peak to a new high",
    },
  },
  {
    id: "winRate",
    group: "risk",
    label: { zh: "胜率", hant: "勝率", en: "Hit rate" },
    what: {
      zh: "上涨交易日占全部交易日的比例。",
      hant: "上漲交易日佔全部交易日的比例。",
      en: "Share of trading days that closed higher.",
    },
    how: {
      zh: "45%–55% 是常态。胜率低但收益高，说明靠少数大涨赚钱（盈亏比高）；胜率高但收益低，说明涨得碎、一跌就还回去。单看胜率一定会误判，必须和动量、收益一起读。",
      hant: "45%–55% 是常態。勝率低但收益高，說明靠少數大漲賺錢（盈虧比高）；勝率高但收益低，說明漲得碎、一跌就還回去。單看勝率一定會誤判，必須和動量、收益一起讀。",
      en: "45–55% is normal. A low hit rate with high return means a few big winners paid for everything; a high hit rate with low return means gains were small and given back quickly. Read it only together with momentum and return.",
    },
    formula: {
      zh: "上涨天数 / 总交易天数 × 100%",
      hant: "上漲天數 / 總交易天數 × 100%",
      en: "up days / total trading days × 100%",
    },
  },
  {
    id: "totalReturn",
    group: "risk",
    label: { zh: "区间收益", hant: "區間收益", en: "Period return" },
    what: {
      zh: "区间首尾收盘价的涨跌幅，不看中间的起伏。",
      hant: "區間首尾收盤價的漲跌幅，不看中間的起伏。",
      en: "First-to-last close change in the window, ignoring the path.",
    },
    how: {
      zh: "用来验证其他比率的方向：区间收益为负而夏普为正，只可能是样本太少。它和年化收益差距大，说明区间较短或波动剧烈；5Y 的区间收益要配合年化一起看。",
      hant: "用來驗證其他比率的方向：區間收益為負而夏普為正，只可能是樣本太少。它和年化收益差距大，說明區間較短或波動劇烈；5Y 的區間收益要配合年化一起看。",
      en: "Use it to sanity-check the ratios: negative period return with a positive Sharpe only happens with too few samples. A big gap versus annualised return means a short or very volatile window.",
    },
    formula: {
      zh: "(末日收盘价 / 首日收盘价 − 1) × 100%",
      hant: "（末日收盤價 / 首日收盤價 − 1）× 100%",
      en: "(last close / first close − 1) × 100%",
    },
  },
  {
    id: "beta",
    group: "relative",
    label: { zh: "Beta", hant: "Beta", en: "Beta" },
    what: {
      zh: "相对标普 500（SPY）的敏感度：1 表示同步，1.5 表示大盘涨 1% 时平均涨 1.5%。",
      hant: "相對標普 500（SPY）的敏感度：1 表示同步，1.5 表示大盤漲 1% 時平均漲 1.5%。",
      en: "Sensitivity to the S&P 500 (SPY): 1 moves with the market, 1.5 gains 1.5% when the market gains 1%.",
    },
    how: {
      zh: ">1 进攻型，<1 防守型，接近 0 与大盘无关，负值代表反向（常见于反向 ETF）。Beta 只描述系统性风险，不代表好坏；组合里 Beta 加总过高，等于变相加杠杆。",
      hant: ">1 進攻型，<1 防守型，接近 0 與大盤無關，負值代表反向（常見於反向 ETF）。Beta 只描述系統性風險，不代表好壞；組合裡 Beta 加總過高，等於變相加槓桿。",
      en: "Above 1 is aggressive, below 1 defensive, near 0 is market-neutral, negative is inverse (usually inverse ETFs). Beta only describes systematic risk — a portfolio whose betas add up too high is effectively leveraged.",
    },
    formula: {
      zh: "cov(个股日收益, SPY 日收益) / var(SPY 日收益)",
      hant: "cov(個股日收益, SPY 日收益) / var(SPY 日收益)",
      en: "cov(stock return, SPY return) / var(SPY return)",
    },
  },
  {
    id: "alpha",
    group: "relative",
    label: { zh: "年化 Alpha", hant: "年化 Alpha", en: "Alpha (ann.)" },
    what: {
      zh: "剥掉 Beta 带来的市场收益后，剩余的年化超额收益。",
      hant: "剝掉 Beta 帶來的市場收益後，剩餘的年化超額收益。",
      en: "Annualised excess return left after removing the part explained by beta.",
    },
    how: {
      zh: ">0 说明有独立于大盘的赚钱能力，>10% 已经很强；区间越短 Alpha 越不稳定，3M 的正 Alpha 很可能只是运气。小盘股、新股的高 Alpha 常常伴随极高的跟踪误差，要一起看。",
      hant: ">0 說明有獨立於大盤的賺錢能力，>10% 已經很強；區間越短 Alpha 越不穩定，3M 的正 Alpha 很可能只是運氣。小型股、新股的高 Alpha 常常伴隨極高的跟蹤誤差，要一起看。",
      en: "Above 0 means return not explained by the market; above 10% is strong. Shorter windows make alpha noisier — a positive 3M alpha is often luck. High alpha on small or new names usually comes with high tracking error; read them together.",
    },
    formula: {
      zh: "(平均日收益 − beta × SPY 平均日收益) × 252",
      hant: "（平均日收益 − beta × SPY 平均日收益）× 252",
      en: "(mean daily return − beta × mean SPY return) × 252",
    },
  },
  {
    id: "trackingError",
    group: "relative",
    label: { zh: "跟踪误差", hant: "跟蹤誤差", en: "Tracking error" },
    what: {
      zh: "与 SPY 日收益差（主动收益）的标准差，年化后衡量「和大盘走得多不像」。",
      hant: "與 SPY 日收益差（主動收益）的標準差，年化後衡量「和大盤走得多不像」。",
      en: "Annualised standard deviation of the return difference versus SPY — how unlike the index it is.",
    },
    how: {
      zh: "<10% 与大盘接近，适合做指数替代；10%–25% 是主动管理的常态；>30% 说明个股行情主导，指数涨跌几乎解释不了它。ETF 通常只有个位数。",
      hant: "<10% 與大盤接近，適合做指數替代；10%–25% 是主動管理的常態；>30% 說明個股行情主導，指數漲跌幾乎解釋不了它。ETF 通常只有個位數。",
      en: "Below 10% tracks the market closely (index substitute); 10–25% is normal active risk; above 30% means stock-specific moves dominate and the index explains very little. ETFs usually sit in single digits.",
    },
    formula: {
      zh: "std(个股日收益 − SPY 日收益) × √252 × 100%",
      hant: "std(個股日收益 − SPY 日收益) × √252 × 100%",
      en: "std(stock return − SPY return) × √252 × 100%",
    },
  },
  {
    id: "informationRatio",
    group: "relative",
    label: { zh: "信息比率", hant: "信息比率", en: "Information ratio" },
    what: {
      zh: "年化超额收益 ÷ 跟踪误差，衡量「偏离大盘的效率」。",
      hant: "年化超額收益 ÷ 跟蹤誤差，衡量「偏離大盤的效率」。",
      en: "Annualised active return divided by tracking error — how efficiently it deviates from the index.",
    },
    how: {
      zh: "0.5 左右不错，>1 优秀；为负说明主动偏离反而跑输，那不如直接买指数。和 Alpha 一起看：Alpha 高但信息比率低，说明为了这点超额承担了太多波动。",
      hant: "0.5 左右不錯，>1 優秀；為負說明主動偏離反而跑輸，那不如直接買指數。和 Alpha 一起看：Alpha 高但信息比率低，說明為了這點超額承擔了太多波動。",
      en: "Around 0.5 is decent, above 1 is strong; negative means the active deviation lost money, so the index would have been better. Pair with alpha: high alpha with a low IR means too much volatility for that excess.",
    },
    formula: {
      zh: "年化主动收益 / 年化跟踪误差",
      hant: "年化主動收益 / 年化跟蹤誤差",
      en: "annual active return / annual tracking error",
    },
  },
  {
    id: "capture",
    group: "relative",
    label: { zh: "上涨/下跌捕获", hant: "上漲/下跌捕獲", en: "Up/down capture" },
    what: {
      zh: "基准上涨日，标的平均涨幅占基准的比例（上涨捕获）；基准下跌日同理（下跌捕获）。",
      hant: "基準上漲日，標的平均漲幅佔基準的比例（上漲捕獲）；基準下跌日同理（下跌捕獲）。",
      en: "On days the index rises, the stock's average gain as a share of it (up capture); same idea on down days (down capture).",
    },
    how: {
      zh: "理想形态是上涨捕获 >100%、下跌捕获 <100%（涨得多、跌得少）。两个都 >100% 是高 Beta 的进攻型，两个都 <100% 偏防守。注意这是算术平均，单日极端行情会影响结果。",
      hant: "理想形態是上漲捕獲 >100%、下跌捕獲 <100%（漲得多、跌得少）。兩個都 >100% 是高 Beta 的進攻型，兩個都 <100% 偏防守。注意這是算術平均，單日極端行情會影響結果。",
      en: "The ideal shape is up capture >100% with down capture <100% (gains more, loses less). Both above 100% is a high-beta attacker; both below is defensive. These are arithmetic means, so one extreme day can distort them.",
    },
    formula: {
      zh: "上涨日标的平均收益 / 上涨日基准平均收益 × 100%",
      hant: "上漲日標的平均收益 / 上漲日基準平均收益 × 100%",
      en: "mean stock return on up days / mean benchmark return on up days × 100%",
    },
  },
  {
    id: "var95",
    group: "risk",
    label: { zh: "VaR 95%", hant: "VaR 95%", en: "VaR 95%" },
    what: {
      zh: "历史模拟法：大约 95% 的交易日，单日亏损不会超过这个百分比（正数代表损失）。",
      hant: "歷史模擬法：大約 95% 的交易日，單日虧損不會超過這個百分比（正數代表損失）。",
      en: "Historical simulation: on about 95% of days the loss stays below this percentage (positive = loss).",
    },
    how: {
      zh: "VaR 3% 意味着大约每 20 个交易日会遇到一次 3% 以上的单日下跌。它只说明「常态下的 worst case」，不覆盖黑天鹅；样本至少要 1 年才勉强可信。",
      hant: "VaR 3% 意味著大約每 20 個交易日會遇到一次 3% 以上的單日下跌。它只說明「常態下的 worst case」，不覆蓋黑天鵝；樣本至少要 1 年才勉強可信。",
      en: "A 3% VaR means roughly once every 20 trading days you lose more than 3% in a day. It covers the routine bad day, not black swans; you need at least a year of samples to trust it.",
    },
    formula: {
      zh: "日收益分布的 5% 分位数（取绝对值）",
      hant: "日收益分布的 5% 分位數（取絕對值）",
      en: "5th percentile of daily returns (absolute value)",
    },
  },
  {
    id: "cvar95",
    group: "risk",
    label: { zh: "CVaR 95%", hant: "CVaR 95%", en: "CVaR 95%" },
    what: {
      zh: "超过 VaR 的那一小撮最差交易日的平均亏损（条件 VaR / 期望尾部损失）。",
      hant: "超過 VaR 的那一小撮最差交易日的平均虧損（條件 VaR / 期望尾部損失）。",
      en: "Average loss on the worst days beyond VaR (expected shortfall).",
    },
    how: {
      zh: "通常比 VaR 大 30%–80%，两者差距越大说明尾部越肥、极端行情越狠。做仓位管理时用 CVaR 更保守：按 CVaR 决定能承受的单日亏损，再倒推仓位。",
      hant: "通常比 VaR 大 30%–80%，兩者差距越大說明尾部越肥、極端行情越狠。做倉位管理時用 CVaR 更保守：按 CVaR 決定能承受的單日虧損，再倒推倉位。",
      en: "Usually 30–80% larger than VaR; a bigger gap means fatter tails and nastier extremes. For sizing, use CVaR: decide the daily loss you can tolerate, then work backwards to position size.",
    },
    formula: {
      zh: "min(收益) 小于 −VaR 的部分的平均值",
      hant: "min(收益) 小於 −VaR 的部分的平均值",
      en: "mean of returns below −VaR",
    },
  },
  {
    id: "skew",
    group: "risk",
    label: { zh: "偏度", hant: "偏度", en: "Skew" },
    what: {
      zh: "收益分布的不对称程度：正数右偏，负数左偏。",
      hant: "收益分布的不對稱程度：正數右偏，負數左偏。",
      en: "Asymmetry of the return distribution: positive is right-skewed, negative left-skewed.",
    },
    how: {
      zh: "多数股票和策略是左偏（<0）：平时小赚，偶尔暴跌。左偏越明显，越不能只看平均收益。右偏（>0）多见于期权卖方反向结构，平时小亏、偶发大赚。",
      hant: "多數股票和策略是左偏（<0）：平時小賺，偶爾暴跌。左偏越明顯，越不能只看平均收益。右偏（>0）多見於選擇權賣方反向結構，平時小虧、偶發大賺。",
      en: "Most stocks and strategies are left-skewed (<0): small gains, occasional crashes. The more negative, the less you can trust the average return. Right skew (>0) shows up in structures with small steady losses and rare big wins.",
    },
    formula: {
      zh: "三阶标准化矩（样本修正）",
      hant: "三階標準化矩（樣本修正）",
      en: "third standardised moment (sample adjusted)",
    },
  },
  {
    id: "kurtosis",
    group: "risk",
    label: { zh: "峰度", hant: "峰度", en: "Kurtosis" },
    what: {
      zh: "超额峰度：极端值比正态分布多多少。",
      hant: "超額峰度：極端值比常態分布多多少。",
      en: "Excess kurtosis: how many more extreme observations than a normal distribution.",
    },
    how: {
      zh: ">0 是肥尾，数值越大越容易出现「意料之外」的大波动；>3 属于明显厚尾，仓位要按最坏情况留安全垫。指数和 ETF 的峰度通常比个股低。",
      hant: ">0 是肥尾，數值越大越容易出現「意料之外」的大波動；>3 屬於明顯厚尾，倉位要按最壞情況留安全墊。指數和 ETF 的峰度通常比個股低。",
      en: "Above 0 is fat-tailed; the larger, the more often surprises happen. Above 3 is clearly heavy-tailed — size positions for the worst case. Indexes and ETFs usually show lower kurtosis than single stocks.",
    },
    formula: {
      zh: "四阶标准化矩 − 3（样本修正）",
      hant: "四階標準化矩 − 3（樣本修正）",
      en: "fourth standardised moment − 3 (sample adjusted)",
    },
  },
  {
    id: "fromHigh",
    group: "trend",
    label: { zh: "距区间高点", hant: "距區間高點", en: "From period high" },
    what: {
      zh: "当前价距区间内最高收盘价的百分比（0% 表示正在创新高）。",
      hant: "當前價距區間內最高收盤價的百分比（0% 表示正在創新高）。",
      en: "Distance from the highest close in the window (0% means it is at a new high).",
    },
    how: {
      zh: "0% 到 -5% 是强势区，-5% 到 -15% 是正常回踩，-25% 以上说明还在深水区、需要更长时间修复。「距高点近」+「共振分高」是趋势延续的典型组合；两者背离时以价格位置为准。",
      hant: "0% 到 -5% 是強勢區，-5% 到 -15% 是正常回踩，-25% 以上說明還在深水區、需要更長時間修復。「距高點近」+「共振分高」是趨勢延續的典型組合；兩者背離時以價格位置為準。",
      en: "0% to -5% is a strong zone, -5% to -15% is a normal pullback, beyond -25% means it is still deep underwater and needs longer to repair. 'Near the high' plus 'high alignment score' is the classic continuation setup; if they disagree, trust price location.",
    },
    formula: {
      zh: "(最新收盘价 / 区间最高收盘价 − 1) × 100%",
      hant: "（最新收盤價 / 區間最高收盤價 − 1）× 100%",
      en: "(latest close / highest close in window − 1) × 100%",
    },
  },
  {
    id: "annualReturn",
    group: "risk",
    label: { zh: "年化收益", hant: "年化收益", en: "Return (ann.)" },
    what: {
      zh: "把区间总收益按几何方式折算成「一年赚多少」。",
      hant: "把區間總收益按幾何方式折算成「一年賺多少」。",
      en: "The period return converted geometrically into a one-year figure.",
    },
    how: {
      zh: "样本不足半年时年化会被放大得离谱（1 个月涨 10% 折成年化是 200%+），看看就好。要比较长期能力，用 5Y 区间的年化更可靠；短期策略评估更适合看区间收益 + 最大回撤。",
      hant: "樣本不足半年時年化會被放大得離譜（1 個月漲 10% 折成年化是 200%+），看看就好。要比較長期能力，用 5Y 區間的年化更可靠；短期策略評估更適合看區間收益 + 最大回撤。",
      en: "With less than half a year of data the annualisation is wild (a 10% month becomes 200%+), so treat it as decoration. For long-term skill compare the 5Y window; for short-term evaluation stick to period return plus max drawdown.",
    },
    formula: {
      zh: "(1 + 区间收益)^(252 / 样本天数) − 1",
      hant: "(1 + 區間收益)^(252 / 樣本天數) − 1",
      en: "(1 + period return)^(252 / sample days) − 1",
    },
  },
  {
    id: "pairCorrelation",
    group: "correlation",
    label: { zh: "相关系数", hant: "相關係數", en: "Correlation" },
    what: {
      zh: "两只标的日收益的同步程度，取值 −1 到 1。",
      hant: "兩隻標的日收益的同步程度，取值 −1 到 1。",
      en: "How synchronised two daily return series are, from −1 to 1.",
    },
    how: {
      zh: ">0.8 几乎同涨同跌，配在一起等于加仓同一只票；0.3–0.6 有一定分散作用；接近 0 或负值分散效果最好。相关性会随行情漂移（危机时普遍升高），单个区间的数字只是这一段时间的事实。",
      hant: ">0.8 幾乎同漲同跌，配在一起等於加倉同一隻票；0.3–0.6 有一定分散作用；接近 0 或負值分散效果最好。相關性會隨行情漂移（危機時普遍升高），單個區間的數字只是這段時間的事實。",
      en: "Above 0.8 moves almost in lockstep — holding both is doubling the same bet; 0.3–0.6 gives some diversification; near 0 or negative is strongest. Correlation drifts over time (it rises in crises), so one window is only a snapshot.",
    },
    formula: {
      zh: "cov(a, b) / (σa × σb)，按共同交易日对齐",
      hant: "cov(a, b) / (σa × σb)，按共同交易日對齊",
      en: "cov(a, b) / (σa × σb) on common trading days",
    },
  },
  {
    id: "avgCorrelation",
    group: "correlation",
    label: { zh: "平均相关性", hant: "平均相關性", en: "Average correlation" },
    what: {
      zh: "标的池内所有两两相关系数的平均值。",
      hant: "標的池內所有兩兩相關係數的平均值。",
      en: "Mean of every pairwise correlation inside the pool.",
    },
    how: {
      zh: "<0.3 分散效果好，0.3–0.6 中等，>0.7 基本是同一波行情——组合的「分散」只是心理安慰，遇到系统性下跌会一起跌。加标的时优先选能把这个数字拉低的那只。",
      hant: "<0.3 分散效果好，0.3–0.6 中等，>0.7 基本是同一波行情——組合的「分散」只是心理安慰，遇到系統性下跌會一起跌。加標的時優先選能把這個數字拉低的那隻。",
      en: "Below 0.3 is well diversified, 0.3–0.6 is medium, above 0.7 means one single trade — the 'diversification' is psychological and a systemic selloff hits everything together. When adding names, pick the one that pulls this number down.",
    },
    formula: {
      zh: "mean(所有 i<j 的相关系数)",
      hant: "mean(所有 i<j 的相關係數)",
      en: "mean of all i<j correlations",
    },
  },
  {
    id: "diversification",
    group: "correlation",
    label: { zh: "分散化收益", hant: "分散化收益", en: "Diversification gain" },
    what: {
      zh: "个股波动的平均值减去等权组合的实际波动（百分点）。",
      hant: "個股波動的平均值減去等權組合的實際波動（百分點）。",
      en: "Average single-name volatility minus the realised volatility of the equal-weight portfolio (percentage points).",
    },
    how: {
      zh: "差额越大，说明相关性越低、组合把波动「压」得越明显。只有 1–2 个百分点说明池子里的票太像，加人不如换风格；同时注意分散化只能降低波动，不保证提高收益。",
      hant: "差額越大，說明相關性越低、組合把波動「壓」得越明顯。只有 1–2 個百分點說明池子裡的票太像，加人不如換風格；同時注意分散化只能降低波動，不保證提高收益。",
      en: "A bigger gap means lower correlation and more volatility actually removed. Only 1–2 points means the pool is too similar — change style rather than add names. Diversification lowers volatility; it does not guarantee higher returns.",
    },
    formula: {
      zh: "mean(个股年化波动) − 组合年化波动",
      hant: "mean(個股年化波動) − 組合年化波動",
      en: "mean(single-name volatility) − realised portfolio volatility",
    },
  },
];

/** 「怎么看这张表」：按顺序执行，避免把不同区间、不同口径的数字混着比 */
export const READING_STEPS: LocalizedText[] = [
  {
    zh: "先锁定区间：整张表只在同一个区间内比较，3M 的动量不要和 6M 的数字直接比大小。",
    hant: "先鎖定區間：整張表只在同一個區間內比較，3M 的動量不要和 6M 的數字直接比大小。",
    en: "Fix the window first: compare only inside one window; never compare a 3M momentum with a 6M number.",
  },
  {
    zh: "先筛趋势：看共振分和 6M 动量，>=3 分且 6M>0 的进候选，0–1 分的先放观察名单。",
    hant: "先篩趨勢：看共振分和 6M 動量，>=3 分且 6M>0 的進候選，0–1 分的先放觀察名單。",
    en: "Screen the trend: use alignment score and 6M momentum — score ≥3 with 6M > 0 goes to the shortlist, 0–1 stays on watch.",
  },
  {
    zh: "再看性价比：候选里比较夏普/索提诺（越高越好）与最大回撤/最长回撤（越小越好），用卡玛做交叉验证。",
    hant: "再看性價比：候選裡比較夏普/索提諾（越高越好）與最大回撤/最長回撤（越小越好），用卡瑪做交叉驗證。",
    en: "Then the payoff: among the shortlist compare Sharpe/Sortino (higher is better) with max and longest drawdown (lower is better), and cross-check with Calmar.",
  },
  {
    zh: "最后看相关性：把候选拖进相关性矩阵，平均相关性 >0.7 的同类只留最强的一只，其余换成低相关的风格。",
    hant: "最後看相關性：把候選拖進相關性矩陣，平均相關性 >0.7 的同類只留最強的一隻，其餘換成低相關的風格。",
    en: "Finally correlation: drop the shortlist into the matrix; if average correlation is above 0.7 keep only the strongest of each cluster and switch the rest into a lower-correlation style.",
  },
  {
    zh: "点任意一行看单只细节：风险统计、月度收益、回撤水下图与相对基准的滚动相关性，都在下面。",
    hant: "點任意一行看單隻細節：風險統計、月度收益、回撤水下圖與相對基準的滾動相關性，都在下面。",
    en: "Click any row for single-name detail: risk stats, monthly returns, the drawdown underwater chart and rolling correlation to the benchmark are all below.",
  },
];

export const CORRELATION_NOTES: LocalizedText[] = [
  {
    zh: "颜色：绿=正相关（同涨同跌），红=负相关（对冲），越深相关越强；对角线恒为 1。",
    hant: "顏色：綠=正相關（同漲同跌），紅=負相關（對沖），越深相關越強；對角線恆為 1。",
    en: "Colour: green = positive (move together), red = negative (hedge), deeper = stronger; the diagonal is always 1.",
  },
  {
    zh: "矩阵是对称的，只需看右上三角；数值按共同交易日对齐，不同市场假期不会错位。",
    hant: "矩陣是對稱的，只需看右上三角；數值按共同交易日對齊，不同市場假期不會錯位。",
    en: "The matrix is symmetric — read the upper triangle only. Values are aligned on common trading days, so different market holidays will not misalign them.",
  },
  {
    zh: "「按相关聚类」会把相似的标的排在一起，热力图出现块状就说明这几只是同一波行情。",
    hant: "「按相關聚類」會把相似的標的排在一起，熱力圖出現塊狀就說明這幾隻是同一波行情。",
    en: "'Cluster order' groups similar names together; blocks in the heatmap mean those names are one single trade.",
  },
  {
    zh: "标的池可以随时加/减，数量没有上限；矩阵越大加载越慢，建议一次研究 10–30 只。",
    hant: "標的池可以隨時加/減，數量沒有上限；矩陣越大載入越慢，建議一次研究 10–30 隻。",
    en: "Add or remove names freely — there is no hard cap. Bigger matrices load slower, so 10–30 names per study works best.",
  },
];
