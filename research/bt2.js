// 2차 검증: 그 시점에 공개된 재무로 만든 가치 점수 + 추세 점수 (전 종목, 2023-04 ~ 2026-09 월말)
// 사용: node bt2.js <scratchpad 폴더> <out.json>
const fs = require('fs');
const { readPx, readFund, knownAt, valueScore, mean, addDays } = require('./fdata.js');
const [S, OUT] = process.argv.slice(2);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const list = fs.readFileSync(`${S}/all_list.txt`, 'utf8').trim().split('\n').map(l => l.split('\t'));
const K = readPx(`${S}/krx/kospi_daily.json`).bars;
const months = []; for (let i = 0; i < K.length; i++) if (!K[i + 1] || K[i].d.slice(0, 7) !== K[i + 1].d.slice(0, 7)) months.push(K[i].d);
const M = months.filter(m => m >= '2023-04-01' && m <= '2026-09-30');
const H = { '1개월': 21, '3개월': 63, '6개월': 126 };
const obs = []; let stocks = 0, noFund = 0;
for (const [tk] of list) {
  const px = readPx(`${S}/allpx/${tk}.json`), fd = readFund(`${S}/allfund/${tk}.json`);
  if (!px || px.bars.length < 300) continue;
  if (!fd || !fd.annualDilutedEPS) { noFund++; continue; }
  stocks++;
  const b = px.bars, a = b.map(x => x.a), idx = new Map(b.map((x, i) => [x.d, i]));
  const jc = []; a.reduce((s, x, i) => (jc[i] = s + (i > 0 && Math.abs(Math.log(x / a[i - 1])) > Math.log(1.35) ? 1 : 0)), 0);
  const jumps = (i0, i1) => jc[Math.min(i1, jc.length - 1)] - (i0 > 0 ? jc[i0 - 1] : 0);
  for (const md of M) {
    const i = idx.get(md); if (i == null || i < 252) continue;
    if (mean(b.slice(i - 19, i + 1).map(x => x.c * x.v)) < 3e8 || b[i].c < 1000 || jumps(i - 252, i) > 0) continue;
    const eps = knownAt(fd.annualDilutedEPS, md), eq = knownAt(fd.annualStockholdersEquity, md), sh = knownAt(fd.annualOrdinarySharesNumber, md);
    if (!eps || !eq || !sh || sh.v <= 0) continue;
    const per = eps.v > 0 ? b[i].c / eps.v : -1, bps = eq.v / sh.v, pbr = bps > 0 ? b[i].c / bps : -1;
    if (pbr > 0 && pbr < 0.05) continue; // 주식 수·액면 변경 등으로 깨진 값
    const dy = px.divs.filter(x => x.d > addDays(md, -365) && x.d <= md).reduce((s, x) => s + x.amt, 0) / b[i].c * 100;
    let hi = 0, lo = Infinity; for (let k = i - 251; k <= i; k++) { hi = Math.max(hi, a[k]); lo = Math.min(lo, a[k]); }
    const T = 100 * (hi > lo ? (a[i] - lo) / (hi - lo) : 0.5), v = valueScore(per, pbr, Math.min(dy, 30));
    const fw = {}; for (const [k, h] of Object.entries(H)) if (i + h < b.length && jumps(i + 1, i + h) === 0) fw[k] = a[i + h] / a[i] - 1;
    obs.push({ md, tk, V: v.V, T, Comb: (v.V + T) / 2, cheapPER: v.sPer, cheapPBR: v.sPbr, div: v.sDy, fw });
  }
}
const by = new Map(); obs.forEach(x => { if (!by.has(x.md)) by.set(x.md, []); by.get(x.md).push(x); });
const quint = (rows, key) => { const s = rows.slice().sort((x, y) => x[key] - y[key]), n = s.length; return [0, 1, 2, 3, 4].map(q => s.slice(Math.floor(q * n / 5), Math.floor((q + 1) * n / 5))); };
const SIG = { Comb: '합친 점수(가치+추세)', V: '가치 점수', T: '추세 점수', cheapPER: 'PER 낮음', cheapPBR: 'PBR 낮음', div: '배당수익률' };
const spread = (sig, k, from = '0', to = '9') => {
  const qs = [[], [], [], [], []], sp = [];
  for (const md of M) { if (md < from || md > to) continue; const rows = (by.get(md) || []).filter(x => x.fw[k] != null); if (rows.length < 100) continue;
    const m = mean(rows.map(x => x.fw[k])), g = quint(rows, sig).map(gr => mean(gr.map(x => x.fw[k] - m))); g.forEach((v, q) => qs[q].push(v)); sp.push(g[4] - g[0]); }
  const hm = H[k] / 21;
  return { q: qs.map(mean), spread: mean(sp), t: mean(sp) / (sd(sp) / Math.sqrt(sp.length)) / Math.sqrt(hm), win: sp.filter(x => x > 0).length / sp.length, n: sp.length };
};
const res = {};
for (const sig of Object.keys(SIG)) { res[sig] = {}; for (const k of Object.keys(H)) res[sig][k] = spread(sig, k); }
const halves = {}; for (const sig of ['Comb', 'V', 'T']) halves[sig] = [spread(sig, '6개월', '2023-04-01', '2024-12-31'), spread(sig, '6개월', '2025-01-01', '2026-09-30')].map(x => ({ q: x.q, spread: x.spread, t: x.t, n: x.n }));
// 매달 상위 20%를 동일 비중으로 1개월 보유, 교체한 만큼 거래비용 0.5%(사고팔기 합계)
const strat = (sig, cost = 0.005) => {
  let g = 1, gAll = 1, prev = new Set(), n = 0, turn = [];
  for (const md of M) { const rows = (by.get(md) || []).filter(x => x.fw['1개월'] != null); if (rows.length < 100) continue; n++;
    const top = rows.slice().sort((x, y) => y[sig] - x[sig]).slice(0, Math.floor(rows.length / 5)), cur = new Set(top.map(x => x.tk));
    const tr = prev.size ? [...cur].filter(x => !prev.has(x)).length / cur.size : 1; turn.push(tr);
    g *= 1 + mean(top.map(x => x.fw['1개월'])) - tr * cost; gAll *= 1 + mean(rows.map(x => x.fw['1개월'])); prev = cur; }
  return { months: n, ann: Math.pow(g, 12 / n) - 1, cum: g - 1, annAll: Math.pow(gAll, 12 / n) - 1, cumAll: gAll - 1, turnover: mean(turn) };
};
const strategies = { Comb: strat('Comb'), V: strat('V'), T: strat('T') };
const out = { stocks, noFund, obs: obs.length, perMonth: obs.length / M.length, from: M[0], to: M[M.length - 1], res, halves, strategies };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const pct = v => (v * 100).toFixed(1) + '%';
console.log(`전 종목 ${stocks}개(재무 없음 ${noFund}), 관측 ${obs.length}건, 월평균 ${out.perMonth.toFixed(0)}종목, ${out.from}~${out.to}`);
for (const [sig, nm] of Object.entries(SIG)) console.log(`[${nm}] ` + Object.keys(H).map(k => `${k} ${pct(res[sig][k].spread)} (t ${res[sig][k].t.toFixed(1)}, 우세 ${pct(res[sig][k].win)})`).join(' | ') + ` | 6개월 분위: ${res[sig]['6개월'].q.map(pct).join(' / ')}`);
for (const sig of ['Comb', 'V', 'T']) console.log(`[${SIG[sig]} 기간별 6개월 차이] 2023.4~2024: ${pct(halves[sig][0].spread)} (t ${halves[sig][0].t.toFixed(1)}) · 2025~2026.9: ${pct(halves[sig][1].spread)} (t ${halves[sig][1].t.toFixed(1)})`);
for (const [sig, s] of Object.entries(strategies)) console.log(`[전략: ${SIG[sig]} 상위 20%] ${s.months}개월 연 ${pct(s.ann)} (비용 뺀 값, 누적 ${pct(s.cum)}, 월 교체율 ${pct(s.turnover)}) vs 전체 평균 연 ${pct(s.annAll)}`);
