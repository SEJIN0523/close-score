// 3차 검증: 판단값을 데이터로 바꾼 항목(이익 증가·주식 수 감소·배당 증가·자동 감점)과 이를 합친 자동 점수
// 사용: node bt3.js <scratchpad 폴더> <out.json>
const fs = require('fs');
const { readPx, readFund, knownAt, valueScore, mean, addDays } = require('./fdata.js');
const [S, OUT] = process.argv.slice(2);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const list = fs.readFileSync(`${S}/all_list.txt`, 'utf8').trim().split('\n').map(l => l.split('\t'));
const K = readPx(`${S}/krx/kospi_daily.json`).bars;
const months = []; for (let i = 0; i < K.length; i++) if (!K[i + 1] || K[i].d.slice(0, 7) !== K[i + 1].d.slice(0, 7)) months.push(K[i].d);
const M = months.filter(m => m >= '2023-04-01' && m <= '2026-09-30');
const H = { '1개월': 21, '3개월': 63, '6개월': 126 };
const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// 그 시점에 알려진 연간 값과 그 직전 연간 값
const known2 = (arr, md) => { if (!arr) return [null, null]; const k = arr.filter(e => addDays(e.d, 92) <= md); return [k[k.length - 1] || null, k[k.length - 2] || null]; };
const ttmDiv = (divs, d) => divs.filter(x => x.d > addDays(d, -365) && x.d <= d).reduce((s, x) => s + x.amt, 0);

const obs = [];
for (const [tk] of list) {
  const px = readPx(`${S}/allpx/${tk}.json`), fd = readFund(`${S}/allfund/${tk}.json`);
  if (!px || px.bars.length < 300 || !fd || !fd.annualDilutedEPS) continue;
  const b = px.bars, a = b.map(x => x.a), idx = new Map(b.map((x, i) => [x.d, i]));
  const jc = []; a.reduce((s, x, i) => (jc[i] = s + (i > 0 && Math.abs(Math.log(x / a[i - 1])) > Math.log(1.35) ? 1 : 0)), 0);
  const jumps = (i0, i1) => jc[Math.min(i1, jc.length - 1)] - (i0 > 0 ? jc[i0 - 1] : 0);
  for (const md of M) {
    const i = idx.get(md); if (i == null || i < 252) continue;
    if (mean(b.slice(i - 19, i + 1).map(x => x.c * x.v)) < 3e8 || b[i].c < 1000 || jumps(i - 252, i) > 0) continue;
    const [eps, eps0] = known2(fd.annualDilutedEPS, md), eq = knownAt(fd.annualStockholdersEquity, md), [sh, sh0] = known2(fd.annualOrdinarySharesNumber, md);
    if (!eps || !eq || !sh || sh.v <= 0) continue;
    const per = eps.v > 0 ? b[i].c / eps.v : -1, bps = eq.v / sh.v, pbr = bps > 0 ? b[i].c / bps : -1;
    if (pbr > 0 && pbr < 0.05) continue;
    const dv = ttmDiv(px.divs, md), dv0 = ttmDiv(px.divs, addDays(md, -365)), dy = dv / b[i].c * 100;
    let hi = 0, lo = Infinity; for (let k = i - 251; k <= i; k++) { hi = Math.max(hi, a[k]); lo = Math.min(lo, a[k]); }
    const T = 100 * (hi > lo ? (a[i] - lo) / (hi - lo) : 0.5), v = valueScore(per, pbr, Math.min(dy, 30));
    // 새 항목
    const EG = eps0 ? (eps0.v > 0 ? cap(eps.v / eps0.v - 1, -1, 2) : eps.v > 0 ? 1 : -1) : null;   // 이익 증가율 (흑자 전환 +100%, 적자 지속·전환 −100%)
    const SH = sh0 && sh0.v > 0 ? cap(1 - sh.v / sh0.v, -0.3, 0.3) : null;                        // 주식 수 감소율 (+면 소각·감소)
    const DG = dv0 > 0 ? cap(dv / dv0 - 1, -1, 2) : dv > 0 ? 1 : 0;                                // 배당 증가율
    const flagOne = per > 0 && per < 2, flagX3 = eps0 && eps0.v > 0 && eps.v > 3 * eps0.v, flagTurn = eps0 && eps0.v <= 0 && eps.v > 0, flagDiv = dy > 12;
    const fw = {}; for (const [k, h] of Object.entries(H)) if (i + h < b.length && jumps(i + 1, i + h) === 0) fw[k] = a[i + h] / a[i] - 1;
    obs.push({ md, tk, V: v.V, T, Comb: (v.V + T) / 2, EG, SH, DG, flagOne, flagX3, flagTurn, flagDiv, anyFlag: flagOne || flagX3 || flagTurn || flagDiv, fw });
  }
}
const by = new Map(); obs.forEach(x => { if (!by.has(x.md)) by.set(x.md, []); by.get(x.md).push(x); });
// 달마다 백분위(0~100)로 바꿔 합치기
for (const rows of by.values()) for (const key of ['EG', 'SH', 'DG']) {
  const has = rows.filter(x => x[key] != null).sort((x, y) => x[key] - y[key]), n = has.length;
  has.forEach((x, r) => { x[key + 'p'] = n > 1 ? 100 * r / (n - 1) : 50; }); rows.filter(x => x[key] == null).forEach(x => { x[key + 'p'] = 50; });
}
const COMBOS = {
  'Comb': x => x.Comb,
  'Comb+이익': x => 0.4 * x.V + 0.4 * x.T + 0.2 * x.EGp,
  'Comb+주식수': x => 0.4 * x.V + 0.4 * x.T + 0.2 * x.SHp,
  'Comb+배당증가': x => 0.4 * x.V + 0.4 * x.T + 0.2 * x.DGp,
  '전부 같은 비중': x => 0.3 * x.V + 0.3 * x.T + 0.133 * x.EGp + 0.133 * x.SHp + 0.133 * x.DGp,
  'Comb−감점': x => x.Comb - (x.anyFlag ? 15 : 0),
};
obs.forEach(x => { for (const [k, f] of Object.entries(COMBOS)) x['c:' + k] = f(x); });

