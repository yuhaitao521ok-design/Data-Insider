import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateHoldings,
  buildQuarterChanges,
  computePositionChanges,
  detectValueScale,
  parseInformationTable,
  recent13FFilings,
} from "@/lib/institutions";
import { HISTORY_SIZE, pushHistory, sanitizeHistory } from "@/lib/backtest-history";

const XML_PLAIN = `<?xml version="1.0" encoding="UTF-8"?>
<informationTable>
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>72000000000</value>
    <shrsOrPrnAmt><sshPrnamt>300000000</sshPrnamt></shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>COCA COLA CO</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>191216100</cusip>
    <value>26000000000</value>
    <shrsOrPrnAmt><sshPrnamt>400000000</sshPrnamt></shrsOrPrnAmt>
  </infoTable>
</informationTable>`;

const XML_NS1 = `<?xml version="1.0" encoding="UTF-8"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <ns1:infoTable>
    <ns1:nameOfIssuer>BANK AMERICA CORP</ns1:nameOfIssuer>
    <ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>060505104</ns1:cusip>
    <ns1:value>41000000000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>1030000000</ns1:sshPrnamt></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
</ns1:informationTable>`;

test("parseInformationTable：解析无命名空间的 13F XML", () => {
  const holdings = parseInformationTable(XML_PLAIN);
  assert.equal(holdings.length, 2);
  // 按市值降序
  assert.equal(holdings[0].issuer, "APPLE INC");
  assert.equal(holdings[0].value, 72_000_000_000);
  assert.equal(holdings[0].shares, 300_000_000);
  assert.equal(holdings[1].issuer, "COCA COLA CO");
  assert.equal(holdings[0].cusip, "037833100");
});

test("parseInformationTable：兼容 ns1: 前缀", () => {
  const holdings = parseInformationTable(XML_NS1);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].issuer, "BANK AMERICA CORP");
  assert.equal(holdings[0].value, 41_000_000_000);
});

test("parseInformationTable：返回全量并按市值降序（不再截断）", () => {
  const many = Array.from(
    { length: 260 },
    (_, i) =>
      `<infoTable><nameOfIssuer>ISSUER ${i}</nameOfIssuer><cusip>${i}</cusip><value>${(i + 1) * 100000}</value><shrsOrPrnAmt><sshPrnamt>${(i + 1) * 2000}</sshPrnamt></shrsOrPrnAmt></infoTable>`,
  ).join("");
  const holdings = parseInformationTable(`<informationTable>${many}</informationTable>`);
  assert.equal(holdings.length, 260);
  assert.equal(holdings[0].value, 260 * 100000);
});

test("detectValueScale：按隐含价格区分美元 / 千美元申报", () => {
  // 美元申报：value / shares ≈ 真实股价
  assert.equal(
    detectValueScale([
      { value: 200_000, shares: 1000 },
      { value: 500_000, shares: 2000 },
    ]),
    1,
  );
  // 千美元申报：value / shares ≈ 股价 / 1000
  assert.equal(
    detectValueScale([
      { value: 200, shares: 1000 },
      { value: 500, shares: 2000 },
    ]),
    1000,
  );
  // 无有效样本时按美元处理
  assert.equal(detectValueScale([{ value: null, shares: null }]), 1);
});

test("detectValueScale：可转债样本不污染单位判定（Oaktree 场景）", () => {
  // SH 行隐含价正常（美元申报），PRN 行（可转债）隐含价 ~0.9 会拉低中位数
  const mixed = [
    { value: 1_011_873_350, shares: 1_355_000, type: "SH" }, // ≈ $747
    { value: 651_714_000, shares: 885_000, type: "SH" }, // ≈ $736
    { value: 127_235_018, shares: 331_117, type: "SH" }, // ≈ $384
    { value: 47_112_990, shares: 53_306_000, type: "PRN" }, // 可转债 ≈ 0.88
    { value: 61_161_623, shares: 66_836_000, type: "PRN" }, // ≈ 0.91
    { value: 16_098_796, shares: 17_474_000, type: "PRN" }, // ≈ 0.92
  ];
  assert.equal(detectValueScale(mixed), 1, "应判为美元申报（×1 会误放大 1000 倍）");

  // 千美元申报 + 可转债混合：SH 行隐含价 < 2 → 仍应判为千美元
  const mixedThousands = mixed.map((item) =>
    item.type === "SH" ? { ...item, value: item.value / 1000 } : item,
  );
  assert.equal(detectValueScale(mixedThousands), 1000);
});

