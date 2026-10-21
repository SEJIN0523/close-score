// 가상 1억 운용 시뮬레이션: 매일 장 마감 뒤 자동 점수로 순위를 매기고, 다음 날 종가로 사고판다
// 그 시점에 알 수 있던 정보만 쓴다 (연간 재무는 결산 92일 뒤부터). 수정주가(배당 포함)로 손익 계산
// 사용: node sim.js <scratchpad 폴더> <out.json>
const fs = require('fs');
const { readPx, readFund, valueScore, mean, addDays } = require('./fdata.js');
const [S, OUT] = process.argv.slice(2);
const DIST = JSON.parse(fs.readFileSync(`${S}/dist2.json`, 'utf8'));
const list = fs.readFileSync(`${S}/all_list.txt`, 'utf8').trim().split('\n').map(l => l.split('\t'));
const K = readPx(`${S}/krx/kospi_daily.json`).bars;
const START = '2023-04-28', DAYS = K.filter(x => x.d >= START).map(x => x.d), kospiAt = new Map(K.map(x => [x.d, x.c]));
const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), c01 = v => Math.max(0, Math.min(1, v));

// ── 1) 종목별 일별 지표 미리 계산 ──
const ST = [];
for (const [tk, , sector] of list) {
  const px = readPx(`${S}/allpx/${tk}.json`), fd = readFund(`${S}/allfund/${tk}.json`);
  if (!px || px.bars.length < 300 || !fd || !fd.annualDilutedEPS) continue;
  const b = px.bars, n = b.length, a = b.map(x => x.a), c = b.map(x => x.c);
  const tv = new Float64Array(n), hi = new Float64Array(n), lo = new Float64Array(n), jmp = new Int32Array(n), vol = new Float64Array(n);
  let s = 0; for (let i = 0; i < n; i++) { s += c[i] * b[i].v; if (i >= 20) s -= c[i - 20] * b[i - 20].v; tv[i] = i >= 19 ? s / 20 : 0; }
  const dqh = [], dql = [];
  for (let i = 0; i < n; i++) {
    while (dqh.length && a[dqh[dqh.length - 1]] <= a[i]) dqh.pop(); dqh.push(i); while (dqh[0] <= i - 252) dqh.shift();
    while (dql.length && a[dql[dql.length - 1]] >= a[i]) dql.pop(); dql.push(i); while (dql[0] <= i - 252) dql.shift();
    hi[i] = a[dqh[0]]; lo[i] = a[dql[0]];
  }
  let jc = 0; const J = a.map((x, i) => i > 0 && Math.abs(Math.log(x / a[i - 1])) > Math.log(1.35) ? 1 : 0);
  for (let i = 0; i < n; i++) { jc += J[i]; if (i >= 252) jc -= J[i - 252]; jmp[i] = jc; }
  let s1 = 0, s2 = 0; for (let i = 1; i < n; i++) { const r = Math.log(a[i] / a[i - 1]); s1 += r; s2 += r * r; if (i > 120) { const o = Math.log(a[i - 120] / a[i - 121]); s1 -= o; s2 -= o * o; }
    const m = Math.min(i, 120); vol[i] = m > 60 ? Math.sqrt(Math.max(0, (s2 - s1 * s1 / m) / (m - 1)) * 252) : NaN; }
  ST.push({ tk, sector, b, a, c, tv, hi, lo, jmp, vol, divs: px.divs, fd, idx: new Map(b.map((x, i) => [x.d, i])) });
}
const known2 = (arr, d) => { if (!arr) return [null, null]; let k1 = null, k0 = null; for (const e of arr) if (addDays(e.d, 92) <= d) { k0 = k1; k1 = e; } return [k1, k0]; };
const ttmDiv = (divs, d) => { let s = 0; const f = addDays(d, -365); for (const x of divs) if (x.d > f && x.d <= d) s += x.amt; return s; };

