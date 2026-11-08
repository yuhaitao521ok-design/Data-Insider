import { test } from "node:test";
import assert from "node:assert/strict";

import { detectValueScale, parseInformationTable } from "@/lib/institutions";
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
