export const VERSION = "1.0.0";
export const STORAGE_KEY = "prism-v1-state";
export const defaults = () => ({
  schema: 1,
  initialCash: 0,
  transactions: [],
  watchlist: [],
  quotes: {},
  settings: { theme: "dark", number: "full", home: "home", target: 10 },
});
