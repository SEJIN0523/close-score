import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../services/portfolio.js";
import { restore, backup, validate } from "../services/storage.js";
import { defaults } from "../config/app.js";
const trade = (id, type, quantity, price, date = "2026-10-01") => ({
  id,
  type,
  code: "005930",
  quantity,
  price,
  date,
});
const cash = (id, type, amount, date = "2026-10-01") => ({
  id,
  type,
  amount,
  date,
});
test("이동평균 원가, 실현·평가손익, 자산, 수익률", () => {
  const p = calculate(
    10000,
    [
      trade("a", "buy", 10, 100),
      trade("b", "buy", 10, 200),
      trade("c", "sell", 5, 250),
    ],
    { "005930": { price: 180, date: "2026-10-02" } },
  );
  assert.equal(p.cash, 8250);
  assert.equal(p.positions[0].average, 150);
  assert.equal(p.positions[0].quantity, 15);
  assert.equal(p.realized, 500);
  assert.equal(p.unrealized, 450);
  assert.equal(p.assets, 10950);
  assert.equal(p.returnRate, 9.5);
});
test("입출금·배당은 현금과 원금을 구분", () => {
  const p = calculate(1000, [
    cash("a", "deposit", 500),
    cash("b", "withdraw", 200),
    cash("c", "dividend", 50),
  ]);
  assert.equal(p.cash, 1350);
  assert.equal(p.netCapital, 1300);
  assert.equal(p.dividends, 50);
  assert.equal(p.profit, 50);
  assert.ok(Math.abs(p.returnRate - (50 / 1300) * 100) < 1e-10);
});
test("전량 매도 후 재매수 평균 원가", () => {
  const p = calculate(1000, [
    trade("a", "buy", 2, 100),
    trade("b", "sell", 2, 150),
    trade("c", "buy", 1, 200),
  ]);
  assert.equal(p.positions[0].average, 200);
  assert.equal(p.realized, 100);
});
test("시세가 없으면 평가손익과 자산을 만들어내지 않음", () => {
  const p = calculate(1000, [trade("a", "buy", 2, 100)]);
  assert.equal(p.assets, null);
  assert.equal(p.returnRate, null);
  assert.equal(p.positions[0].value, null);
  assert.equal(p.cash, 800);
});
test("초과 매수·초과 매도·초과 출금 차단", () => {
  assert.throws(() => calculate(100, [trade("a", "buy", 2, 100)]), /현금/);
  assert.throws(() => calculate(1000, [trade("a", "sell", 1, 100)]), /보유/);
  assert.throws(() => calculate(100, [cash("a", "withdraw", 101)]), /현금/);
});
test("날짜순 검증, 같은 날짜 입력순 유지, 과거 수정·삭제 차단", () => {
  assert.throws(
    () =>
      calculate(0, [
        cash("d", "deposit", 1000, "2026-10-02"),
        trade("a", "buy", 1, 100),
      ]),
    /현금/,
  );
  assert.throws(
    () =>
      calculate(1000, [trade("b", "sell", 1, 100), trade("a", "buy", 1, 100)]),
    /보유/,
  );
  assert.throws(() => calculate(1000, [trade("s", "sell", 2, 100)]));
});
test("잘못된 숫자·날짜·중복 ID 차단", () => {
  for (const t of [
    trade("a", "buy", 1.5, 100),
    trade("a", "buy", 1, -1),
    trade("a", "buy", 1, NaN),
    trade("a", "buy", 1, 1, "2026-02-30"),
  ])
    assert.throws(() => calculate(1000, [t]));
  assert.throws(() =>
    calculate(1000, [cash("a", "deposit", 1), cash("a", "deposit", 1)]),
  );
});
test("수익률 분모 0, 보유 없을 때 현금 자산", () => {
  const p = calculate(0, []);
  assert.equal(p.assets, 0);
  assert.equal(p.returnRate, null);
});
test("소수 가격의 현금 오차 방지", () => {
  const p = calculate(0.3, [trade("a", "buy", 3, 0.1)]);
  assert.equal(p.cash, 0);
});
test("JSON 백업·복원과 스키마·장부 검증", () => {
  const s = defaults();
  s.initialCash = 1000;
  s.transactions = [trade("a", "buy", 1, 100)];
  s.watchlist = ["005930"];
  assert.deepEqual(restore(backup(s)), s);
  assert.throws(() => restore("{"));
  assert.throws(() => validate({ ...s, schema: 2 }));
  assert.throws(() =>
    restore(
      JSON.stringify({ ...s, transactions: [trade("x", "sell", 2, 100)] }),
    ),
  );
});
