/** 策略目录：信号实现 + 中文说明 / 优点 / 缺点（渲染时走 t() 翻译） */

import { bollinger, ema, macd, rsi, sma } from "@/lib/indicators";
import {
  adxSeries,
  atrSeries,
  cciSeries,
  emaSeries,
  ppoSeries,
  priceCloses,
  priceHighs,
  priceLows,
  rocSeries,
  smaSeries,
  stochasticK,
  trixSeries,
  williamsR,
} from "@/lib/backtest-indicators";
import type { ChartPoint } from "@/lib/types";

export interface StrategyMeta {
  key: string;
  label: string;
  /** 一句话说明这条策略在做什么 */
  summary: string;
  pros: string;
  cons: string;
  /** 需要显示哪些参数 */
  fields: Array<
    "fast" | "slow" | "oversold" | "overbought" | "multiplier" | "signal" | "exitLookback" | "threshold"
  >;
  /** 该策略的默认参数覆盖 */
  defaults?: Partial<Record<string, number>>;
  /** 进场语义（如「MACD 金叉」） */
  entryText: string;
  /** 出场语义（如「MACD 死叉」） */
  exitText: string;
  signal: (points: ChartPoint[], params: StrategyParams) => number[];
}

export interface StrategyParams {
  fast: number;
  slow: number;
  oversold: number;
  overbought: number;
  multiplier: number;
  signal: number;
  exitLookback: number;
  threshold: number;
}

/** 连续交叉检测：a 在 b 之上则持有 */
function crossHold(a: (number | null)[], b: (number | null)[]): number[] {
  return a.map((value, index) => {
    const left = value;
    const right = b[index];
    return left !== null && right !== null && left > right ? 1 : 0;
  });
}

/** 阈值穿越（进入看多后保持，直到反向越界） */
function bandHold(
  values: (number | null)[],
  enterBelow: number,
  exitAbove: number,
): number[] {
  let holding = 0;
  return values.map((value) => {
    if (value === null) return 0;
    if (!holding && value <= enterBelow) holding = 1;
    else if (holding && value >= exitAbove) holding = 0;
    return holding;
  });
}

const closes = priceCloses;
const highs = priceHighs;
const lows = priceLows;

