import { test } from "node:test";
import assert from "node:assert/strict";

import { parseInformationTable } from "@/lib/institutions";
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

test("parseInformationTable：超过 200 条会被截断", () => {
  const many = Array.from(
    { length: 260 },
    (_, i) =>
      `<infoTable><nameOfIssuer>ISSUER ${i}</nameOfIssuer><cusip>${i}</cusip><value>${i + 1}</value><shrsOrPrnAmt><sshPrnamt>${i + 1}</sshPrnamt></shrsOrPrnAmt></infoTable>`,
  ).join("");
  const holdings = parseInformationTable(`<informationTable>${many}</informationTable>`);
  assert.equal(holdings.length, 200);
  // 截断前已按市值降序
  assert.equal(holdings[0].value, 260);
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