test("parseInformationTable：千美元申报自动归一到美元", () => {
  // 模拟 Baupost 式申报：value 是千美元（隐含价格 0.2）
  const xml = `<informationTable>
    <infoTable><nameOfIssuer>AMAZON COM INC</nameOfIssuer><cusip>023135106</cusip><value>892310</value><shrsOrPrnAmt><sshPrnamt>3743854</sshPrnamt></shrsOrPrnAmt></infoTable>
    <infoTable><nameOfIssuer>AON PLC</nameOfIssuer><cusip>037389109</cusip><value>227871</value><shrsOrPrnAmt><sshPrnamt>687000</sshPrnamt></shrsOrPrnAmt></infoTable>
  </informationTable>`;
  const holdings = parseInformationTable(xml);
  assert.equal(holdings.length, 2);
  // 归一后隐含价格回到真实量级（≈ $238 / $332）
  const amazon = holdings.find((h) => h.issuer === "AMAZON COM INC")!;
  assert.ok(Math.abs((amazon.value! / (amazon.shares as number)) - 238) < 2);
  assert.equal(amazon.value, 892_310_000);
});

test("parseInformationTable：美元申报保持原值", () => {
  const xml = `<informationTable>
    <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>23300000000</value><shrsOrPrnAmt><sshPrnamt>116500000</sshPrnamt></shrsOrPrnAmt></infoTable>
    <infoTable><nameOfIssuer>COCA COLA CO</nameOfIssuer><cusip>191216100</cusip><value>26000000000</value><shrsOrPrnAmt><sshPrnamt>400000000</sshPrnamt></shrsOrPrnAmt></infoTable>
  </informationTable>`;
  const holdings = parseInformationTable(xml);
  assert.equal(holdings[0].issuer, "COCA COLA CO");
  assert.equal(holdings[0].value, 26_000_000_000);
  assert.equal(holdings[1].value, 23_300_000_000);
});

test("parseInformationTable：同一 CUSIP 的多条 otherManager 明细合并为一条（伯克希尔苹果场景）", () => {
  const xml = `<informationTable>
    <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>200237120</value><shrsOrPrnAmt><sshPrnamt>692000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
    <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>1111142400</value><shrsOrPrnAmt><sshPrnamt>3840000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
    <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>17808079008</value><shrsOrPrnAmt><sshPrnamt>61542988</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
    <infoTable><nameOfIssuer>COCA COLA CO</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>191216100</cusip><value>26000000000</value><shrsOrPrnAmt><sshPrnamt>400000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
  </informationTable>`;
  const holdings = parseInformationTable(xml);
  assert.equal(holdings.length, 2, "同一 CUSIP 应只保留一条");
  const apple = holdings.find((item) => item.cusip === "037833100")!;
  assert.equal(apple.issuer, "APPLE INC");
  assert.equal(apple.shares, 692_000 + 3_840_000 + 61_542_988);
  assert.equal(apple.value, 200_237_120 + 1_111_142_400 + 17_808_079_008);
  // 总市值保持全量口径（合并前后一致）
  const total = holdings.reduce((sum, item) => sum + (item.value ?? 0), 0);
  assert.equal(total, 200_237_120 + 1_111_142_400 + 17_808_079_008 + 26_000_000_000);
});

test("aggregateHoldings：普通股与 CALL/PUT 期权不合并", () => {
  const holdings = [
    { issuer: "APPLE INC", titleOfClass: "COM", cusip: "037833100", shares: 100, value: 20000, type: "SH", putCall: null },
    { issuer: "APPLE INC", titleOfClass: "COM", cusip: "037833100", shares: 50, value: 10000, type: "SH", putCall: null },
    { issuer: "APPLE INC", titleOfClass: "COM", cusip: "037833100", shares: 10, value: 5000, type: "SH", putCall: "CALL" },
    { issuer: "APPLE INC", titleOfClass: "COM", cusip: "037833100", shares: 8, value: 3000, type: "SH", putCall: "PUT" },
  ];
  const merged = aggregateHoldings(holdings);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((item) => item.putCall === null)!.shares, 150);
  assert.equal(merged.find((item) => item.putCall === "CALL")!.shares, 10);
  assert.equal(merged.find((item) => item.putCall === "PUT")!.shares, 8);
});

