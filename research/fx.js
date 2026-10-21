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
      fw1: i + 21 < b.length && jumps(i + 1, i + 21) === 0 ? a[i + 21] / a[i] - 1 : null,
      fw6: i + 126 < b.length && jumps(i + 1, i + 126) === 0 ? a[i + 126] / a[i] - 1 : null,
    };
    obs.push(f);
  }
}
const FAC = ['cheapPER', 'cheapPBR', 'divYield', 'V', 'T', 'mom12', 'mom6', 'rev1', 'lowVol', 'small', 'roe', 'EG', 'SH', 'DG'];
const NAME = { cheapPER: 'PER 낮음', cheapPBR: 'PBR 낮음', divYield: '배당수익률', V: '가치(지금 식)', T: '추세(52주 위치)', mom12: '12개월 모멘텀', mom6: '6개월 모멘텀', rev1: '1개월 되돌림', lowVol: '낮은 변동성', small: '소형주', roe: 'ROE(수익성)', EG: '이익 증가', SH: '주식 수 감소', DG: '배당 증가' };
const by = new Map(); obs.forEach(x => { if (!by.has(x.md)) by.set(x.md, []); by.get(x.md).push(x); });
// 달마다 백분위
for (const rows of by.values()) for (const k of FAC) {
  const has = rows.filter(x => x[k] != null && Number.isFinite(x[k])).sort((x, y) => x[k] - y[k]), n = has.length;
  has.forEach((x, r) => { x['p_' + k] = n > 1 ? 100 * r / (n - 1) : 50; }); rows.filter(x => x['p_' + k] == null).forEach(x => { x['p_' + k] = 50; });
}
fs.writeFileSync(`${S}/fx_obs.json`, JSON.stringify({ M, FAC, NAME, obs: obs.map(x => { const o = { md: x.md, tk: x.tk, s: x.sector, el: x.el, fw1: x.fw1, fw6: x.fw6 }; FAC.forEach(k => { o[k] = Math.round(x['p_' + k] * 10) / 10; }); return o; }) }));
const pct = v => (v * 100).toFixed(1) + '%';
const HALF = ['2025-01-01'];
function spread(key, from = '0', to = '9') {
  const sp = [];
  for (const md of M) { if (md < from || md > to) continue; const rows = (by.get(md) || []).filter(x => x.fw6 != null); if (rows.length < 100) continue;
    const s = rows.slice().sort((x, y) => x['p_' + key] - y['p_' + key]), n = s.length, q = k => s.slice(Math.floor(k * n / 5), Math.floor((k + 1) * n / 5));
    sp.push(mean(q(4).map(x => x.fw6)) - mean(q(0).map(x => x.fw6))); }
  return { s: mean(sp), t: mean(sp) / (sd(sp) / Math.sqrt(sp.length)) / Math.sqrt(6) };
}
console.log(`관측 ${obs.length}건\n[항목별 단독: 상위−하위 20%, 이후 6개월 / 앞 기간(~2024) / 뒤 기간(2025~)]`);
for (const k of FAC) { const a = spread(k), h1 = spread(k, '0', '2024-12-31'), h2 = spread(k, '2025-01-01'); console.log(`${NAME[k]}: ${pct(a.s)} (t ${a.t.toFixed(1)}) · 앞 ${pct(h1.s)} (t ${h1.t.toFixed(1)}) · 뒤 ${pct(h2.s)} (t ${h2.t.toFixed(1)})`); }
// 항목 간 상관(백분위 기준)
const corr = (k1, k2) => { const xs = obs.map(x => x['p_' + k1]), ys = obs.map(x => x['p_' + k2]), mx = mean(xs), my = mean(ys); let c = 0, vx = 0, vy = 0; for (let i = 0; i < xs.length; i++) { c += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; } return c / Math.sqrt(vx * vy); };
console.log('\n[상관 높은 쌍]'); const pairs = []; FAC.forEach((a1, i) => FAC.slice(i + 1).forEach(b1 => pairs.push([a1, b1, corr(a1, b1)]))); pairs.sort((x, y) => Math.abs(y[2]) - Math.abs(x[2])).slice(0, 10).forEach(([a1, b1, c]) => console.log(`${NAME[a1]} ~ ${NAME[b1]}: ${c.toFixed(2)}`));
