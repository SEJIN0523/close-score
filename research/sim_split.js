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
// ── 3) 운용 규칙 시뮬레이션 ──
// opt: maxPos 보유 종목 수, stop 'trail'|'fixed'|'none', take 목표가 절반 매도, trim 40~70% 구간 절반 매도, add 추가 매수, sellBottom 하위 30% 전량 매도, cashRate 현금 연 이자
function run(opt) {
  const DD = (opt.form || '새 식') === '새 식' ? DNEW : DIST, cellOfF = r => { const v = !(r.vol >= 0) ? 1 : r.vol < DD.vcut[0] ? 0 : r.vol < DD.vcut[1] ? 1 : 2; return DD.cells[Math.min(r.band, 4) + '_' + v]; };
  const o = { form: '새 식', maxPos: 10, stop: 'trail', take: true, trim: true, add: true, sellBottom: true, cashRate: 0.03, buyCost: 0.001, sellCost: 0.0025, monthly: false, entry: 'full', exit: 'full', ...opt };
  const F0 = { full: 1, half5: 0.5, third: 1 / 3 }[o.entry], TR = { full: [], half5: [[5, 0.5]], third: [[5, 1 / 3], [10, 1 / 3]] }[o.entry];
  let cash = 1e8; const pos = new Map(), trades = [], curve = []; let pending = [], costPaid = 0, lastMonth = '';
  const priceA = (tk, d) => { const st = BYTK.get(tk), i = st.idx.get(d); return i == null ? null : st.a[i]; };
  const equity = d => cash + [...pos.entries()].reduce((s, [tk, p]) => { const a = priceA(tk, d); if (a != null) p.lastA = a; return s + p.units * p.lastA; }, 0);
  const t0 = o.from ? DAYS.findIndex(x => x >= o.from) : 0;
  for (let t = t0; t < DAYS.length; t++) {
    const d = DAYS[t], day = daily[o.form].get(d);
    if (t > t0) cash *= 1 + o.cashRate / 252;
    // 어제 낸 주문을 오늘 종가로 체결 (거래 없는 종목은 다음 날로)
    const keep = [];
    for (const od of pending) {
      const a = priceA(od.tk, d); if (a == null) { keep.push(od); continue; }
      const p = pos.get(od.tk);
      if (od.side === 'buy') { const amt = Math.min(cash, od.amt); if (amt < 1e5) continue; const units = amt * (1 - o.buyCost) / a; cash -= amt; costPaid += amt * o.buyCost;
        if (p) { p.cost += amt; p.units += units; p.lastTrade = t; } else pos.set(od.tk, { units, cost: amt, entryA: a, maxA: a, entryD: d, entryT: t, lastTrade: t, lastA: a, taken: false, trimmed: false, plan: od.plan, tr: (od.tr || []).map(([k, f]) => [t + k, f]) });
        trades.push({ d, tk: od.tk, side: od.add ? '추가 매수' : '매수', amt, why: od.why }); }
      else if (p) { const units = p.units * od.frac, val = units * a, net = val * (1 - o.sellCost); cash += net; costPaid += val * o.sellCost;
        const costPart = p.cost * od.frac; trades.push({ d, tk: od.tk, side: od.frac >= 0.999 ? '전량 매도' : '일부 매도', amt: net, pnl: net - costPart, why: od.why });
        p.units -= units; p.cost -= costPart; p.lastTrade = t; if (od.frac >= 0.999 || p.units * a < 1e4) pos.delete(od.tk); }
    }
    pending = keep;
    const E = equity(d); curve.push([d, Math.round(E)]);
    if (!day || t === DAYS.length - 1) continue;
    const target = E / o.maxPos, pendingTk = new Set(pending.map(x => x.tk));
    // 보유 종목 점검 (장 마감 뒤)
    for (const [tk, p] of pos) {
      if (pendingTk.has(tk)) continue;
      const a = priceA(tk, d); if (a == null) continue; p.maxA = Math.max(p.maxA, a);
      const r = day.rows.get(tk), band = r ? r.band : 4, val = p.units * a;
      if (o.monthly) continue;
      let stop = -Infinity;
      if (o.stop === 'trail') stop = Math.max(p.entryA * (1 + p.plan.stop), p.maxA * (1 + p.plan.stop));
      else if (o.stop === 'fixed') stop = p.entryA * (1 + p.plan.stop);
      if (p.taken) stop = Math.max(stop, p.entryA); // 목표가 도달 뒤에는 본전 아래로 안 내려가게
      if (a <= stop) { if (o.exit === 'stopHalf' && !p.halfStop) { p.halfStop = t; pending.push({ tk, side: 'sell', frac: 0.5, why: '손절 절반' }); } else pending.push({ tk, side: 'sell', frac: 1, why: '손절' }); continue; }
      if (p.halfStop && t - p.halfStop >= 2) p.halfStop = 0;
      if (o.sellBottom && band === 4) {
        if (o.exit === 'bottomHalf') { if (!p.halfBot) { p.halfBot = t; pending.push({ tk, side: 'sell', frac: 0.5, why: '하위 30% 절반' }); continue; } if (t - p.halfBot >= 5) { pending.push({ tk, side: 'sell', frac: 1, why: '하위 30%' }); continue; } }
        else { pending.push({ tk, side: 'sell', frac: 1, why: '하위 30%' }); continue; }
      } else p.halfBot = 0;
      // 분할 매수: 정해진 날에 아직 상위 20%면 다음 몫을 산다 (아니면 남은 몫 취소)
      if (p.tr && p.tr.length && t >= p.tr[0][0]) { const [, f] = p.tr.shift(); if (band <= 1) pending.push({ tk, side: 'buy', amt: target * f, add: true, why: '분할 매수' }); else p.tr = []; continue; }
      if (o.take && !p.taken && a >= p.entryA * (1 + p.plan.q[3])) { p.taken = true; pending.push({ tk, side: 'sell', frac: 0.5, why: '목표가 도달' }); continue; }
      if (o.trim && band === 3 && !p.trimmed) { p.trimmed = true; pending.push({ tk, side: 'sell', frac: 0.5, why: '40~70% 구간' }); continue; }
      if (band <= 1) p.trimmed = false;
      if (o.add && (!p.tr || !p.tr.length) && band <= 1 && !p.taken && val < 0.6 * target && t - p.lastTrade >= 5) pending.push({ tk, side: 'buy', amt: target - val, add: true, why: '상위 20% 복귀' });
    }
    // 월별 단순 교체 모드: 매달 말 추천 상위 maxPos로 전부 갈아타기
    if (o.monthly) {
      const m = d.slice(0, 7), nx = DAYS[t + 1]; if (nx && nx.slice(0, 7) === m) continue;
      const want = new Set(day.recs.slice(0, o.maxPos));
      for (const tk of pos.keys()) if (!want.has(tk)) pending.push({ tk, side: 'sell', frac: 1, why: '월말 교체' });
      const tgt = E / o.maxPos; for (const tk of want) if (!pos.has(tk)) { const r = day.rows.get(tk); pending.push({ tk, side: 'buy', amt: tgt, plan: cellOfF(r), why: '월말 편입' }); }
      continue;
    }
    // 빈 자리에 추천 종목 신규 매수
    let slots = o.maxPos - pos.size - pending.filter(x => x.side === 'buy' && !x.add).length + pending.filter(x => x.side === 'sell' && x.frac >= 0.999).length;
    let budget = cash - pending.filter(x => x.side === 'buy').reduce((s, x) => s + x.amt, 0);
    for (const tk of day.recs) { if (slots <= 0 || budget < target * F0 * 0.5) break; if (pos.has(tk) || pendingTk.has(tk)) continue;
      const r = day.rows.get(tk), amt = Math.min(target * F0, budget); pending.push({ tk, side: 'buy', amt, plan: cellOfF(r), tr: TR, why: `상위 ${r.rk.toFixed(1)}%` }); slots--; budget -= amt; }
  }
  // 결과
  const vals = curve.map(x => x[1]), fin = vals[vals.length - 1], yrs = (new Date(curve[curve.length - 1][0]) - new Date(curve[0][0])) / 365.25 / 864e5;
  let pk = 0, mdd = 0; for (const v of vals) { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); }
  const closed = trades.filter(x => x.pnl != null), wins = closed.filter(x => x.pnl > 0);
  return { opt: o, final: fin, ret: fin / 1e8 - 1, cagr: Math.pow(fin / 1e8, 1 / yrs) - 1, mdd, trades: trades.length, sells: closed.length, winRate: wins.length / Math.max(1, closed.length), costPaid, curve, log: trades, holdings: [...pos.entries()].map(([tk, p]) => ({ tk, value: Math.round(p.units * p.lastA), cost: Math.round(p.cost), entryD: p.entryD })) };
}