const quint = (rows, key) => { const s = rows.slice().sort((x, y) => x[key] - y[key]), n = s.length; return [0, 1, 2, 3, 4].map(q => s.slice(Math.floor(q * n / 5), Math.floor((q + 1) * n / 5))); };
const stat = sp => ({ spread: mean(sp), t: mean(sp) / (sd(sp) / Math.sqrt(sp.length)), win: sp.filter(x => x > 0).length / sp.length, n: sp.length });
function spread(sig, k, from = '0', to = '9') {
  const qs = [[], [], [], [], []], sp = [];
  for (const md of M) { if (md < from || md > to) continue; const rows = (by.get(md) || []).filter(x => x.fw[k] != null && x[sig] != null); if (rows.length < 100) continue;
    const m = mean(rows.map(x => x.fw[k])), g = quint(rows, sig).map(gr => mean(gr.map(x => x.fw[k] - m))); g.forEach((v, q) => qs[q].push(v)); sp.push(g[4] - g[0]); }
  const s = stat(sp); s.t /= Math.sqrt(H[k] / 21); return { q: qs.map(mean), ...s };
}
// 예/아니오 비교 (같은 달 평균 대비 초과수익 차이)
function yesno(test, k = '6개월') {
  const sp = []; let ny = 0;
  for (const md of M) { const rows = (by.get(md) || []).filter(x => x.fw[k] != null); if (rows.length < 100) continue;
    const m = mean(rows.map(x => x.fw[k])), y = rows.filter(test), n = rows.filter(x => !test(x)); if (y.length < 5 || n.length < 5) continue; ny += y.length;
    sp.push(mean(y.map(x => x.fw[k] - m)) - mean(n.map(x => x.fw[k] - m))); }
  const s = stat(sp); s.t /= Math.sqrt(H[k] / 21); return { ...s, avgYes: ny / sp.length };
}
const strat = (sig, cost = 0.005) => {
  let g = 1, prev = new Set(), n = 0, turn = [];
  for (const md of M) { const rows = (by.get(md) || []).filter(x => x.fw['1개월'] != null); if (rows.length < 100) continue; n++;
    const top = rows.slice().sort((x, y) => y[sig] - x[sig]).slice(0, Math.floor(rows.length / 5)), cur = new Set(top.map(x => x.tk));
    const tr = prev.size ? [...cur].filter(x => !prev.has(x)).length / cur.size : 1; turn.push(tr);
    g *= 1 + mean(top.map(x => x.fw['1개월'])) - tr * cost; prev = cur; }
  return { ann: Math.pow(g, 12 / n) - 1, turnover: mean(turn), months: n };
};
const pct = v => (v * 100).toFixed(1) + '%';
const out = { obs: obs.length, from: M[0], to: M[M.length - 1], single: {}, yesno: {}, combos: {} };
console.log(`관측 ${obs.length}건, ${M[0]}~${M[M.length - 1]}`);
console.log('\n[새 항목 단독: 상위 20% − 하위 20%, 이후 6개월 초과수익]');
for (const [k, nm] of [['EG', '이익 증가율'], ['SH', '주식 수 감소율'], ['DG', '배당 증가율']]) {
  const r = spread(k, '6개월'), h = [spread(k, '6개월', '2023-04-01', '2024-12-31'), spread(k, '6개월', '2025-01-01', '2026-09-30')], r3 = spread(k, '3개월');
  out.single[k] = { r, r3, h }; console.log(`${nm}: 6개월 ${pct(r.spread)} (t ${r.t.toFixed(1)}, 우세 ${pct(r.win)}) · 3개월 ${pct(r3.spread)} (t ${r3.t.toFixed(1)}) · 분위 ${r.q.map(pct).join(' / ')} · 앞 ${pct(h[0].spread)}(t ${h[0].t.toFixed(1)}) 뒤 ${pct(h[1].spread)}(t ${h[1].t.toFixed(1)})`);
}
console.log('\n[예/아니오 비교, 이후 6개월 초과수익 차이]');
const YN = { '주식 수 1% 이상 감소': x => x.SH != null && x.SH >= 0.01, '주식 수 1% 이상 증가(증자 등)': x => x.SH != null && x.SH <= -0.01, '배당 늘림': x => x.DG > 0.05, '배당 줄임·중단': x => x.DG < -0.05,
  '이익 감소': x => x.EG != null && x.EG < 0, 'PER 2배 미만': x => x.flagOne, '이익 3배 이상': x => !!x.flagX3, '흑자 전환': x => !!x.flagTurn, '배당 12% 초과': x => x.flagDiv, '경고 하나라도': x => x.anyFlag };
for (const [nm, f] of Object.entries(YN)) { const r = yesno(f); out.yesno[nm] = r; console.log(`${nm}: ${pct(r.spread)} (t ${r.t.toFixed(1)}, 우세 ${pct(r.win)}, 월평균 ${r.avgYes.toFixed(0)}종목)`); }
console.log('\n[합친 점수 비교: 상위−하위 6개월 / 앞·뒤 기간 / 상위 20% 전략 연수익(비용 차감)]');
for (const k of Object.keys(COMBOS)) {
  const s = 'c:' + k, r = spread(s, '6개월'), h = [spread(s, '6개월', '2023-04-01', '2024-12-31'), spread(s, '6개월', '2025-01-01', '2026-09-30')], st = strat(s);
  out.combos[k] = { r, h, st }; console.log(`${k}: ${pct(r.spread)} (t ${r.t.toFixed(1)}) · 분위 ${r.q.map(pct).join(' / ')} · 앞 ${pct(h[0].spread)}(t ${h[0].t.toFixed(1)}) 뒤 ${pct(h[1].spread)}(t ${h[1].t.toFixed(1)}) · 전략 연 ${pct(st.ann)} (교체 ${pct(st.turnover)})`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
