# Data Insider · 美股多周期行情

一个开箱即用的美股行情看板：从 **Yahoo Finance** 获取多周期报价与走势，失败时自动降级到 **Nasdaq** 官方接口，并可选用 **Perplexity** 生成带引用来源的 AI 解读。

> 纯前后端一体项目（Next.js App Router），无需数据库，无需 API Key 即可运行。

![tech](https://img.shields.io/badge/Next.js-15-black) ![tech](https://img.shields.io/badge/TypeScript-5-blue) ![tech](https://img.shields.io/badge/Tailwind%20CSS-4-38bdf8)

## 功能

- **8 种周期**：1D / 5D / 1M / 3M / 6M / 1Y / 5Y / MAX，自动选择合适的数据粒度（分钟 / 日 / 周 / 月）
- **可切换 K 线间隔**：每个周期可从 1/2/5/15/30/60/90 分钟、5 日线、日线、周线、月线、季线中选择数据源实际支持的粒度，选择按周期记忆
- **自选股**：默认 8 只热门标的，支持搜索添加（含中文别名）、移除，列表持久化到 localStorage
- **实时刷新**：报价 30 秒轮询、分时图 60 秒轮询，可一键暂停；自选股列表带迷你走势
- **专业走势图**：纯 SVG 实现（无图表库依赖），支持十字光标、跟随鼠标的悬浮明细（自动避让边界）、成交量、昨收参考线
- **技术指标**：一键添加 MACD / RSI / BOLL，支持自定义参数；MACD、RSI 为副图，BOLL 叠加主图，指标配置持久化
- **关键指标**：昨收、今日高低、成交量、区间涨跌 / 高低、52 周区间
- **多数据源自动降级**：Yahoo → Nasdaq →（可选）Perplexity，页面明确标注来源
- **AI 解读（可选）**：Perplexity `sonar` 结合最新新闻生成中文解读、要点、风险与引用链接
- **深色行情终端风格**，移动端 / 桌面端自适应
- **亮 / 暗双主题**：跟随系统并可手动切换，选择持久化到 localStorage
- **界面风格参考 [OpenRouter](https://openrouter.ai)**：Roboto / Roboto Mono 字体、细边框卡片、靛紫强调色、克制的留白与字号层级

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
| `GET /api/chart?symbol=AAPL&range=1M&interval=1d` | 指定周期 + 间隔的走势与报价；`range` 取 `1D/5D/1M/3M/6M/1Y/5Y/MAX`，`interval` 见下文「K 线间隔」 |
| `GET /api/search?q=英伟达` | 代码 / 公司名搜索（Yahoo 不可用时回退到内置热门列表） |
| `GET /api/insight?symbol=AAPL&range=1M` | Perplexity AI 解读（未配置 Key 返回 501） |
| `GET /api/config` | 前端探测 AI 功能是否可用 |

示例：

```bash
curl 'http://localhost:3000/api/chart?symbol=NVDA&range=3M&interval=1d' | jq '.meta, (.points | length)'
curl 'http://localhost:3000/api/chart?symbol=NVDA&range=1Y&interval=1wk' | jq '.interval, (.points | length)'
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
- Yahoo 支持分钟/小时/日/周/月/季全部间隔；Nasdaq 只有日线，周/月/季在 `lib/nasdaq.ts` 内由日线聚合。
- Yahoo / Nasdaq 均为公开非官方接口，字段可能变更，请勿用于生产交易决策。

## K 线间隔

图表工具栏的「间隔」下拉会根据当前周期列出数据源支持的粒度，选择按周期记忆（localStorage）。

| 周期 | 可选间隔 |
| --- | --- |
| 1D | 1分 / 2分 / 5分 / 15分 / 30分 / 1小时 / 90分 |
| 5D | 1分 / 2分 / 5分 / 15分 / 30分 / 1小时 / 90分 |
| 1M | 2分 / 5分 / 15分 / 30分 / 1小时 / 90分 / 日线 / 周线 |
| 3M | 1小时 / 日线 / 5日线 / 周线 |
| 6M | 1小时 / 日线 / 5日线 / 周线 |
| 1Y | 1小时 / 日线 / 5日线 / 周线 / 月线 |
| 5Y | 日线 / 5日线 / 周线 / 月线 / 季线 |
| MAX | 日线 / 5日线 / 周线 / 月线 / 季线 |

限制来自 Yahoo Finance chart API（与 yfinance 的校验一致）：

| 间隔 | 最大回溯 |
| --- | --- |
| `1m` | 8 天 |
| `2m` / `5m` / `15m` / `30m` / `90m` | 60 天 |
| `60m`（`1h` 别名） | 730 天 |
| `1d` / `5d` / `1wk` / `1mo` / `3mo` | 不限 |

补充说明：

- `1h` 与 `60m` 等价，统一显示为「1 小时」；`5d` 表示 5 个交易日一根 K 线，仅 Yahoo 提供
- 下拉中带 **Yahoo** 标记的间隔（全部分时 / 小时线）只能由 Yahoo 提供；Nasdaq 兜底只有日线，周线 / 月线 / 季线由日线本地聚合
- 非法组合会被 API 拒绝（400），并返回该周期允许的间隔列表
- 分时/小时线只能使用 Yahoo；Yahoo 限流时会明确提示「该间隔仅 Yahoo 提供」，日线及以上可自动走 Nasdaq 兜底

## 技术指标

图表右上角的「+ 指标」按钮可添加以下指标（同一类型只保留一个实例）：

| 指标 | 位置 | 参数 | 计算方式 |
| --- | --- | --- | --- |
| **MACD** | 副图 | 快线 12、慢线 26、信号 9 | EMA 差值（DIF）、DEA 信号线、柱状图 = DIF − DEA |
| **RSI** | 副图 | 周期 14、超买 70、超卖 30 | Wilder 平滑，0–100，附超买/超卖参考线 |
| **BOLL** | 主图叠加 | 周期 20、标准差倍数 2 | 中轨 SMA + 上下轨 ±k×标准差，带填充色带 |

- 点击指标标签可修改参数，带范围与交叉校验（如慢线必须大于快线、超买必须大于超卖），支持「重置默认」
- 指标选择与参数写入 `localStorage`，刷新后自动恢复
- 若当前周期数据点不足（例如 1M 只有约 22 个点，而 MACD 需要 34 个），图表上方会提示并给出「切换到更长周期」按钮
- 计算全部在浏览器完成（`lib/indicators.ts`），不新增接口请求，也不依赖第三方指标库

## 部署到 Cloudflare Workers

本项目使用 **`@opennextjs/cloudflare`（OpenNext 适配器）** 部署为 Worker + Static Assets，不是 Cloudflare Pages / `next-on-pages`，**不需要**把 API 路由改成 Edge Runtime。

仓库中已包含：

- `wrangler.jsonc`：Worker 入口 `.open-next/worker.js`、`nodejs_compat`、静态资源 `ASSETS` 绑定
- `open-next.config.ts`：OpenNext 构建配置（当前无 ISR，默认配置即可）
- `public/_headers`：`/_next/static/*` 与 `/fonts/*` 长缓存
- `package.json` 脚本：`build:cf` / `preview:cf` / `deploy:cf` / `upload:cf`

### Workers Builds 面板怎么填

| 字段 | 填写 |
| --- | --- |
| Build command | `npm run build:cf` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |

> ⚠️ 默认的 `npm run build` **不对**：它只执行 `next build`，产出 `.next`，不会生成 Cloudflare 需要的 `.open-next/worker.js`，随后的 `wrangler deploy` 会失败。必须改用 `npm run build:cf`（内部会先跑 `next build`，再执行 OpenNext 转换）。
>
> `npx wrangler preview` 是 Wrangler 4 的有效命令（open beta），用于非生产分支创建 Preview URL；如果想生成 Version URL，可改成 `npx wrangler versions upload`。

### 环境变量

在 Worker 的 **Settings → Variables and Secrets** 添加（仅运行时需要，构建阶段不需要）：

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `PERPLEXITY_API_KEY` | Secret | 可选，启用 AI 解读与兜底报价 |
| `PERPLEXITY_MODEL` | Text | 可选，默认 `sonar` |

### 本地与命令行

```bash
cp .dev.vars.example .dev.vars   # 填入 PERPLEXITY_API_KEY（可留空）
npm run preview:cf               # 构建并在本地 Workers 运行时预览
npm run deploy:cf                # 构建并直接部署（需 wrangler login 或 CLOUDFLARE_API_TOKEN）
```

### 注意事项

- 建议使用 **Workers Paid** 计划：免费套餐单请求 10ms CPU，`MAX` 周期解析较大的 JSON 时可能超限；付费为 30s。
- `lib/cache.ts` 是 per-isolate 内存缓存，Workers 上实例更多，命中率低于单实例 Node；如需跨实例缓存，可按 OpenNext 文档接 R2 incremental cache。
- 云厂商出口 IP 可能被 Yahoo / Nasdaq 限流。部署后先访问 `/api/quotes?symbols=AAPL` 验证；若两个源都被封，建议在 `lib/market.ts` 再接入一个带 Key 的数据源（Finnhub / Twelve Data / Polygon）作为第三层兜底。
- Workers 免费计划子请求上限 50/请求，本项目正常情况 ≤ 12 个。

## 部署到 Vercel

1. 将仓库导入 Vercel，框架会自动识别为 Next.js；
2. 在 Project Settings → Environment Variables 添加 `PERPLEXITY_API_KEY`（可选）；
3. Deploy。

也可以部署到任何支持 Node.js 20+ 的平台（需 Node Runtime；Cloudflare Workers 请使用上面的 OpenNext 方案）。

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
  Dashboard.tsx         主面板（状态、轮询、自选股、导航）
  PriceChart.tsx        SVG 走势图
  Sparkline.tsx         迷你走势
  SearchBox.tsx         搜索下拉
  InsightPanel.tsx      AI 解读卡片
  IndicatorControls.tsx 指标添加 / 参数设置
  IntervalSelect.tsx     K 线间隔下拉
  ThemeToggle.tsx       亮/暗主题切换
lib/
  types.ts              共享类型 + 周期配置
  indicators.ts         MACD / RSI / BOLL 计算与校验
  yahoo.ts              Yahoo Finance 适配器
  nasdaq.ts             Nasdaq 兜底适配器
  perplexity.ts         Perplexity 适配器
  market.ts             数据源编排 + 冷却
  cache.ts              LRU 缓存 / 去重 / SWR
  format.ts             数字与时间格式化
  http.ts               路由公共工具
public/
  fonts/                自托管 Roboto / Roboto Mono
  _headers              Cloudflare 静态资源缓存规则
wrangler.jsonc          Cloudflare Worker 配置（OpenNext）
open-next.config.ts     OpenNext 适配器配置
```

## 界面与主题

界面参考 [OpenRouter](https://openrouter.ai) 的设计语言：

- **字体**：Roboto（UI）+ Roboto Mono（价格、涨跌幅、指标），自托管于 `public/fonts`，不依赖外部字体 CDN
- **色板**：中性灰底 + 1px 细边框 + 靛紫 `#6366f1` 强调色（暗色模式为 `#818cf8`），涨跌沿用美股习惯（绿涨红跌）
- **组件**：12px 圆角卡片、分段式周期切换、分隔线网格指标区、行式自选股列表
- **亮 / 暗双主题**：默认跟随系统，右上角可手动切换，选择写入 `localStorage`；`app/layout.tsx` 中的首帧脚本避免主题闪烁

## 免责声明

本项目仅用于学习与研究，行情数据来自第三方公开接口，可能存在延迟或错误，不构成任何投资建议。
