// Diagnostic historical comparisons using scoring/trading.js, also used by the live dashboard.
// node research/sim_final_split.js <market-data-dir> <sim.json> [<study.json>]
const fs = require('node:fs'), T = require('../scoring/trading.js'), loadMarketData = require('./market_data.js');
const engineHash = require('node:crypto').createHash('sha256').update(fs.readFileSync(require.resolve('../scoring/trading.js'))).digest('hex');
const STARTS = ['2023-04-28', '2024-01-02', '2024-10-02', '2025-04-01', '2026-01-02'];
const VARIANTS = {
  '공용 엔진': {},
  '위험 조절 실험': { riskFraction: .01 },
  '업종·현금 실험': { maxSector: .3, maxPosition: .1, cashReserve: .03 },
  '위험·업종·현금 실험': { riskFraction: .01, maxSector: .3, maxPosition: .1, cashReserve: .03 },
};
function metrics(curve, sells, fees, trades, partials) {
  const final = curve.at(-1)[1], years = (new Date(curve.at(-1)[0]) - new Date(curve[0][0])) / 315576e5;
  let peak = 1e8, mdd = 0; for (const [, value] of curve) { peak = Math.max(peak, value); mdd = Math.min(mdd, value / peak - 1); }
  return { final: Math.round(final), ret: final / 1e8 - 1, cagr: years > 0 ? (final / 1e8) ** (1 / years) - 1 : 0, mdd, trades,
    winRate: sells.length ? sells.filter(s => s.pnl > 0).length / sells.length : 0, cost: Math.round(fees), partials };
}
function simulate(market, { from = STARTS[0], form = '새 식', policy = {}, fillFraction = 1 } = {}) {
  const { DAYS, daily, BYTK, DNEW, DIST, list } = market, cal = T.calendar({ sessions: DAYS });
  const names = Object.fromEntries(list.map(([tk, name]) => [tk.slice(0, 6), name])), tickers = Object.fromEntries(list.map(([tk]) => [tk.slice(0, 6), tk]));
  const positions = {}, book = {}, logs = [], curve = [], sells = [], rankHistory = {};
  const ctx = { calendar: cal, ranks: rankHistory }, dist = form === '새 식' ? DNEW : DIST;
  let cash = 1e8, fees = 0, pending = [], partials = 0, id = 0;
  const buyFee = .001, sellFee = .0025, slip = .0005;
  const bar = (code, d) => { const st = BYTK.get(tickers[code]), i = st && st.idx.get(d); return i == null ? null : st.b[i]; };
  const mark = d => {
    for (const [code, pos] of Object.entries(positions)) { const b = bar(code, d); if (b) { pos.lastPrice = b.a; pos.maxP = Math.max(pos.maxP, b.a); } }
    return cash + Object.values(positions).reduce((s, p) => s + p.qty * p.lastPrice, 0);
  };
  for (const d of DAYS.filter(d => d >= from)) {
    if (curve.length) cash *= 1 + .03 / 252;
    for (const order of pending) {
      const b = bar(order.code, d); if (!b) continue; // an unfilled daily plan expires; never execute a stale signal later
      const price = b.a * (order.side === 'buy' ? 1 + slip : 1 - slip);
      let qty = Math.min(order.qty, Math.max(1, Math.floor(order.qty * fillFraction)));
      if (order.side === 'buy') qty = Math.min(qty, Math.floor(cash / (price * (1 + buyFee))));
      else qty = Math.min(qty, positions[order.code]?.qty || 0);
      if (qty <= 0) continue;
      if (qty < order.qty) partials++;
      // Multiple fills of one plan exercise the exact same aggregation used by OCR/manual records.
      const first = fillFraction < 1 && qty > 1 ? Math.floor(qty / 2) : qty;
      for (const q of first === qty ? [qty] : [first, qty - first]) {
        const record = { id: ++id, date: d, code: order.code, side: order.side, price, qty: q };
        if (order.side === 'buy') {
          const pos = positions[order.code] || (positions[order.code] = { qty: 0, avg: 0, cost: 0, firstD: d, lastD: d, maxP: b.a,
            stopPct: order.stopPct ?? -.25, upPct: order.upPct ?? .2, events: [], completedStages: [], lastPrice: b.a });
          pos.avg = (pos.avg * pos.qty + price * q) / (pos.qty + q); pos.qty += q; pos.cost += price * q * (1 + buyFee);
          pos.lastD = d; pos.events.push({ ...record, decision: order.decision });
          cash -= price * q * (1 + buyFee); fees += price * q * buyFee;
        } else {
          const pos = positions[order.code], cost = pos.cost * q / pos.qty, net = price * q * (1 - sellFee), pnl = net - cost;
          pos.qty -= q; pos.cost -= cost; pos.lastD = d; pos.events.push({ ...record, decision: order.decision }); cash += net; fees += price * q * sellFee;
          sells.push({ d, tk: tickers[order.code], side: order.kind === 'trim' ? '일부 매도' : '전량 매도', amt: net, pnl, why: order.why });
          if (!pos.qty) delete positions[order.code];
        }
        logs.push(record);
      }
      if (cash < -.01) throw new Error('Simulation spent unfilled sale proceeds or exceeded actual cash.');
    }
    const equity = mark(d); curve.push([d, Math.round(equity)]);
    for (const [code, pos] of Object.entries(positions)) pos.completedStages = T.completedStages(code, pos, book, logs);
    const day = daily[form].get(d), executionDate = cal.next(d); pending = [];
    if (!day || !executionDate) continue;
    rankHistory[d] = Object.fromEntries([...day.rows].map(([tk, r]) => [tk.slice(0, 6), r.rk]));
    const wanted = new Set([...day.recs.map(tk => tk.slice(0, 6)), ...Object.keys(positions)]), rows = {};
    for (const code of wanted) {
      const tk = tickers[code], st = BYTK.get(tk), b = bar(code, d), ranked = day.rows.get(tk);
      if (!b || !st) continue;
      const v = ranked?.vol < dist.vcut[0] ? 0 : ranked?.vol < dist.vcut[1] ? 1 : 2;
      const cell = dist.cells[`${ranked?.band ?? 4}_${v}`];
      rows[code] = { k: code, n: names[code], s: st.sector, p: b.a, ch: st.idx.get(d) > 0 ? b.c / st.b[st.idx.get(d) - 1].c - 1 : 0,
        rk: ranked?.rk ?? null, stopPct: cell?.stop ?? -.25, upPct: cell?.q[3] ?? .2 };
    }
    for (const [code, pos] of Object.entries(positions)) if (rows[code]) {
      const phase = T.phase(pos, rows[code], d, executionDate, ctx); pos.lastInside40 = phase.lastInside40; pos.splitCancelled = phase.cancelled;
    }
    const result = T.orders({ rows, positions, recs: day.recs.map(tk => tk.slice(0, 6)), cash, equity, slots: 10,
      signalDate: d, executionDate, context: ctx, policy: { buyCost: buyFee, ...policy } });
    pending = result.items; for (const p of pending) book[p.id] = p;
  }
  const stats = metrics(curve, sells, fees, logs.length, partials);
  return { stats, curve, logs, sells, cash, holdings: Object.entries(positions).map(([code, p]) => ({ tk: tickers[code], name: names[code], value: Math.round(p.qty * p.lastPrice), cost: Math.round(p.cost), entryD: p.firstD })) };
}
function main(dataDir, output, studyOutput) {
  if (!dataDir || !output) throw new Error('Usage: node research/sim_final_split.js <data-dir> <sim.json> [study.json]');
  const market = loadMarketData(dataDir);
  if (market.ST.length < 100) throw new Error('Too little market data for a meaningful execution study.');
  console.log(`Loaded ${market.ST.length} stocks; ${market.DAYS.length} exchange sessions.`);
  const runs = {};
  for (const [name, policy] of Object.entries(VARIANTS)) {
    runs[name] = STARTS.map(from => { const r = simulate(market, { from, policy }); console.log(name, from, JSON.stringify(r.stats)); return { from, to: r.curve.at(-1)[0], ...r.stats }; });
  }
  const newer = simulate(market), older = simulate(market, { form: '이전 식' }), stress = simulate(market, { fillFraction: .5 });
  const days = newer.curve.map(([d]) => d), kp0 = market.kospiAt.get(days[0]);
  const kp = days.map(d => [d, Math.round(1e8 * market.kospiAt.get(d) / kp0)]), kpStats = metrics(kp, [], 0, 0, 0);
  const thin = curve => curve.filter((_, i) => i % 3 === 0 || i === curve.length - 1);
  const yearly = curve => { const grouped = {}; for (const [d, value] of curve) grouped[d.slice(0, 4)] = value; let base = 1e8; return Object.entries(grouped).map(([year, value]) => { const ret = value / base - 1; base = value; return [year, ret]; }); };
  const why = {};
  for (const l of newer.logs) { const label = l.side === 'buy' ? '매수 체결' : '매도 체결'; why[label] = (why[label] || 0) + 1; }
  const sim = { engineVersion: T.VERSION, engineHash, from: days[0], to: days.at(-1), years: (new Date(days.at(-1)) - new Date(days[0])) / 315576e5,
    series: { '새 식': thin(newer.curve), '이전 식': thin(older.curve), '코스피 지수': thin(kp) }, stats: { '새 식': newer.stats, '이전 식': older.stats, '코스피 지수': kpStats },
    years_ret: { '새 식': yearly(newer.curve), '코스피 지수': yearly(kp) }, why: Object.entries(why).map(([k, n]) => [k, n, 0]),
    holdings: newer.holdings, cash: Math.round(newer.cash), recent: newer.sells.slice(-25).reverse().map(l => ({ ...l, name: market.list.find(([tk]) => tk === l.tk)?.[1] || l.tk })) };
  const study = { engineVersion: T.VERSION, engineHash, from: days[0], to: days.at(-1), stocks: market.ST.length, scenarios: runs, partialFillStress: stress.stats,
    methodology: ['Same scoring/trading.js execution rules as the dashboard.', 'Only actual cash and executed sale proceeds fund buys; integer model units; next-session closes.',
      'Buy cost 0.1%, sell cost 0.25%, slippage 0.05% each way, cash interest 3% annually.',
      'Total-return adjusted prices are model prices; exact historical lots, dividends, suspensions and auction fills are not reproduced.',
      'Surviving-listed universe; financial availability uses a 92-day proxy; return distributions were calibrated over the research period.',
      'Multiple start dates are sensitivity checks, NOT independent out-of-sample proof. No experimental risk policy is enabled in production.'] };
  fs.writeFileSync(output, JSON.stringify({ ...sim, executionStudy: study }));
  if (studyOutput) fs.writeFileSync(studyOutput, JSON.stringify(study, null, 2) + '\n');
  console.log('Partial-fill stress', JSON.stringify(stress.stats));
}
module.exports = { simulate, main };
if (require.main === module) main(...process.argv.slice(2));
