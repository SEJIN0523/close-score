// 수식 세분화 검증: 월말마다 여러 후보 항목(그 시점 정보만)을 계산하고, 단독 효과와 비중 조합을 기간을 나눠 검증한다
// 사용: node fx.js <scratchpad 폴더>
const fs = require('fs');
const { readPx, readFund, valueScore, mean, addDays } = require('./fdata.js');
const [S] = process.argv.slice(2);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), c01 = v => Math.max(0, Math.min(1, v));
const list = fs.readFileSync(`${S}/all_list.txt`, 'utf8').trim().split('\n').map(l => l.split('\t'));
const K = readPx(`${S}/krx/kospi_daily.json`).bars;
const months = []; for (let i = 0; i < K.length; i++) if (!K[i + 1] || K[i].d.slice(0, 7) !== K[i + 1].d.slice(0, 7)) months.push(K[i].d);
const M = months.filter(m => m >= '2023-04-01' && m <= '2026-09-30');
const known2 = (arr, md) => { if (!arr) return [null, null]; const k = arr.filter(e => addDays(e.d, 92) <= md); return [k[k.length - 1] || null, k[k.length - 2] || null]; };
const ttmDiv = (divs, d) => divs.filter(x => x.d > addDays(d, -365) && x.d <= d).reduce((s, x) => s + x.amt, 0);

const obs = [];
for (const [tk, , sector] of list) {
  const px = readPx(`${S}/allpx/${tk}.json`), fd = readFund(`${S}/allfund/${tk}.json`);
  if (!px || px.bars.length < 300 || !fd || !fd.annualDilutedEPS) continue;
  const b = px.bars, a = b.map(x => x.a), idx = new Map(b.map((x, i) => [x.d, i]));
  const jc = []; a.reduce((s, x, i) => (jc[i] = s + (i > 0 && Math.abs(Math.log(x / a[i - 1])) > Math.log(1.35) ? 1 : 0)), 0);
  const jumps = (i0, i1) => jc[Math.min(i1, jc.length - 1)] - (i0 > 0 ? jc[i0 - 1] : 0);
  for (const md of M) {
    const i = idx.get(md); if (i == null || i < 252) continue;
    const tv = mean(b.slice(i - 19, i + 1).map(x => x.c * x.v));
    if (tv < 3e8 || b[i].c < 1000 || jumps(i - 252, i) > 0) continue;
    const [eps, eps0] = known2(fd.annualDilutedEPS, md), [eq] = known2(fd.annualStockholdersEquity, md), [sh, sh0] = known2(fd.annualOrdinarySharesNumber, md);
    if (!eps || !eq || !sh || sh.v <= 0) continue;
    const p = b[i].c, per = eps.v > 0 ? p / eps.v : -1, bps = eq.v / sh.v, pbr = bps > 0 ? p / bps : -1;
    if (pbr > 0 && pbr < 0.05) continue;
    const dv = ttmDiv(px.divs, md), dv0 = ttmDiv(px.divs, addDays(md, -365)), dy = Math.min(dv / p * 100, 30);
    let hi = 0, lo = Infinity; for (let k = i - 251; k <= i; k++) { hi = Math.max(hi, a[k]); lo = Math.min(lo, a[k]); }
    const lr = []; for (let k = i - 119; k <= i; k++) lr.push(Math.log(a[k] / a[k - 1]));
    const v = valueScore(per, pbr, dy), mc = p * sh.v / 1e8;
    const f = {
      md, tk, sector, el: tv >= 10e8 && mc >= 1000 && eps.v > 0,
      // 가치 세분화
      cheapPER: per > 0 ? 1 / per : -1,          // 이익수익률 (높을수록 쌈, 적자는 맨 아래)
      cheapPBR: pbr > 0 ? 1 / pbr : -1,
      divYield: dy,
      V: v.V,
      // 추세·모멘텀
      T: 100 * (hi > lo ? (a[i] - lo) / (hi - lo) : 0.5),
      mom12: a[i - 21] / a[i - 252] - 1,         // 12개월(최근 1개월 제외)
      mom6: a[i] / a[i - 126] - 1,
      rev1: -(a[i] / a[i - 21] - 1),             // 최근 1개월 하락일수록 높음(단기 되돌림)
      // 위험·규모
      lowVol: -sd(lr),
      small: -Math.log(mc),
      // 질·성장·환원
      roe: bps > 0 ? eps.v / bps : -1,
      EG: eps0 ? (eps0.v > 0 ? cap(eps.v / eps0.v - 1, -1, 2) : eps.v > 0 ? 1 : -1) : null,
      SH: sh0 && sh0.v > 0 ? cap(1 - sh.v / sh0.v, -0.3, 0.3) : null,
      DG: dv0 > 0 ? cap(dv / dv0 - 1, -1, 2) : dv > 0 ? 1 : 0,
      vol: sd(lr) * Math.sqrt(252), fw12: i + 252 < b.length && jumps(i + 1, i + 252) === 0 ? a[i + 252] / a[i] - 1 : null,
      ...(() => { let mx = 0, mn = Infinity; if (i + 126 < b.length) for (let k = i + 1; k <= i + 126; k++) { mx = Math.max(mx, a[k] / a[i] - 1); mn = Math.min(mn, a[k] / a[i] - 1); } return { mx, mn }; })(),
      fw1: i + 21 < b.length && jumps(i + 1, i + 21) === 0 ? a[i + 21] / a[i] - 1 : null,
      fw6: i + 126 < b.length && jumps(i + 1, i + 126) === 0 ? a[i + 126] / a[i] - 1 : null,
    };
    obs.push(f);
  }
}
// 새 식: 규모 40 + 추세 40(52주 위치·12개월 모멘텀 반반) + 성장환원 20(이익 증가·주식 수 감소·배당 증가)
const by = new Map(); obs.forEach(x => { if (!by.has(x.md)) by.set(x.md, []); by.get(x.md).push(x); });
const P = ['T', 'mom12', 'small', 'EG', 'SH', 'DG'];
for (const rows of by.values()) for (const k of P) { const has = rows.filter(x => x[k] != null && Number.isFinite(x[k])).sort((x, y) => x[k] - y[k]), n = has.length;
  has.forEach((x, r) => { x['p_' + k] = n > 1 ? 100 * r / (n - 1) : 50; }); rows.filter(x => x['p_' + k] == null).forEach(x => { x['p_' + k] = 50; }); }
