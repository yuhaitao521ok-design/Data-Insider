# Data Insider · 美股多周期行情

一个开箱即用的美股行情看板：从 **Yahoo Finance** 获取多周期报价与走势，失败时自动降级到 **Nasdaq** 官方接口，并可选用 **Perplexity** 生成带引用来源的 AI 解读。

> 纯前后端一体项目（Next.js App Router），无需数据库，无需 API Key 即可运行。

![tech](https://img.shields.io/badge/Next.js-15-black) ![tech](https://img.shields.io/badge/TypeScript-5-blue) ![tech](https://img.shields.io/badge/Tailwind%20CSS-4-38bdf8)

## 功能

- **8 种周期**：1D / 5D / 1M / 3M / 6M / 1Y / 5Y / MAX，自动选择合适的数据粒度（分钟 / 日 / 周 / 月）
- **可切换 K 线间隔**：每个周期可从 1/2/5/15/30/60/90 分钟、5 日线、日线、周线、月线、季线中选择数据源实际支持的粒度，选择按周期记忆
- **自选股**：默认 8 只热门标的，最多 **50 只**，支持搜索添加（含中文别名）、移除；列表超出可视高度时在侧栏内滚动，支持**标签分组**、**鼠标拖动排序**与**按涨跌幅排序**，顺序 / 分组 / 排序状态持久化到 localStorage
- **实时刷新**：报价 30 秒轮询、分时图 60 秒轮询，可一键暂停；自选股列表带迷你走势
- **盘前 / 盘后 / 夜盘**：自动识别当前交易时段（盘前 / 交易中 / 盘后 / 夜盘 / 已收盘），盘前盘后价格与涨跌幅直接生效在报价、自选股与排序上；1D 分时图带盘前盘后阴影与淡化 K 线
- **专业走势图**：纯 SVG 实现（无图表库依赖），支持折线 / 蜡烛（K 线）一键切换、十字光标、跟随鼠标的悬浮明细（自动避让边界，含当根 K 线涨跌额与涨跌幅）、成交量、昨收参考线
- **图表缩放**：鼠标滚轮以指针为中心放大 / 缩小 K 线（最少 12 根），Shift + 滚轮平移，双击或点右上角「已放大」按钮复位；缩放后指标、提醒线、盘前盘后阴影都跟着重算
- **技术指标**：一键添加 MACD / RSI / BOLL，支持自定义参数；MACD、RSI 为副图，BOLL 叠加主图，指标配置持久化
- **价格提醒**：为任意标的设定「涨到 / 跌破」目标价，价格穿越时弹出页面提示 +（可选）浏览器通知，提醒线与状态持久化到 localStorage
- **市场全景（右栏）**：板块热力图（11 个 SPDR 行业 ETF，按涨跌幅上色）+ 跨资产（VIX / 美债 10 年 / 美元指数 / 黄金 / 原油 / BTC），点击板块可直接看走势
- **技术面摘要**：图表下方自动给出结论（偏多 / 中性 / 偏空）+ 均线排列、RSI、BOLL 位置、量比、ATR、52 周位置、连涨连跌（固定参数、无需手动加指标）
- **全球指数概览**：美股（标普 500 / 纳指 100 / 道指 30 / 罗素 2000）+ 亚太（恒生 / 上证 / 沪深 300 / 日经 225 / KOSPI / STI）共 10 个指标，宽卡片 + 迷你走势 + 涨跌幅条，点击即可查看走势；独立 `/api/indices` 接口，单指标失败不影响其它
- **基本面数据**：市值、市盈率 / 预期市盈率、EPS、股息率、Beta、平均成交量、1 年目标价，以及带现价游标的 52 周区间条
- **关键指标**：昨收、今日高低、成交量、区间涨跌 / 高低、52 周区间
- **自选股概览**：一键查看自选股的上涨/下跌家数、平均涨跌幅、最强与最弱标的
- **CSV 导出**：把当前周期 + 间隔的 OHLCV 数据导出为 CSV（含交易所当地时间与 UTC，方便 Excel / Python 分析）
- **多数据源自动降级**：Yahoo → Nasdaq →（可选）Perplexity，页面明确标注来源
- **AI 解读（可选）**：配置 `PERPLEXITY_API_KEY` 后才会显示入口与面板；Perplexity `sonar` 结合最新新闻生成中文解读、要点、风险与引用链接
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

不配置 Perplexity 时，行情功能完全可用，页面不会显示 AI 入口与面板，主界面更简洁。

## API

| 路由 | 说明 |
| --- | --- |
| `GET /api/quotes?symbols=AAPL,MSFT` | 批量报价 + 迷你走势（一次最多 60 个代码，服务端缓存 15s）；每条报价带 `session`（pre/regular/post/overnight/closed）与 `extended`（盘前盘后成交） |
| `GET /api/chart?symbol=AAPL&range=1M&interval=1d` | 指定周期 + 间隔的走势与报价；`range` 取 `1D/5D/1M/3M/6M/1Y/5Y/MAX`，`interval` 见下文「K 线间隔」 |
| `GET /api/markets` | 右栏市场全景：板块 11 个 + 跨资产 6 个（Yahoo → Nasdaq 板块 / Sina 黄金原油 兜底，缓存 30s） |
| `GET /api/indices` | 全球指数概览（美股 4 + 亚太 6），Yahoo → Nasdaq（美股）/ Sina（亚太与美股备用）多级兜底，缓存 30s |
| `GET /api/search?q=英伟达` | 代码 / 公司名搜索（Yahoo 不可用时回退到内置热门列表） |
| `GET /api/fundamentals?symbol=AAPL` | 基本面指标（Yahoo `quoteSummary`，失败时退到 Nasdaq summary + dividends；缓存 10 分钟） |
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
- **涨跌幅口径**：所有报价的 `price / previousClose / change / changePercent` 都经 `lib/quote.ts:reconcileChange()` 归一化，优先用「上一个交易日收盘」重算，保证三个数字自洽；`chartPreviousClose`（区间起点前一日收盘）绝不参与涨跌幅计算。
- **报价以 `/api/quotes` 为准**：图表接口返回的 `quote` 可能来自更早的缓存（甚至上一个交易日），只用于补齐缺失标的，不会覆盖批量报价——否则会出现「切换周期后涨跌幅退回上一个交易日」的问题。
- **盘前 / 盘后**：Yahoo 侧在 spark 之后额外请求一次 `v7/finance/quote`（带 crumb，一次覆盖全部代码）补充 `marketState` 与 `preMarket*` / `postMarket*`；该请求失败时静默降级，只失去时段信息，不影响报价。Nasdaq 侧由 `marketStatus` + `primaryData/secondaryData` 直接得到。
- Nasdaq 的成交时间（如 `Oct 28, 2026 9:33 AM ET`）由 `parseEasternTimestamp()` 解析为 UTC（自动处理夏令时），页面因此能显示真实的「美东时间」而不是 `--`。
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

- 所有操作都在「指标」菜单内完成：点「添加」立即生效，点「参数」在该指标下方展开输入框，点「移除」删除；不再在图表工具栏显示指标标签
- 参数带范围与交叉校验（如慢线必须大于快线、超买必须大于超卖），支持「重置默认」
- 指标选择与参数写入 `localStorage`，刷新后自动恢复
- 若当前周期数据点不足（例如 1M 只有约 22 个点，而 MACD 需要 34 个），图表上方会提示并给出「切换到更长周期」按钮
- 计算全部在浏览器完成（`lib/indicators.ts`），不新增接口请求，也不依赖第三方指标库

## 盘前 / 盘后 / 夜盘

页面会自动判断交易所当前所处的时段，并用不同颜色的徽标标出来：

| 时段 | 徽标 | 数据来源 | 说明 |
| --- | --- | --- | --- |
| 盘前 04:00–09:30 ET | 琥珀色「盘前」 | Yahoo `v7/finance/quote` 的 `preMarket*`、Nasdaq `marketStatus=Pre-Market` 的 `primaryData` | 价格、涨跌幅、成交量、成交时间齐全 |
| 交易中 09:30–16:00 ET | 绿色「交易中」 | 常规报价 | 与普通行情一致 |
| 盘后 16:00–20:00 ET | 紫色「盘后」 | Yahoo `postMarket*`、Nasdaq `marketStatus=After-Hours` | 同上 |
| 夜盘 20:00–04:00 ET | 天蓝「夜盘」 | 只能识别时段（Yahoo `marketState=POSTPOST`） | 两家免费源都不提供夜盘逐笔价格，此时展示上一个常规收盘价，徽标只表示「现在是夜盘」 |
| 已收盘 | 灰色「已收盘」 | — | 周末 / 节假日 |

细节：

- **数值口径**：盘前 / 盘后时，报价主字段（`price / change / changePercent / marketTime`）直接切换成该时段的最新成交，涨跌基准是**上一个常规收盘价**，因此列表里的「盘前 −1.95%」与主价格、涨跌幅排名始终一致（`lib/quote.ts:reconcileChange()` 保证三者自洽）。
- **怎么拿到**：Yahoo 走 `v7/finance/quote`（需要 crumb，`lib/yahoo-auth.ts` 自动握手并缓存 30 分钟，一次请求覆盖全部自选股）；crumb 不可用时静默降级，不影响主行情。Nasdaq 的 `info` 接口本身就区分 `primaryData`（当前时段）与 `secondaryData`（上一个常规收盘），无需额外请求。
- **分时图**：1D 的分钟线请求带 `includePrePost=true`，盘前 / 盘后区间画淡色阴影 + 虚线分界 + 「盘前」「盘后」标签，K 线模式下扩展时段的蜡烛透明度降到 0.45；悬浮面板的时间前会加上「盘前 / 盘后」小标签。时段范围来自 Yahoo chart 的 `currentTradingPeriod`，随 `/api/chart` 的 `sessions` 字段下发。
- **徽标位置**：页面顶部状态条、行情卡片标题旁（含美东时间与成交量）、自选股每行（仅盘前/盘后/夜盘时显示）。
- 记住：盘前盘后成交量小、价格跳动大，仅供盘感参考。

## 市场全景（右栏）与三栏布局

屏幕 ≥1280px 时页面变成三栏 `300px 自选股 | 主内容 | 320px 市场全景`；1024–1279px 时右栏自动落到主内容下方（板块热力图会铺成 3 列），手机端顺序不变。

| 模块 | 内容 | 数据来源 |
| --- | --- | --- |
| **跨资产** | VIX、美债 10 年（按百分比显示）、美元指数、黄金、原油 WTI、比特币，带迷你走势；**点击任意一行即切换为该标的走势**，选中行高亮 | Yahoo spark（一次批量）；Yahoo 不可用时黄金 / 原油退到 Sina，其余留 `--`。走势同样只有 Yahoo 提供，失败时图表下方会说明原因 |
| **板块热力** | 11 个 SPDR 行业 ETF（XLK/XLC/XLY/XLP/XLF/XLV/XLI/XLE/XLB/XLU/XLRE），底色按涨跌幅深浅着色，点击切换为该标的 | Yahoo spark；不可用时退到 Nasdaq |

- 两者合并成一个 `/api/markets` 请求（17 个代码，30 秒刷新），失败时右栏显示「点击重试」，不影响主行情
- 配色用 `color-mix(in srgb, var(--positive|--negative) N%, transparent)`，深浅随涨跌幅线性变化（±3% 封顶）

## 技术面摘要

图表下方常驻一张「技术面」卡片，**不需要手动添加指标**，参数固定（MA5/20/60、RSI14、BOLL20、ATR14）：

- 顶部：结论徽标（偏多 / 中性 / 偏空）+ 分值（−100 ~ +100）+ 一条以 0 为中点的条形
- 明细：均线排列、RSI 状态、BOLL 位置（含带宽）、量比（对比 20 日均量）、ATR 波动率、距 52 周高/低、连涨连跌
- 与图表指标的区别：图表指标是逐点数值（要自己判读），摘要给的是**结论**，且包含指标菜单里没有的 ATR、量比、连涨天数、52 周位置
- 数据点不足 20 根时提示「切换更长周期」，切周期会自动重算
- 计算在 `lib/technical.ts`（复用 `lib/indicators.ts` 的 sma / rsi / bollinger），零额外请求

## 全球指数概览

页面顶部的宽卡片区域，一次展示 10 个指标（数据来自 `/api/indices`，30 秒刷新，与自选股请求完全独立）：

| 分组 | 指标 | 代码 |
| --- | --- | --- |
| 美股 | 标普 500 / 纳斯达克 100 / 道琼斯 30 / 罗素 2000 | `SPY` / `QQQ` / `DIA` / `IWM` |
| 亚太 | 恒生指数 / 上证指数 / 沪深 300 / 日经 225 / 韩国综合 / 新加坡 STI | `^HSI` / `000001.SS` / `000300.SS` / `^N225` / `^KS11` / `^STI` |

每张卡片包含：中文名 + 代码、现价、涨跌幅、当日迷你走势，底部还有一条随涨跌幅伸缩的彩色条；有数据就会显示，拿不到则显示 `--`（不影响其它卡片）。点击卡片即可把该指标切为当前标的查看走势。

### 数据源与兜底

```
/api/indices ──▶ Yahoo spark（一次拿全部 10 个，含迷你走势）
                   │ 429 / 5xx / 漏数据
                   ├─▶ 美股 4 个：Nasdaq info（按 ETF assetclass，瞬时错误自动重试一次）
                   └─▶ 亚太 + 美股兜底：Sina 快照（gb_spy / int_hangseng / sh000001 …）
```

- **DIA 曾长期刷不出来**：旧实现把指数混在自选股的批量请求里，Nasdaq 对部分 ETF 返回 `Error while calling vendor` 时该卡片就一直是空的，只有点击（触发图表请求）才会补上。现在指数走独立接口，并且有 Nasdaq → Sina 两级兜底，DIA 稳定有数据。
- `lib/sina.ts` 把新浪返回的 GBK 文本解析成统一 `Quote`（美股 `gb_*`、全球指数 `int_*`、A 股指数 `sh*` 三种字段格式），时间从北京时间转 ISO。
- Sina 只用于兜底 **恒生 / 上证 / 沪深 300 / 美股 4 个 ETF**（与 Yahoo 点位完全一致）；KOSPI、STI、日经只有 Yahoo 能提供，Yahoo 不可用时这几张卡片显示 `--`。
- 特别说明：Sina 的 `int_nikkei` 长期停在旧值（与 Yahoo `^N225` 相差约 30%），因此日经**不使用** Sina 兜底，宁可留空也不显示错误点位。
- 所有 Yahoo 请求共用一个并发闸门（最多 2 并发 + 150ms 间隔），避免一次页面加载的突发请求触发 429。

## 自选股面板

左侧自选股列表在桌面端是 sticky 侧栏，内容超出可视高度时**在列表内部滚动**（表头与页脚固定，滚动条为细样式 `scroll-thin`）。

- **上限 50 只**：达到上限后搜索添加会弹出「自选股已满」提示（不再静默丢弃），标题旁的数量徽标会变成 `50/50` 并高亮；移除一只即可继续添加
- **分段请求**：自选股超过 25 只时，前端把 `/api/quotes` 拆成多段并发请求，某一段失败不影响其它段的数据展示，缺失的代码 1.2 秒后单独补拉
- **拖动排序**：按住任意标的上下拖动即可调整顺序（移动超过 6px 才算拖动，不影响单击切换标的）；拖动时源项半透明、目标位置高亮，松手后立即生效并写入 localStorage
- **行内快速添加**：标题栏「＋」展开输入框，填代码或公司名时**实时显示候选**（代码 / 公司名 / 交易所 · 类型）：
  - 候选里会标出**是否已在自选股**以及**所属分组**（如 `已在 · 科技`），新标的显示「加入」，避免重复添加
  - 点候选或 ↓↑ + 回车即可按当前选中的分组加入；直接输入合法代码回车仍可强制添加
  - 候选 = `/api/search` 结果 + **本地内置清单**（常见美股 / 指数 / 板块，含中文别名）合并去重；即使搜索接口超时或限流，输入 `AAPL`、`苹果`、`恒生` 也能立刻看到结果
  - 搜索请求 8 秒超时会中断并提示「搜索超时」，不会一直卡在「搜索中…」；接口报错时提示「搜索接口暂时不可用」，仍可直接回车添加
- **标签分组**：标题栏「分组」新建分类（最多 12 个、名称 ≤ 12 字），点行内代码旁的标签把标的归类；分组标题可折叠、重命名、删除（删除后标的回到「未分组」不会丢）；**把标的拖到别的分组的行上会同时换组并调整位置**，拖到分组标题则归入该组末尾；「按涨跌幅排序」在每个分组内部生效
- 左栏底部的「分组表现」会按分组统计平均涨跌幅与成员数量（只统计有报价的标的）
- 分组在桌面端展示（移动端列表仍是横向滚动，但标签照常显示）。分组与归属分别存在 `data-insider:watchlist-groups:v1` / `data-insider:watchlist-group-map:v1`
- **按涨跌幅排序**：表头的「涨跌幅 ↕」按钮循环切换 `手动 → 涨跌幅降序 ↓ → 涨跌幅升序 ↑ → 手动`，没有报价的标的始终排在最后；排序状态也持久化
- 在自动排序状态下拖动任意标的，会把当前展示顺序**固化**为新的手动顺序并退出自动排序，避免「刚排好又被刷新打乱」
- 拖动期间冻结列表顺序（轮询刷新不会让列表在指针下跳动）；触摸设备保留原生滚动，不做拖拽
- 相关逻辑在 `lib/watchlist.ts`（`sortWatchlist` / `moveItem` / `dropIndexAt`），纯函数便于测试

## K 线（蜡烛图）切换

图表工具栏最左侧是「折线 / K线」二选一：折线模式保留渐变面积图，K 线模式按 OHLC 绘制实体 + 影线（收盘 ≥ 开盘为绿，反之为红）。

- 蜡烛几何由 `lib/chart.ts` 的 `buildCandles()` 计算，实体宽度按点密度自适应（1–14px），十字线与悬浮明细在两种模式下都可用
- 悬浮明细头部按当前数据点显示涨跌幅徽标（红/绿 + 方向箭头），价格旁边显示涨跌额；基准是**上一根收盘价**，分时首根用昨收、其它周期首根用当根开盘价（`lib/chart.ts:barChange()`）
- 缺少 OHLC 的分钟级数据点会用收盘价兜底，不会出现空洞；价格轴自动把当根最高 / 最低价纳入区间
- 选择结果写入 `localStorage`（`data-insider:chart-mode:v1`），刷新后保持

## 图表缩放与平移

任意周期都可以缩放 / 平移：

| 操作 | 效果 |
| --- | --- |
| **滚轮向上 / 向下** | 以鼠标指针为锚点放大 / 缩小（可视 12 根为下限） |
| **按住图表左右拖拽** | 平移视窗（拖动时光标变抓手，拖拽期间不弹悬浮明细） |
| **Shift + 滚轮** | 平移（跨度不变） |
| **移动端双指捏合** | 捏合中心为锚点缩放（`touch-action: none`，避免和页面手势打架） |
| **双击图表** 或右上角「重置」 | 复位到全量 |

- 放大时右上角显示**当前可视区间 + 根数**（如 `08-01 ~ 09-15 · 24/60`）
- 缩放只改变可视下标区间并重新计算几何（不是 viewBox 拉伸），线宽、字号不会变形
- 叠加指标（BOLL）、副图（MACD / RSI）、成交量、提醒线、盘前盘后阴影、悬浮明细的指标数值都按同一窗口切片
- 换周期 / 换间隔 / 换标的会自动复位；数据点少于 24 根时不启用缩放
- 视窗变化会清掉旧的悬浮状态，避免下标越界（早期版本的崩溃点）
- 拖拽加固：鼠标按下会 `preventDefault` + 容器 `select-none`（避免第二次拖拽变成「拖动选中的文字」）；`pointerup / pointercancel` 同时在 `window` 上监听，拖到图表外松手也能正确收尾；鼠标按下时会清掉残留的鼠标指针，捏合只认 **两个 touch/pen 指针**，不会被误判

## 价格提醒

图表工具栏的「提醒」按钮打开当前标的的提醒面板：

- 选择「涨到 / 跌破」+ 目标价即可新增（默认填入现价），提醒以虚线画在主图上
- 轮询拿到新报价时比较「上一次观察状态」和当前状态，**只在不满足 → 满足的瞬间触发一次**，避免打开页面就误报
- 触发后右下角弹出 toast，并在已授权时发送浏览器通知；面板里显示「已触发」的时间和现价，点「重开」可重新生效
- 全部提醒（含触发状态）保存在 `data-insider:alerts:v1`，纯前端实现，不新增接口请求

## 基本面数据

图表下方的「基本面」卡片展示市值、市盈率（TTM）、预期市盈率、EPS（TTM）、股息率、Beta、平均成交量、1 年目标价，以及带现价游标的 52 周区间条。

- 数据来自 `/api/fundamentals`：优先 Yahoo `quoteSummary`（需要 crumb，服务端自动完成 A3 Cookie 握手并缓存 30 分钟）
- Yahoo 不可用时退回 Nasdaq `/quote/{symbol}/summary` + `/dividends`（拿到市值、PE、股息率、52 周区间等）；该接口没有原生 EPS 字段，会用「现价 ÷ 市盈率」等价推算，并在数值后标 `*`
- 结果按代码缓存 10 分钟，切换标的时才重新请求



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
    fundamentals/route.ts 基本面（市值 / 估值 / 分红）
    insight/route.ts    Perplexity AI 解读
    config/route.ts     功能开关探测
components/
  Dashboard.tsx         主面板（状态、轮询、自选股、导航）
  PriceChart.tsx        SVG 走势图（折线 / K 线）
  Sparkline.tsx         迷你走势
  SearchBox.tsx         搜索下拉
  InsightPanel.tsx      AI 解读卡片
  IndicatorControls.tsx 指标添加 / 参数设置
  IntervalSelect.tsx     K 线间隔下拉
  IndexOverview.tsx     全球指数概览（美股 + 亚太，10 张卡片）
  SessionBadge.tsx      交易时段徽标（盘前 / 交易中 / 盘后 / 夜盘）
  GroupPicker.tsx       自选股分组选择器（行内弹层）
  SectorHeatmap.tsx     板块热力图
  CrossAssetPanel.tsx   跨资产面板
  TechnicalSummaryCard.tsx 技术面摘要卡片
  GroupSummary.tsx      分组表现（左栏底部）
  PriceAlerts.tsx       价格提醒弹层
  AlertToasts.tsx       提醒 toast
  FundamentalsCard.tsx  基本面卡片
  ThemeToggle.tsx       亮/暗主题切换
lib/
  types.ts              共享类型 + 周期配置
  chart.ts              K 线几何计算
  alerts.ts             价格提醒（穿越判定 / 校验 / 持久化）
  watchlist.ts          自选股排序 / 拖拽移动 / 落点计算
  index-groups.ts       全球指数定义（代码 / 中文名 / 货币）
  markets.ts            板块热力 + 跨资产（右栏）数据编排
  technical.ts          技术面摘要计算（均线 / RSI / BOLL / 量比 / ATR / 连涨）
  indices.ts            指数编排（Yahoo → Nasdaq / Sina 兜底）
  sina.ts               新浪财经指数与美股 ETF 兜底适配器
  quote.ts              涨跌口径归一化 + 美东时间解析
  session.ts            交易时段识别（盘前 / 盘后 / 夜盘）与文案
  yahoo-auth.ts         Yahoo crumb 授权（基本面 / 盘前盘后共用）
  fundamentals.ts       基本面数据编排（Yahoo crumb + Nasdaq 兜底）
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