const VR = {
  '지금 규칙 (한 번에 사고 한 번에 팜)': {},
  '분할 매수 A: 절반 → 5일 뒤 절반': { entry: 'half5' },
  '분할 매수 B: 1/3씩 3번 (0·5·10일)': { entry: 'third' },
  '분할 매도 A: 손절 시 절반 → 다음 날도 아래면 나머지': { exit: 'stopHalf' },
  '분할 매도 B: 하위 30% 시 절반 → 5일 뒤 나머지': { exit: 'bottomHalf' },
};
const FROMS = ['2023-04-28', '2023-10-31', '2024-04-30', '2024-10-31', '2025-04-30'];
const pct = v => (v * 100).toFixed(1) + '%', avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const acc = {}; Object.keys(VR).forEach(k => acc[k] = []);
for (const f of FROMS) { const line = [];
  for (const [k, op] of Object.entries(VR)) { const r = run({ take: false, ...op, from: f }); acc[k].push(r); line.push(pct(r.ret) + ' (' + pct(r.mdd) + ')'); }
  console.log(f + ' | ' + line.join(' | ')); }
const base = acc[Object.keys(VR)[0]];
console.log('');
for (const [k, v] of Object.entries(acc)) console.log(`${k}: 평균 ${pct(avg(v.map(x => x.ret)))} · 낙폭 평균 ${pct(avg(v.map(x => x.mdd)))} · 최악 낙폭 ${pct(Math.min(...v.map(x => x.mdd)))} · 지금보다 나은 횟수 ${v.filter((x, i) => x.ret > base[i].ret).length}/5 · 매매 ${Math.round(avg(v.map(x => x.trades)))}회 · 비용 ${Math.round(avg(v.map(x => x.costPaid)) / 1e4)}만`);
