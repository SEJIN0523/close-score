import { catalog } from "../data/catalog.js";
// Replace this adapter with a validated investment-engine JSON response later.
export async function getMarket() {
  return {
    status: "disconnected",
    asOf: null,
    stocks: catalog,
    signals: [],
    sectors: [],
    risk: null,
  };
}
export function analysisFor(code) {
  return {
    code,
    asOf: null,
    score: null,
    trend: [],
    support: [],
    risks: [],
    conditions: [],
    quality: { source: null, coverage: 0 },
  };
}