obs.forEach(x => { x.score = 0.4 * (100 - x.p_small) + 0.4 * (x.p_T + x.p_mom12) / 2 + 0.2 * (x.p_EG + x.p_SH + x.p_DG) / 3; });
const pct = v => (v * 100).toFixed(1) + '%', q = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
const BANDS = [5, 20, 40, 70, 100], vols = obs.map(x => x.vol).sort((a, b) => a - b), VCUT = [vols[Math.floor(vols.length / 3)], vols[Math.floor(vols.length * 2 / 3)]];
const cell = {}, bandEx = [[], [], [], [], []], qs = [[], [], [], [], []], sp = [], spA = [], spB = [], ALL = { 1: [], 6: [], 12: [] };
for (const md of M) { const rows = by.get(md) || []; const s = rows.slice().sort((x, y) => y.score - x.score), n = s.length; if (n < 100) continue;
  const w6 = s.filter(x => x.fw6 != null), m6 = mean(w6.map(x => x.fw6)), bx = [[], [], [], [], []];
  s.forEach((x, r) => { const b = BANDS.findIndex(c => 100 * r / n < c), v = x.vol < VCUT[0] ? 0 : x.vol < VCUT[1] ? 1 : 2; (cell[b + '_' + v] = cell[b + '_' + v] || []).push(x); if (x.fw6 != null) bx[b].push(x.fw6 - m6);
    for (const h of [1, 6, 12]) if (x['fw' + h] != null) ALL[h].push(x['fw' + h]); });
  if (w6.length > 100) { bx.forEach((a2, b) => bandEx[b].push(mean(a2))); const asc = w6.slice().sort((x, y) => x.score - y.score), k5 = asc.length;
    const qq = [0, 1, 2, 3, 4].map(k => mean(asc.slice(Math.floor(k * k5 / 5), Math.floor((k + 1) * k5 / 5)).map(x => x.fw6 - m6))); qq.forEach((v, k) => qs[k].push(v)); sp.push(qq[4] - qq[0]); (md < '2025-01-01' ? spA : spB).push(qq[4] - qq[0]); } }