// ── 2) 매일 점수·순위 (월 단위로 재무 갱신, 시세는 매일) ──
console.log(`종목 ${ST.length}, 거래일 ${DAYS.length}`);
const daily = new Map(); // 날짜 → { rows: Map(tk → {...}), recs: [tk] }
let fcache = new Map(), fmonth = '';
for (const d of DAYS) {
  if (d.slice(0, 7) !== fmonth) { fmonth = d.slice(0, 7); fcache = new Map();
    for (const st of ST) { const [e1, e0] = known2(st.fd.annualDilutedEPS, d), [q1] = known2(st.fd.annualStockholdersEquity, d), [h1, h0] = known2(st.fd.annualOrdinarySharesNumber, d);
      if (!e1 || !q1 || !h1 || h1.v <= 0) continue;
      fcache.set(st.tk, { eps: e1.v, bps: q1.v / h1.v, sh: h1.v, EG: e0 ? (e0.v > 0 ? cap(e1.v / e0.v - 1, -1, 2) : e1.v > 0 ? 1 : -1) : null, SH: h0 && h0.v > 0 ? cap(1 - h1.v / h0.v, -0.3, 0.3) : null }); } }
  const rows = [];
  for (const st of ST) {
    const i = st.idx.get(d), f = fcache.get(st.tk); if (i == null || i < 252 || !f) continue;
    const p = st.c[i]; if (st.tv[i] < 3e8 || p < 1000 || st.jmp[i] > 0) continue;
    const per = f.eps > 0 ? p / f.eps : -1, pbr = f.bps > 0 ? p / f.bps : -1; if (pbr > 0 && pbr < 0.05) continue;
    const dv = ttmDiv(st.divs, d), dv0 = ttmDiv(st.divs, addDays(d, -365)), dy = dv / p * 100;
    const V = valueScore(per, pbr, Math.min(dy, 30)).V, T = 100 * (st.hi[i] > st.lo[i] ? (st.a[i] - st.lo[i]) / (st.hi[i] - st.lo[i]) : 0.5);
    const DG = dv0 > 0 ? cap(dv / dv0 - 1, -1, 2) : dv > 0 ? 1 : 0;
    rows.push({ st, i, V, T, EG: f.EG, SH: f.SH, DG, mc: p * f.sh / 1e8, el: st.tv[i] >= 10e8 && p * f.sh >= 1000e8 && f.eps > 0, ch: i > 0 ? st.c[i] / st.c[i - 1] - 1 : 0, vol: st.vol[i] });
  }
  for (const key of ['EG', 'SH', 'DG']) { const has = rows.filter(r => r[key] != null).sort((x, y) => x[key] - y[key]), n = has.length;
    has.forEach((r, k) => { r[key + 'p'] = n > 1 ? 100 * k / (n - 1) : 50; }); rows.filter(r => r[key] == null).forEach(r => { r[key + 'p'] = 50; }); }
  rows.forEach(r => { r.score = 0.3 * r.V + 0.3 * r.T + 0.1333 * (r.EGp + r.SHp + r.DGp); });
  rows.sort((x, y) => y.score - x.score); rows.forEach((r, k) => { r.rk = 100 * k / rows.length; r.band = r.rk < 5 ? 0 : r.rk < 20 ? 1 : r.rk < 40 ? 2 : r.rk < 70 ? 3 : 4; });
  const recs = [], per = {};
  for (const r of rows) { if (recs.length >= 15 || r.band > 1) break; if (!r.el || r.ch <= -0.08 || (per[r.st.sector] || 0) >= 3) continue; recs.push(r.st.tk); per[r.st.sector] = (per[r.st.sector] || 0) + 1; }
  daily.set(d, { rows: new Map(rows.map(r => [r.st.tk, r])), recs });
}
const BYTK = new Map(ST.map(s => [s.tk, s]));
const cellOf = r => { const v = !(r.vol >= 0) ? 1 : r.vol < DIST.vcut[0] ? 0 : r.vol < DIST.vcut[1] ? 1 : 2; return DIST.cells[Math.min(r.band, 4) + '_' + v]; };