test("aggregateHoldings：缺失 CUSIP 时按发行人 + 类别 + 期权方向聚合", () => {
  const merged = aggregateHoldings([
    { issuer: "SOME FUND", titleOfClass: "COM", cusip: "", shares: 100, value: 1000, type: "SH" },
    { issuer: "SOME FUND", titleOfClass: "COM", cusip: "", shares: 200, value: 2000, type: "SH" },
    { issuer: "SOME FUND", titleOfClass: "NOTE", cusip: "", shares: 300, value: 3000, type: "PRN" },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.titleOfClass === "COM")!.shares, 300);
  assert.equal(merged.find((item) => item.titleOfClass === "NOTE")!.shares, 300);
});

const holding = (
  issuer: string,
  cusip: string,
  shares: number,
  value: number,
  extra: { putCall?: string | null; titleOfClass?: string } = {},
) => ({
  issuer,
  titleOfClass: extra.titleOfClass ?? "COM",
  cusip,
  shares,
  value,
  type: "SH",
  putCall: extra.putCall ?? null,
});

test("parseInformationTable：解码 issuer 中的 XML 实体", () => {
  const xml = `<informationTable>
    <infoTable><nameOfIssuer>STATE STR SPDR S&amp;P 500 ETF T</nameOfIssuer><titleOfClass>TR UNIT</titleOfClass><cusip>78462F103</cusip><value>3973046405</value><shrsOrPrnAmt><sshPrnamt>5320308</sshPrnamt></shrsOrPrnAmt></infoTable>
  </informationTable>`;
  const holdings = parseInformationTable(xml);
  assert.equal(holdings[0].issuer, "STATE STR SPDR S&P 500 ETF T");
});

test("parseInformationTable：兼容 SEC 完整提交 .txt（含 SEC 头与其他文档）", () => {
  const text = `<SEC-DOCUMENT>0001193125-26-352200.txt : 20260814
<SEC-HEADER>...</SEC-HEADER>
<DOCUMENT><TYPE>XML
<informationTable>
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>200237120</value><shrsOrPrnAmt><sshPrnamt>692000</sshPrnamt></shrsOrPrnAmt></infoTable>
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip><value>1111142400</value><shrsOrPrnAmt><sshPrnamt>3840000</sshPrnamt></shrsOrPrnAmt></infoTable>
</informationTable>
</DOCUMENT></SEC-DOCUMENT>`;
  const holdings = parseInformationTable(text);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].issuer, "APPLE INC");
  assert.equal(holdings[0].shares, 4_532_000);
  assert.equal(holdings[0].value, 1_311_379_520);
});

test("computePositionChanges：区分加仓 / 减仓 / 新建仓 / 清仓 / 不变", () => {
  const previous = [
    holding("APPLE INC", "037833100", 100, 20000),
    holding("COCA COLA CO", "191216100", 50, 5000),
    holding("MICROSOFT CORP", "594918104", 10, 4000),
    holding("APPLE INC", "037833100", 5, 1000, { putCall: "CALL" }),
  ];
  const current = [
    holding("APPLE INC", "037833100", 150, 33000),
    holding("MICROSOFT CORP", "594918104", 10, 4200),
    holding("NVIDIA CORP", "67066G104", 20, 8000),
    holding("APPLE INC", "037833100", 2, 400, { putCall: "CALL" }),
  ];

  const changes = computePositionChanges(current, previous);
  const apple = changes.find((item) => item.cusip === "037833100" && item.putCall === null)!;
  assert.equal(apple.action, "add");
  assert.equal(apple.shareChange, 50);
  assert.equal(apple.changePercent, 50);
  assert.equal(apple.valueChange, 13000);

  const coca = changes.find((item) => item.cusip === "191216100")!;
  assert.equal(coca.action, "exit");
  assert.equal(coca.shares, null);
  assert.equal(coca.changePercent, -100);
  assert.equal(coca.valueChange, -5000);

  const nvidia = changes.find((item) => item.cusip === "67066G104")!;
  assert.equal(nvidia.action, "new");
  assert.equal(nvidia.prevShares, null);
  assert.equal(nvidia.valueChange, 8000);

  const call = changes.find((item) => item.cusip === "037833100" && item.putCall === "CALL")!;
  assert.equal(call.action, "reduce");
  assert.equal(call.changePercent, -60);

  // 股数未变的微软不产生调仓记录
  assert.equal(changes.some((item) => item.cusip === "594918104"), false);
});

