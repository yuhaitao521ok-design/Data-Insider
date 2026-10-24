# Data Insider · 美股多周期行情

一个开箱即用的美股行情看板：从 **Yahoo Finance** 获取多周期报价与走势，失败时自动降级到 **Nasdaq** 官方接口，并可选用 **Perplexity** 生成带引用来源的 AI 解读。

> 纯前后端一体项目（Next.js App Router），无需数据库，无需 API Key 即可运行。

![tech](https://img.shields.io/badge/Next.js-15-black) ![tech](https://img.shields.io/badge/TypeScript-5-blue) ![tech](https://img.shields.io/badge/Tailwind%20CSS-4-38bdf8)

## 功能

- **8 种周期**：1D / 5D / 1M / 3M / 6M / 1Y / 5Y / MAX，自动选择合适的数据粒度（分钟 / 日 / 周 / 月）
- **自选股**：默认 8 只热门标的，支持搜索添加（含中文别名）、移除，列表持久化到 localStorage
- **实时刷新**：报价 30 秒轮询、分时图 60 秒轮询，可一键暂停；自选股列表带迷你走势
- **专业走势图**：纯 SVG 实现（无图表库依赖），支持十字光标、悬浮明细、成交量、昨收参考线
- **关键指标**：昨收、今日高低、成交量、区间涨跌 / 高低、52 周区间
- **多数据源自动降级**：Yahoo → Nasdaq →（可选）Perplexity，页面明确标注来源
- **AI 解读（可选）**：Perplexity `sonar` 结合最新新闻生成中文解读、要点、风险与引用链接
- **深色行情终端风格**，移动端 / 桌面端自适应

## 快速开始

```bash
npm install
cp .env.example .env.local   # 可选：填入 Perplexity Key
npm run dev
```

打开 http://localhost:3000 。

生产构建：

```bash
npm run build && npm start
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PERPLEXITY_API_KEY` | 否 | 配置后启用「AI 解读」，并在所有行情源失败时作为兜底报价 |
| `PERPLEXITY_MODEL` | 否 | 默认 `sonar` |

不配置 Perplexity 时，行情功能完全可用，AI 面板会显示配置提示。

## API

| 路由 | 说明 |
| --- | --- |
| `GET /api/quotes?symbols=AAPL,MSFT` | 批量报价 + 迷你走势（一次请求，服务端缓存 15s） |
| `GET /api/chart?symbol=AAPL&range=1M` | 指定周期走势 + 报价，`range` 取 `1D/5D/1M/3M/6M/1Y/5Y/MAX` |
| `GET /api/search?q=英伟达` | 代码 / 公司名搜索（Yahoo 不可用时回退到内置热门列表） |
| `GET /api/insight?symbol=AAPL&range=1M` | Perplexity AI 解读（未配置 Key 返回 501） |
| `GET /api/config` | 前端探测 AI 功能是否可用 |

示例：

```bash
curl 'http://localhost:3000/api/chart?symbol=NVDA&range=3M' | jq '.meta, (.points | length)'
```

## 数据源与降级策略

```
/api/quotes  ──▶ Yahoo v7/spark（1 次请求拿全部代码）
                    │ 429 / 5xx
                    ▼
                 Nasdaq info（4 并发，逐个代码）
                    │ 全部失败
                    ▼
                 Perplexity（可选，标注为「估算」）

/api/chart   ──▶ Yahoo v8/chart（支持分时）
                    │ 429 / 5xx
                    ▼
                 Nasdaq chart（日线，5Y/MAX 本地聚合为周线/月线）
                    │ 1D / 5D 无兜底
                    ▼
                 返回明确错误 + 引导切换周期
```

细节：

- Yahoo 失败后进入 **60 秒冷却**，期间直接走兜底源，避免每次请求都先撞 429。
- 服务端使用进程内 LRU 缓存 + 请求去重 + `stale-while-revalidate`：报价 15s 新鲜期 / 10min 宽限期，走势按周期 30s–1h。响应同时带 `s-maxage`，部署在 Vercel 时可被 CDN 缓存。
- Yahoo 对机房 IP 限流较严，Nasdaq 兜底可保证页面在多数环境下仍能正常使用；1D / 5D 分时数据仅 Yahoo 提供。
- Yahoo / Nasdaq 均为公开非官方接口，字段可能变更，请勿用于生产交易决策。

## 部署到 Vercel

1. 将仓库导入 Vercel，框架会自动识别为 Next.js；
2. 在 Project Settings → Environment Variables 添加 `PERPLEXITY_API_KEY`（可选）；
3. Deploy。

也可以部署到任何支持 Node.js 18+ 的平台（需 Node Runtime，不支持 Edge Runtime，因为依赖 Node 内置能力）。

## 目录结构

```
app/
  page.tsx              页面入口
  layout.tsx            全局布局 / 元信息
  globals.css           Tailwind v4 主题与动效
  api/
    quotes/route.ts     批量报价
    chart/route.ts      周期走势
    search/route.ts     代码搜索
    insight/route.ts    Perplexity AI 解读
    config/route.ts     功能开关探测
components/
  Dashboard.tsx         主面板（状态、轮询、自选股）
  PriceChart.tsx        SVG 走势图
  Sparkline.tsx         迷你走势
  SearchBox.tsx         搜索下拉
  InsightPanel.tsx      AI 解读卡片
lib/
  types.ts              共享类型 + 周期配置
  yahoo.ts              Yahoo Finance 适配器
  nasdaq.ts             Nasdaq 兜底适配器
  perplexity.ts         Perplexity 适配器
  market.ts             数据源编排 + 冷却
  cache.ts              LRU 缓存 / 去重 / SWR
  format.ts             数字与时间格式化
  http.ts               路由公共工具
```

## 免责声明

本项目仅用于学习与研究，行情数据来自第三方公开接口，可能存在延迟或错误，不构成任何投资建议。