export const STRATEGIES: StrategyMeta[] = [
  {
    key: "ma-cross",
    entryText: "均线金叉",
    exitText: "均线死叉",
    label: "均线交叉",
    summary: "快慢两条简单均线，快线在慢线上方时满仓持有，跌破即离场。",
    pros: "规则最经典、参数少不易过拟合，单边趋势里能吃到主升段。",
    cons: "滞后明显，震荡市反复金叉死叉会持续小亏。",
    fields: ["fast", "slow"],
    signal: (points, params) => {
      const c = closes(points);
      return crossHold(sma(c, Math.max(2, Math.round(params.fast))), sma(c, Math.max(3, Math.round(params.slow))));
    },
  },
  {
    key: "ema-cross",
    entryText: "EMA 金叉",
    exitText: "EMA 死叉",
    label: "EMA 交叉",
    summary: "用指数均线代替简单均线，同样快线上穿慢线时持有。",
    pros: "对最近价格更敏感，趋势启动时进场比 SMA 快。",
    cons: "更敏感也意味着更多假信号，横盘阶段来回打脸。",
    fields: ["fast", "slow"],
    signal: (points, params) => {
      const c = closes(points);
      return crossHold(ema(c, Math.max(2, Math.round(params.fast))), ema(c, Math.max(3, Math.round(params.slow))));
    },
  },
  {
    key: "macd-cross",
    entryText: "MACD 金叉",
    exitText: "MACD 死叉",
    label: "MACD 金叉",
    summary: "MACD 的 DIF 上穿 DEA（金叉）时持有，死叉离场。",
    pros: "同时反映趋势与动量，趋势行情中信号相对稳健。",
    cons: "本质上仍是均线差，盘整时容易连续假金叉。",
    fields: ["fast", "slow", "signal"],
    signal: (points, params) => {
      const result = macd(
        closes(points),
        Math.max(2, Math.round(params.fast)),
        Math.max(3, Math.round(params.slow)),
        Math.max(2, Math.round(params.signal)),
      );
      return crossHold(result.macd, result.signal);
    },
  },
  {
    key: "ppo-cross",
    entryText: "PPO 金叉",
    exitText: "PPO 死叉",
    label: "PPO 金叉",
    summary: "把 MACD 归一化成百分比后的金叉策略，适合跨标的比较。",
    pros: "数值与价格量级无关，不同股票之间可以直接对比强弱。",
    cons: "灵敏度与 MACD 接近，同样存在滞后与假信号。",
    fields: ["fast", "slow", "signal"],
    signal: (points, params) => {
      const result = ppoSeries(
        closes(points),
        Math.max(2, Math.round(params.fast)),
        Math.max(3, Math.round(params.slow)),
        Math.max(2, Math.round(params.signal)),
      );
      return crossHold(result.ppo, result.signal);
    },
  },
  {
    key: "trix-cross",
    entryText: "TRIX 上穿零轴",
    exitText: "TRIX 下穿零轴",
    label: "TRIX 金叉",
    summary: "三重指数平滑后的变化率上穿 0 轴时持有。",
    pros: "多重平滑过滤噪音，假信号比 MACD 少。",
    cons: "平滑越多滞后越大，急涨急跌时反应慢。",
    fields: ["slow"],
    signal: (points, params) => {
      const values = trixSeries(closes(points), Math.max(2, Math.round(params.slow)));
      return values.map((value) => (value !== null && value > 0 ? 1 : 0));
    },
  },
  {
    key: "rsi-reversal",
    entryText: "RSI 超卖",
    exitText: "RSI 超买",
    label: "RSI 反转",
    summary: "RSI 跌破超卖阈值买入，涨过超买阈值卖出，做均值回归。",
    pros: "震荡市里低买高卖效果明显，参数直观。",
    cons: "单边下跌时容易越跌越买；单边上涨时过早离场。",
    fields: ["slow", "oversold", "overbought"],
    signal: (points, params) =>
      bandHold(rsi(closes(points), Math.max(2, Math.round(params.slow))), params.oversold, params.overbought),
  },
  {
    key: "stoch-reversal",
    entryText: "KD 超卖",
    exitText: "KD 超买",
    label: "随机指标反转",
    summary: "KD 的 %K 低于超卖线买入，高于超买线卖出。",
    pros: "短线灵敏，适合波动较大的标的做波段。",
    cons: "非常容易在强势趋势中提前卖出，假信号偏多。",
    fields: ["slow", "oversold", "overbought"],
    signal: (points, params) =>
      bandHold(stochasticK(points, Math.max(2, Math.round(params.slow))), params.oversold, params.overbought),
  },
  {
    key: "williams-reversal",
    entryText: "威廉超卖",
    exitText: "威廉超买",
    label: "威廉指标反转",
    summary: "威廉 %R（-100~0）跌到超卖区买入，回升到超买区卖出。",
    pros: "对顶部底部反应快，适合抓短线反弹。",
    cons: "噪音大，趋势中会频繁反向操作。",
    fields: ["slow", "oversold", "overbought"],
    signal: (points, params) => {
      const values = williamsR(points, Math.max(2, Math.round(params.slow)));
      const enterBelow = -100 + params.oversold;
      const exitAbove = -100 + params.overbought;
      return bandHold(values, enterBelow, exitAbove);
    },
  },
  {
    key: "cci-reversal",
    entryText: "CCI 超卖",
    exitText: "CCI 超买",
    label: "CCI 反转",
    summary: "CCI 跌破 -100 视为超卖买入，升破 +100 离场。",
    pros: "对极端偏离敏感，能抓住恐慌性下跌后的反弹。",
    cons: "强趋势里 CCI 会长时间停留在极值，容易过早进场。",
    fields: ["slow"],
    signal: (points, params) =>
      bandHold(cciSeries(points, Math.max(2, Math.round(params.slow))), -100, 100),
  },
  {
    key: "boll-breakout",
    entryText: "突破布林上轨",
    exitText: "跌破布林中轨",
    label: "BOLL 突破",
    summary: "收盘价突破布林上轨买入，跌破中轨卖出，追强势。",
    pros: "能捕捉到放量突破的加速段，趋势市场表现好。",
    cons: "震荡市里上轨假突破多，容易买在短期高点。",
    fields: ["slow", "multiplier"],
    signal: (points, params) => {
      const c = closes(points);
      const bands = bollinger(c, Math.max(2, Math.round(params.slow)), Math.max(0.5, params.multiplier));
      let holding = 0;
      return c.map((close, index) => {
        const upperBand = bands.upper[index];
        const middle = bands.middle[index];
        if (upperBand === null || middle === null) return 0;
        if (!holding && close > upperBand) holding = 1;
        else if (holding && close < middle) holding = 0;
        return holding;
      });
    },
  },
  {
    key: "boll-meanrev",
    entryText: "跌破布林下轨",
    exitText: "回归布林中轨",
    label: "BOLL 均值回归",
    summary: "跌破布林下轨买入，回到中轨卖出，做超跌反弹。",
    pros: "震荡行情里胜率较高，仓位时间短、资金效率高。",
    cons: "趋势性下跌时会不断接刀，需要配合止损。",
    fields: ["slow", "multiplier"],
    signal: (points, params) => {
      const c = closes(points);
      const bands = bollinger(c, Math.max(2, Math.round(params.slow)), Math.max(0.5, params.multiplier));
      let holding = 0;
      return c.map((close, index) => {
        const lowerBand = bands.lower[index];
        const middle = bands.middle[index];
        if (lowerBand === null || middle === null) return 0;
        if (!holding && close < lowerBand) holding = 1;
        else if (holding && close > middle) holding = 0;
        return holding;
      });
    },
  },
  {
    key: "keltner-breakout",
    entryText: "突破肯特纳上轨",
    exitText: "跌破肯特纳中轨",
    label: "凯尔特纳突破",
    summary: "EMA 加减 ATR 组成通道，突破上轨买入、跌破中轨卖出。",
    pros: "通道宽度随波动自适应，比固定百分比通道更稳。",
    cons: "波动骤增时通道快速张开，追高容易吃亏。",
    fields: ["slow", "multiplier"],
    signal: (points, params) => {
      const c = closes(points);
      const period = Math.max(2, Math.round(params.slow));
      const basis = emaSeries(c, period);
      const atr = atrSeries(points, period);
      let holding = 0;
      return c.map((close, index) => {
        const middle = basis[index];
        const range = atr[index];
        if (middle === null || range === null) return 0;
        const upperBand = middle + range * params.multiplier;
        if (!holding && close > upperBand) holding = 1;
        else if (holding && close < middle) holding = 0;
        return holding;
      });
    },
  },
  {
    key: "donchian",
    entryText: "突破 N 日高点",
    exitText: "跌破 M 日低点",
    label: "唐奇安突破（海龟）",
    summary: "收盘创 N 日新高买入，跌破 M 日新低离场，经典海龟规则。",
    pros: "最经得起时间考验的趋势跟随法，能吃到长趋势。",
    cons: "胜率天然偏低（靠盈亏比获利），震荡期回撤明显。",
    fields: ["slow", "exitLookback"],
    signal: (points, params) => {
      const lookback = Math.max(3, Math.round(params.slow));
      const exitLookback = Math.max(2, Math.round(params.exitLookback));
      const h = highs(points);
      const l = lows(points);
      let holding = 0;
      return points.map((point, index) => {
        if (index < lookback) return 0;
        const windowHigh = Math.max(...h.slice(index - lookback, index));
        const exitLow = Math.min(...l.slice(Math.max(0, index - exitLookback), index));
        if (!holding && point.close >= windowHigh) holding = 1;
        else if (holding && point.close <= exitLow) holding = 0;
        return holding;
      });
    },
  },
  {
    key: "price-vs-sma",
    entryText: "站上均线",
    exitText: "跌破均线",
    label: "价格站上均线",
    summary: "收盘价高于 N 日均线就持有，跌破就空仓，最简单的趋势过滤。",
    pros: "极少参数、几乎不会过拟合，是很好的仓位开关。",
    cons: "均线附近反复穿越会造成连续小亏。",
    fields: ["slow"],
    signal: (points, params) => {
      const c = closes(points);
      const average = smaSeries(c, Math.max(2, Math.round(params.slow)));
      return c.map((close, index) => {
        const value = average[index];
        return value !== null && close > value ? 1 : 0;
      });
    },
  },
  {
    key: "dual-momentum",
    entryText: "动量与趋势共振",
    exitText: "动量或趋势转弱",
    label: "双动量",
    summary: "N 日收益为正且价格站上均线时才持有，双重确认。",
    pros: "趋势与动量共振，能显著减少无效交易和回撤。",
    cons: "进场更晚，反弹初期容易错过一段。",
    fields: ["slow"],
    signal: (points, params) => {
      const c = closes(points);
      const period = Math.max(2, Math.round(params.slow));
      const average = smaSeries(c, period);
      const roc = rocSeries(c, period);
      return c.map((close, index) => {
        const avg = average[index];
        const momentumValue = roc[index];
        return avg !== null && momentumValue !== null && momentumValue > 0 && close > avg ? 1 : 0;
      });
    },
  },
  {
    key: "momentum",
    entryText: "N 日动量达标",
    exitText: "动量不足",
    label: "绝对动量",
    summary: "N 日涨跌幅超过阈值就持有，不足则空仓。",
    pros: "逻辑最直白，牛市中能持续待在场内。",
    cons: "拐点处反应慢，急跌时会完整吃到第一段回撤。",
    fields: ["slow", "threshold"],
    // threshold 语义是「N 日涨跌幅（%）」，与 ADX 的 25 不同，这里给 5%
    defaults: { threshold: 5 },
    signal: (points, params) => {
      const values = rocSeries(closes(points), Math.max(2, Math.round(params.slow)));
      return values.map((value) => (value !== null && value > params.threshold ? 1 : 0));
    },
  },
  {
    key: "roc-threshold",
    entryText: "ROC 上穿零轴",
    exitText: "ROC 下穿零轴",
    label: "ROC 变动率",
    summary: "变动率由负转正（上穿 0）时持有，转负离场。",
    pros: "对趋势转向比较敏感，参数少。",
    cons: "横盘时 0 轴反复穿越，交易次数过多。",
    fields: ["slow"],
    signal: (points, params) => {
      const values = rocSeries(closes(points), Math.max(2, Math.round(params.slow)));
      return values.map((value) => (value !== null && value > 0 ? 1 : 0));
    },
  },
  {
    key: "adx-trend",
    entryText: "ADX 走强且站上均线",
    exitText: "ADX 转弱或跌破均线",
    label: "ADX 趋势强度",
    summary: "ADX 高于阈值且价格在均线上方时才持有，只做有强度的趋势。",
    pros: "能过滤掉大部分无趋势的震荡行情，回撤更小。",
    cons: "ADX 本身就滞后，往往在趋势中段才入场。",
    fields: ["slow", "threshold"],
    signal: (points, params) => {
      const c = closes(points);
      const period = Math.max(2, Math.round(params.slow));
      const { adx } = adxSeries(points, period);
      const average = smaSeries(c, period);
      return c.map((close, index) => {
        const strength = adx[index];
        const avg = average[index];
        return strength !== null && avg !== null && strength > params.threshold && close > avg ? 1 : 0;
      });
    },
  },
  {
    key: "consecutive-reversal",
    entryText: "连跌后抄底",
    exitText: "反弹达标",
    label: "连跌反转",
    summary: "连续 N 天下跌后买入，反弹到目标幅度离场（超跌反弹）。",
    pros: "短线胜率不错，与趋势策略相关性低，适合组合。",
    cons: "遇到单边下跌会连续接刀，必须靠仓位控制。",
    fields: ["slow", "threshold"],
    // threshold 语义是「反弹目标（%）」，25% 太苛刻几乎不触发；slow 是连跌天数，30 天也极罕见
    defaults: { threshold: 4, slow: 3 },
    signal: (points, params) => {
      const c = closes(points);
      const streakNeeded = Math.max(2, Math.round(params.slow));
      const target = params.threshold / 100;
      let holding = 0;
      let entryPrice = 0;
      return c.map((close, index) => {
        if (holding) {
          if (entryPrice > 0 && close / entryPrice - 1 >= target) holding = 0;
          return holding;
        }
        if (index < streakNeeded) return 0;
        let streak = 0;
        for (let cursor = index; cursor > index - streakNeeded; cursor -= 1) {
          if (c[cursor] < c[cursor - 1]) streak += 1;
          else break;
        }
        if (streak >= streakNeeded) {
          holding = 1;
          entryPrice = close;
        }
        return holding;
      });
    },
  },
  {
    key: "volume-breakout",
    entryText: "放量创新高",
    exitText: "跌破均线",
    label: "量价突破",
    summary: "创 N 日新高且成交量高于均量时买入，跌破均线离场。",
    pros: "用成交量确认突破，假突破明显更少。",
    cons: "放量往往已在高位，追进去后回撤可能较大。",
    fields: ["slow", "fast"],
    signal: (points, params) => {
      const c = closes(points);
      const h = highs(points);
      const lookback = Math.max(3, Math.round(params.slow));
      const volumeWindow = Math.max(2, Math.round(params.fast));
      const average = smaSeries(c, lookback);
      const volumes = points.map((point) => point.volume ?? 0);
      let holding = 0;
      return points.map((point, index) => {
        if (index < Math.max(lookback, volumeWindow)) return 0;
        const avg = average[index];
        const windowHigh = Math.max(...h.slice(index - lookback, index));
        const recentVolumes = volumes.slice(index - volumeWindow, index);
        const avgVolume = recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length;
        const volumeOk = avgVolume <= 0 || (point.volume ?? 0) >= avgVolume;
        if (!holding && point.close >= windowHigh && volumeOk) holding = 1;
        else if (holding && avg !== null && point.close < avg) holding = 0;
        return holding;
      });
    },
  },
  {
    key: "breakout-pullback",
    entryText: "突破后回踩均线",
    exitText: "跌破均线",
    label: "突破回踩",
    summary: "突破 N 日新高后不追高，等回踩均线时买入。",
    pros: "买点更便宜，止损参考清晰，盈亏比更好。",
    cons: "强趋势里可能等不到回踩，直接错过行情。",
    fields: ["slow"],
    signal: (points, params) => {
      const c = closes(points);
      const h = highs(points);
      const lookback = Math.max(3, Math.round(params.slow));
      const average = smaSeries(c, lookback);
      let brokeOut = false;
      let holding = 0;
      return points.map((point, index) => {
        if (index < lookback) return 0;
        const windowHigh = Math.max(...h.slice(index - lookback, index));
        const avg = average[index];
        if (!holding && point.close >= windowHigh) brokeOut = true;
        if (!holding && brokeOut && avg !== null && point.close <= avg * 1.01) {
          holding = 1;
          brokeOut = false;
        } else if (holding && avg !== null && point.close < avg * 0.97) {
          holding = 0;
        }
        return holding;
      });
    },
  },
];

export const STRATEGY_MAP: Record<string, StrategyMeta> = Object.fromEntries(
  STRATEGIES.map((item) => [item.key, item]),
);
