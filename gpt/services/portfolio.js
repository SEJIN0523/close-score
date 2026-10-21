const types = ["buy", "sell", "deposit", "withdraw", "dividend"];
const fail = (message) => {
  throw new Error(message);
};
const money = (n) => Math.round(n * 100) / 100;
export function calculate(initialCash, transactions, quotes = {}) {
  if (!Number.isFinite(initialCash) || initialCash < 0 || initialCash > 1e14)
    fail("초기 현금은 0 이상 100조 이하로 입력하세요.");
  if (!Array.isArray(transactions) || transactions.length > 10000)
    fail("거래 기록 형식 또는 개수를 확인하세요.");
  let cash = initialCash,
    realized = 0,
    dividends = 0,
    netCapital = initialCash;
  const holdings = {},
    ids = new Set();
  const sorted = transactions
    .map((t, i) => ({ ...t, order: i }))
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) || a.order - b.order,
    );
  for (const t of sorted) {
    if (typeof t.id !== "string" || !t.id || ids.has(t.id))
      fail("거래 ID가 없거나 중복되었습니다.");
    ids.add(t.id);
    if (
      !types.includes(t.type) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      !Number.isFinite(Date.parse(t.date)) ||
      new Date(t.date).toISOString().slice(0, 10) !== t.date
    )
      fail("거래 종류와 날짜를 확인하세요.");
    if (t.type === "buy" || t.type === "sell") {
      if (
        !/^\d{6}$/.test(t.code) ||
        !Number.isSafeInteger(t.quantity) ||
        t.quantity <= 0 ||
        !Number.isFinite(t.price) ||
        t.price <= 0 ||
        t.price > 1e12
      )
        fail("6자리 종목코드, 양수 가격, 정수 수량을 입력하세요.");
      const value = money(t.price * t.quantity);
      if (value > 1e14) fail("거래 금액이 허용 범위를 초과했습니다.");
      const h = (holdings[t.code] ||= { code: t.code, quantity: 0, cost: 0 });
      if (t.type === "buy") {
        if (value > cash + 0.001)
          fail(`${t.date}: 매수 금액이 현금보다 많습니다.`);
        cash = money(cash - value);
        h.cost += value;
        h.quantity += t.quantity;
      } else {
        if (t.quantity > h.quantity)
          fail(`${t.date}: 매도 수량이 보유 수량을 초과합니다.`);
        const basis = (h.cost / h.quantity) * t.quantity;
        realized += value - basis;
        h.cost -= basis;
        h.quantity -= t.quantity;
        cash = money(cash + value);
      }
    } else {
      if (!Number.isFinite(t.amount) || t.amount <= 0 || t.amount > 1e14)
        fail("금액은 0보다 크게, 100조 이하로 입력하세요.");
      const amount = money(t.amount);
      if (t.type === "withdraw") {
        if (amount > cash) fail(`${t.date}: 출금액이 현금보다 많습니다.`);
        cash = money(cash - amount);
        netCapital -= amount;
      } else {
        cash = money(cash + amount);
        if (t.type === "deposit") netCapital += amount;
        else dividends += amount;
      }
    }
  }
  const positions = Object.values(holdings)
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const q = quotes[h.code];
      const priced =
        !!q &&
        Number.isFinite(q.price) &&
        q.price > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(q.date);
      const value = priced ? q.price * h.quantity : null;
      return {
        ...h,
        average: h.cost / h.quantity,
        value,
        unrealized: priced ? value - h.cost : null,
        quote: priced ? q : null,
      };
    });
  const complete = positions.every((h) => h.value !== null),
    cost = positions.reduce((s, h) => s + h.cost, 0);
  const equity = complete ? positions.reduce((s, h) => s + h.value, 0) : null;
  const assets = complete ? cash + equity : null,
    unrealized = complete ? equity - cost : null;
  const profit = complete ? realized + dividends + unrealized : null;
  return {
    cash,
    realized,
    dividends,
    netCapital,
    positions,
    cost,
    equity,
    assets,
    unrealized,
    profit,
    returnRate: complete && netCapital > 0 ? (profit / netCapital) * 100 : null,
    complete,
  };
}