test("buildQuarterChanges：最近 3 个季度按新→旧输出，含净买入 / 净卖出", () => {
  const snapshots = [
    {
      quarter: "2026-06-30",
      filedAt: "2026-08-14",
      holdings: [holding("APPLE INC", "A", 150, 30000), holding("NVIDIA CORP", "N", 20, 8000)],
      totalValue: 38000,
    },
    {
      quarter: "2026-03-31",
      filedAt: "2026-05-15",
      holdings: [holding("APPLE INC", "A", 100, 20000), holding("COCA COLA CO", "K", 50, 5000)],
      totalValue: 25000,
    },
    {
      quarter: "2025-12-31",
      filedAt: "2026-02-17",
      holdings: [holding("APPLE INC", "A", 80, 16000), holding("COCA COLA CO", "K", 50, 5000)],
      totalValue: 21000,
    },
  ];

  const quarters = buildQuarterChanges(snapshots);
  assert.equal(quarters.length, 2);
  assert.equal(quarters[0].quarter, "2026-06-30");
  assert.equal(quarters[0].previousQuarter, "2026-03-31");
  assert.equal(quarters[1].quarter, "2026-03-31");
  assert.equal(quarters[1].previousQuarter, "2025-12-31");

  // 2026Q2：苹果加仓 +$10,000，英伟达新建仓 +$8,000；可口可乐清仓 -$5,000
  assert.equal(quarters[0].buysValue, 18000);
  assert.equal(quarters[0].sellsValue, 5000);
  assert.equal(quarters[0].buysCount, 2);
  assert.equal(quarters[0].sellsCount, 1);
  assert.deepEqual(
    quarters[0].buys.map((item) => item.issuer),
    ["APPLE INC", "NVIDIA CORP"],
  );
  assert.equal(quarters[0].sells[0].issuer, "COCA COLA CO");

  // 2026Q1：只有苹果加仓
  assert.equal(quarters[1].buys.length, 1);
  assert.equal(quarters[1].buysValue, 4000);
  assert.equal(quarters[1].sells.length, 0);
  assert.equal(quarters[1].sellsValue, 0);
});

test("buildQuarterChanges：列表最多 8 条但保留完整计数", () => {
  const snapshots = [
    {
      quarter: "2026-06-30",
      filedAt: "2026-08-14",
      holdings: Array.from({ length: 12 }, (_, index) =>
        holding(`NEW ${index}`, `C${index}`, 100, (index + 1) * 1000),
      ),
      totalValue: 78000,
    },
    {
      quarter: "2026-03-31",
      filedAt: "2026-05-15",
      holdings: [],
      totalValue: 0,
    },
  ];

  const [quarter] = buildQuarterChanges(snapshots);
  assert.equal(quarter.buys.length, 8);
  assert.equal(quarter.buysCount, 12);
  assert.equal(quarter.buysValue, 78000);
  assert.equal(quarter.buys[0].issuer, "NEW 11");
});

test("recent13FFilings：只看 13F-HR、忽略修订件并按报告期去重", () => {
  const submissions = {
    filings: {
      recent: {
        form: ["13F-HR/A", "13F-HR", "10-Q", "13F-HR", "13F-HR", "13F-HR"],
        filingDate: [
          "2026-09-01",
          "2026-08-14",
          "2026-08-01",
          "2026-08-14",
          "2026-05-15",
          "2026-02-17",
        ],
        reportDate: ["2026-06-30", "2026-06-30", "2026-06-30", "2026-06-30", "2026-03-31", "2025-12-31"],
        accessionNumber: [
          "a-1",
          "a-2",
          "q-1",
          "a-3",
          "a-4",
          "a-5",
        ],
      },
    },
  };

  const filings = recent13FFilings(submissions, 4);
  assert.deepEqual(
    filings.map((item) => item.accession),
    ["a-2", "a-4", "a-5"],
  );
  assert.equal(filings[0].period, "2026-06-30");
  assert.equal(filings[2].period, "2025-12-31");
  // 限制条数
  assert.equal(recent13FFilings(submissions, 2).length, 2);
});

test("pushHistory：去重、移到最前、忽略非法代码", () => {
  const list = pushHistory([], "AAPL");
  const next = pushHistory(list, "MSFT");
  assert.deepEqual(next, ["MSFT", "AAPL"]);
  assert.deepEqual(pushHistory(next, "AAPL"), ["AAPL", "MSFT"]);
  assert.deepEqual(pushHistory(next, "bad symbol!").length, 2);
});

test("sanitizeHistory：去重并截断到 HISTORY_SIZE", () => {
  const raw = Array.from({ length: HISTORY_SIZE + 5 }, (_, i) => `SYM${i}`).concat([
    "SYM0",
    "",
  ]);
  assert.equal(sanitizeHistory(raw).length, HISTORY_SIZE);
  assert.deepEqual(sanitizeHistory("not-an-array"), []);
});
