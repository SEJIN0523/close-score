import { defaults, STORAGE_KEY } from "../config/app.js";
import { calculate } from "./portfolio.js";
export function validate(value) {
  if (!value || value.schema !== 1)
    throw Error("PRISM V1 백업 파일이 아닙니다.");
  const s = value.settings;
  if (
    !s ||
    !["dark", "light"].includes(s.theme) ||
    !["full", "compact"].includes(s.number) ||
    !["home", "explore", "portfolio", "settings"].includes(s.home) ||
    !Number.isInteger(s.target) ||
    s.target < 1 ||
    s.target > 100
  )
    throw Error("설정 형식이 올바르지 않습니다.");
  if (
    !Array.isArray(value.watchlist) ||
    !value.watchlist.every((c) => typeof c === "string" && /^\d{6}$/.test(c))
  )
    throw Error("관심종목 형식이 올바르지 않습니다.");
  if (
    !value.quotes ||
    typeof value.quotes !== "object" ||
    Array.isArray(value.quotes)
  )
    throw Error("평가 가격 형식이 올바르지 않습니다.");
  for (const [code, q] of Object.entries(value.quotes))
    if (
      !/^\d{6}$/.test(code) ||
      !q ||
      !Number.isFinite(q.price) ||
      q.price <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(q.date) ||
      !Number.isFinite(Date.parse(q.date)) ||
      new Date(q.date).toISOString().slice(0, 10) !== q.date
    )
      throw Error("평가 가격과 기준일을 확인하세요.");
  calculate(value.initialCash, value.transactions, value.quotes);
  return {
    schema: 1,
    initialCash: value.initialCash,
    transactions: value.transactions.map((t) => ({
      id: t.id,
      type: t.type,
      date: t.date,
      ...(["buy", "sell"].includes(t.type)
        ? { code: t.code, price: t.price, quantity: t.quantity }
        : { amount: t.amount }),
    })),
    watchlist: [...new Set(value.watchlist)],
    quotes: value.quotes,
    settings: {
      theme: s.theme,
      number: s.number,
      home: s.home,
      target: s.target,
    },
  };
}
export function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? validate(JSON.parse(raw)) : defaults();
}
export function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validate(state)));
}
export function backup(state) {
  return JSON.stringify(
    { ...validate(state), exportedAt: new Date().toISOString() },
    null,
    2,
  );
}
export function restore(text) {
  if (text.length > 5000000) throw Error("백업은 5MB 이하만 지원합니다.");
  return validate(JSON.parse(text));
}
