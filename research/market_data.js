// Historical point-in-time proxy data and unchanged ranking formula, shared by execution studies.
module.exports = function loadMarketData(S) {
const fs = require('fs');
const { readPx, readFund, valueScore, mean, addDays } = require('./fdata.js');
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

// ── 2) 매일 항목 계산 → 수식별 점수·순위·추천 ──
const FORM = {
  '이전 식': r => 0.3 * r.V + 0.3 * r.T + 0.1333 * (r.EGp + r.SHp + r.DGp),
  '새 식': r => 0.4 * r.LGp + 0.4 * (r.Tp + r.MOMp) / 2 + 0.2 * (r.EGp + r.SHp + r.DGp) / 3,
};
const daily = {}; Object.keys(FORM).forEach(k => daily[k] = new Map());
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
    rows.push({ st, i, V, T, EG: f.EG, SH: f.SH, DG: dv0 > 0 ? cap(dv / dv0 - 1, -1, 2) : dv > 0 ? 1 : 0, PER: per > 0 ? 1 / per : -1, DY: Math.min(dy, 30), LG: Math.log(p * f.sh), MOM: st.a[i - 21] / st.a[i - 252] - 1,
      el: st.tv[i] >= 10e8 && p * f.sh >= 1000e8 && f.eps > 0, ch: i > 0 ? st.c[i] / st.c[i - 1] - 1 : 0, vol: st.vol[i] });
  }
  for (const key of ['EG', 'SH', 'DG', 'PER', 'DY', 'LG', 'MOM', 'T']) { const has = rows.filter(r => r[key] != null && Number.isFinite(r[key])).sort((x, y) => x[key] - y[key]), n = has.length;
    has.forEach((r, k) => { r[key + 'p'] = n > 1 ? 100 * k / (n - 1) : 50; }); rows.filter(r => r[key + 'p'] == null).forEach(r => { r[key + 'p'] = 50; }); }
  for (const [fk, fn] of Object.entries(FORM)) {
    const sc = rows.map(r => ({ r, s: fn(r) })).sort((x, y) => y.s - x.s), m = new Map(), recs = [], per = {};
    sc.forEach((o, k) => { const rk = 100 * k / sc.length; m.set(o.r.st.tk, { rk, band: rk < 5 ? 0 : rk < 20 ? 1 : rk < 40 ? 2 : rk < 70 ? 3 : 4, vol: o.r.vol }); });
    for (const o of sc) { if (recs.length >= 15) break; const b = m.get(o.r.st.tk).band; if (b > 1) break; if (!o.r.el || o.r.ch <= -0.08 || (per[o.r.st.sector] || 0) >= 3) continue; recs.push(o.r.st.tk); per[o.r.st.sector] = (per[o.r.st.sector] || 0) + 1; }
    daily[fk].set(d, { rows: m, recs });
  }
}
const BYTK = new Map(ST.map(s => [s.tk, s]));
const DNEW = JSON.parse(fs.readFileSync(`${S}/dist_new.json`, 'utf8'));

return { ST, daily, DAYS, BYTK, DNEW, DIST, list, kospiAt };
};