const tstat = a => mean(a) / (sd(a) / Math.sqrt(a.length)) / Math.sqrt(6);
console.log(`새 식 5분위(6개월 초과): ${qs.map(a => pct(mean(a))).join(' / ')} · 상위−하위 ${pct(mean(sp))} (t ${tstat(sp).toFixed(1)}, 이긴 달 ${pct(sp.filter(x => x > 0).length / sp.length)}) · 앞 ${pct(mean(spA))} (t ${tstat(spA).toFixed(1)}) · 뒤 ${pct(mean(spB))} (t ${tstat(spB).toFixed(1)})`);
console.log('구간별 6개월 초과: ' + ['상위5%', '5~20%', '20~40%', '40~70%', '하위30%'].map((nm, b) => `${nm} ${pct(mean(bandEx[b]))} (이긴 달 ${pct(bandEx[b].filter(x => x > 0).length / bandEx[b].length)})`).join(' · '));
const summ = arr => { const s = arr.slice().sort((x, y) => x - y); return { n: s.length, med: +q(s, 0.5).toFixed(3), mean: +mean(s).toFixed(3), p25: +q(s, 0.25).toFixed(3), p75: +q(s, 0.75).toFixed(3), up: +(s.filter(x => x > 0).length / s.length).toFixed(3) }; };
const DIST = { vcut: VCUT.map(v => +v.toFixed(3)), cells: {}, all: { 1: summ(ALL[1]), 6: summ(ALL[6]), 12: summ(ALL[12]) } };
console.log('구간_변동성 | 6개월 P10/P25/중앙/P75/P90 | 목표도달 | 손절도달 | 1년 중앙(오른 비율)');
for (let b = 0; b < 5; b++) for (let v = 0; v < 3; v++) { const xs = (cell[b + '_' + v] || []).filter(x => x.fw6 != null), r = xs.map(x => x.fw6).sort((x, y) => x - y);
  const Q = [0.1, 0.25, 0.5, 0.75, 0.9].map(p => +q(r, p).toFixed(3)), stop = +Math.max(-0.25, Math.min(-0.08, Q[0])).toFixed(3);
  const hu = xs.filter(x => x.mx >= Q[3]).length / xs.length, hd = xs.filter(x => x.mn <= stop).length / xs.length, all = cell[b + '_' + v] || [];
  const h = { 1: summ(all.filter(x => x.fw1 != null).map(x => x.fw1)), 6: summ(r), 12: summ(all.filter(x => x.fw12 != null).map(x => x.fw12)) };
  DIST.cells[b + '_' + v] = { n: xs.length, q: Q, stop, hitUp: +hu.toFixed(3), hitDn: +hd.toFixed(3), h };
  console.log(`${['상위5%', '5~20%', '20~40%', '40~70%', '하위30%'][b]}_${['낮음', '중간', '높음'][v]} | ${Q.map(pct).join('/')} | ${pct(hu)} | ${pct(hd)} | ${pct(h[12].med)} (${pct(h[12].up)}, n${h[12].n})`); }
console.log(`변동성 경계 ${VCUT.map(pct).join(' / ')}`);
fs.writeFileSync(`${S}/dist_new.json`, JSON.stringify(DIST));