// 시가·저가 (수정주가 비율 적용)
for (const st of ST) {
  const r = JSON.parse(fs.readFileSync(`${S}/allpx/${st.tk}.json`, 'utf8')).chart.result[0], q = r.indicators.quote[0], m = new Map();
  r.timestamp.forEach((t, k) => m.set(new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10), [q.open[k], q.low[k]]));
  st.oA = st.b.map((x, i) => { const v = m.get(x.d); return v && v[0] > 0 ? v[0] * st.a[i] / st.c[i] : st.a[i]; });
  st.lA = st.b.map((x, i) => { const v = m.get(x.d); return v && v[1] > 0 ? v[1] * st.a[i] / st.c[i] : st.a[i]; });
}
// exec: 'nextClose' 다음 날 종가 | 'nextOpen' 다음 날 시가 | 'sameClose' 당일 종가(시간외 종가)
// stopMode: 'close' 종가로 확인 후 매도 | 'intraday' 장중에 손절가를 건드리면 즉시 매도(갭 하락이면 시가)
function run(opt) {
  const o = { maxPos: 10, take: false, cashRate: 0.03, buyCost: 0.001, sellCost: 0.0025, exec: 'nextClose', stopMode: 'close', ...opt };
  let cash = 1e8; const pos = new Map(), curve = []; let pending = [], nTr = 0;
  const t0 = o.from ? DAYS.findIndex(x => x >= o.from) : 0;
  const px = (tk, d, f = 'a') => { const st = BYTK.get(tk), i = st.idx.get(d); return i == null ? null : st[f][i]; };
  const execAll = (d, field) => {
    const keep = [];
    for (const od of pending) {
      const a = px(od.tk, d, field); if (a == null) { keep.push(od); continue; }
      const p = pos.get(od.tk);
      if (od.side === 'buy') { const amt = Math.min(cash, od.amt); if (amt < 1e5) continue; const units = amt * (1 - o.buyCost) / a; cash -= amt; nTr++;
        if (p) { p.units += units; p.lastTrade = od.t; } else pos.set(od.tk, { units, entryA: a, maxA: a, lastTrade: od.t, lastA: a, trimmed: false, plan: od.plan }); }
      else if (p) { const units = p.units * od.frac; cash += units * a * (1 - o.sellCost); p.units -= units; nTr++; if (od.frac >= 0.999) pos.delete(od.tk); }
    }
    pending = keep;
  };
  for (let t = t0; t < DAYS.length; t++) {
    const d = DAYS[t], day = daily.get(d);
    if (t > t0) cash *= 1 + o.cashRate / 252;
    // 장중 손절: 전날 정한 손절가를 오늘 저가가 건드리면 그 가격(갭 하락이면 시가)에 매도
    if (o.stopMode === 'intraday') for (const [tk, p] of [...pos]) { const lo = px(tk, d, 'lA'), op = px(tk, d, 'oA'); if (lo == null || p.stopLv == null) continue;
      if (lo <= p.stopLv) { const at = Math.min(op, p.stopLv); cash += p.units * at * (1 - o.sellCost); nTr++; pos.delete(tk); pending = pending.filter(x => x.tk !== tk); } }
    if (o.exec !== 'sameClose') execAll(d, o.exec === 'nextOpen' ? 'oA' : 'a');
    if (day && t < DAYS.length - 1) {
      const E0 = cash + [...pos.entries()].reduce((s, [tk, p]) => { const a = px(tk, d); if (a != null) p.lastA = a; return s + p.units * p.lastA; }, 0), target = E0 / o.maxPos;
      const pendingTk = new Set(pending.map(x => x.tk));
      for (const [tk, p] of pos) {
        if (pendingTk.has(tk)) continue;
        const a = px(tk, d); if (a == null) continue; p.maxA = Math.max(p.maxA, a);
        const r = day.rows.get(tk), band = r ? r.band : 4, val = p.units * a;
        const stop = Math.max(p.entryA, p.maxA) * (1 + p.plan.stop); p.stopLv = stop;
        if (o.stopMode === 'close' && a <= stop) { pending.push({ tk, side: 'sell', frac: 1, t }); continue; }
        if (band === 4) { pending.push({ tk, side: 'sell', frac: 1, t }); continue; }
        if (band === 3 && !p.trimmed) { p.trimmed = true; pending.push({ tk, side: 'sell', frac: 0.5, t }); continue; }
        if (band <= 1) p.trimmed = false;
        if (band <= 1 && val < 0.6 * target && t - p.lastTrade >= 5) pending.push({ tk, side: 'buy', amt: target - val, add: true, t });
      }
      let slots = o.maxPos - pos.size - pending.filter(x => x.side === 'buy' && !x.add).length + pending.filter(x => x.side === 'sell' && x.frac >= 0.999).length;
      let budget = cash + pending.filter(x => x.side === 'sell').reduce((s, x) => s + (pos.get(x.tk) ? pos.get(x.tk).units * pos.get(x.tk).lastA * x.frac : 0), 0) * (o.exec === 'sameClose' ? 1 : 0) - pending.filter(x => x.side === 'buy').reduce((s, x) => s + x.amt, 0);
      for (const tk of day.recs) { if (slots <= 0 || budget < target * 0.5) break; if (pos.has(tk) || pendingTk.has(tk)) continue;
        const r = day.rows.get(tk), amt = Math.min(target, budget); pending.push({ tk, side: 'buy', amt, plan: cellOf(r), t }); slots--; budget -= amt; }
    }
    if (o.exec === 'sameClose') { pending.sort((x, y) => (x.side === 'sell' ? 0 : 1) - (y.side === 'sell' ? 0 : 1)); execAll(d, 'a'); }
    curve.push(cash + [...pos.entries()].reduce((s, [tk, p]) => { const a = px(tk, d); if (a != null) p.lastA = a; return s + p.units * p.lastA; }, 0));
  }
  let pk = 0, mdd = 0; for (const v of curve) { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); }
  return { ret: curve[curve.length - 1] / 1e8 - 1, mdd, trades: nTr };
}
const VR = {
  '다음 날 종가 (지금 가정)': {},
  '당일 시간외 종가 (15:40~16:00)': { exec: 'sameClose' },
  '다음 날 시가 (08:30~09:00 예약)': { exec: 'nextOpen' },
  '다음 날 종가 + 장중 손절': { stopMode: 'intraday' },
  '당일 시간외 종가 + 장중 손절': { exec: 'sameClose', stopMode: 'intraday' },
};
const FROMS = ['2023-04-28', '2023-10-31', '2024-04-30', '2024-10-31', '2025-04-30'];
const pct = v => (v * 100).toFixed(1) + '%', avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const acc = {}; Object.keys(VR).forEach(k => acc[k] = []);
console.log('시작일 | ' + Object.keys(VR).join(' | '));
for (const f of FROMS) {
  const r = Object.fromEntries(Object.entries(VR).map(([k, o]) => [k, run({ ...o, from: f })]));
  console.log(`${f} | ` + Object.keys(VR).map(k => `${pct(r[k].ret)} (낙폭 ${pct(r[k].mdd)})`).join(' | '));
  Object.keys(VR).forEach(k => acc[k].push(r[k]));
}
const base = acc['다음 날 종가 (지금 가정)'];
console.log('\n' + Object.entries(acc).map(([k, v]) => `${k}: 평균 ${pct(avg(v.map(x => x.ret)))} · 낙폭 평균 ${pct(avg(v.map(x => x.mdd)))} · 기본보다 나은 횟수 ${v.filter((x, i) => x.ret > base[i].ret).length}/5 · 거래 ${Math.round(avg(v.map(x => x.trades)))}회`).join('\n'));
