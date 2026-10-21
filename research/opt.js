// 비중 찾기: 묶음별 비중을 0.1 단위로 바꿔가며, 매달 상위 10종목(추천 조건·업종 3개 상한) 1개월 보유 수익을 기간별로 비교
const fs = require('fs');
const [S] = process.argv.slice(2);
const { M, obs } = JSON.parse(fs.readFileSync(`${S}/fx_obs.json`, 'utf8'));
const by = new Map(); obs.forEach(x => { if (!by.has(x.md)) by.set(x.md, []); by.get(x.md).push(x); });
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
obs.forEach(x => { x.large = 100 - x.small; });
// 묶음: 안은 같은 비중
const G = { 가치: ['cheapPER', 'divYield'], 질: ['roe', 'lowVol'], 규모: ['large'], 추세: ['T', 'mom12'], 성장환원: ['EG', 'SH', 'DG'] };
const GK = Object.keys(G);
const gscore = x => { const o = {}; for (const g of GK) o[g] = mean(G[g].map(k => x[k])); return o; };
obs.forEach(x => { x.g = gscore(x); });
const CUR = x => 0.1125 * x.cheapPER + 0.1125 * x.cheapPBR + 0.075 * x.divYield + 0.3 * x.T + 0.1333 * (x.EG + x.SH + x.DG); // 지금 식 근사(백분위)
function perf(scoreFn, from, to, N = 10, cost = 0.0035) {
  let g = 1, prev = new Set(), n = 0;
  for (const md of M) { if (md < from || md > to) continue; const rows = (by.get(md) || []).filter(x => x.el && x.fw1 != null); if (rows.length < 50) continue;
    const s = rows.map(x => [scoreFn(x), x]).sort((a, b) => b[0] - a[0]), pick = [], sec = {};
    for (const [, x] of s) { if (pick.length >= N) break; if ((sec[x.s] || 0) >= 3) continue; pick.push(x); sec[x.s] = (sec[x.s] || 0) + 1; }
    const cur = new Set(pick.map(x => x.tk)), tr = prev.size ? [...cur].filter(x => !prev.has(x)).length / N : 1;
    g *= 1 + mean(pick.map(x => x.fw1)) - tr * cost; prev = cur; n++; }
  return { ann: Math.pow(g, 12 / n) - 1, n };
}
const A = ['0', '2024-12-31'], B = ['2025-01-01', '9'];
const pct = v => (v * 100).toFixed(1) + '%';
// 0.1 단위 격자
const grid = []; const rec = (i, left, w) => { if (i === GK.length - 1) { grid.push([...w, left]); return; } for (let k = 0; k <= left; k++) rec(i + 1, left - k, [...w, k]); }; rec(0, 10, []);
const res = grid.map(w10 => { const w = w10.map(v => v / 10), f = x => GK.reduce((s, g, i) => s + w[i] * x.g[g], 0);
  return { w, a: perf(f, ...A).ann, b: perf(f, ...B).ann, all: perf(f, '0', '9').ann }; });
const cur = { a: perf(CUR, ...A).ann, b: perf(CUR, ...B).ann, all: perf(CUR, '0', '9').ann };
const fmt = r => `${GK.map((g, i) => `${g} ${Math.round(r.w[i] * 100)}`).join(' / ')} → 앞 ${pct(r.a)} · 뒤 ${pct(r.b)} · 전체 ${pct(r.all)}`;
console.log(`조합 ${res.length}개\n지금 식(근사): 앞 ${pct(cur.a)} · 뒤 ${pct(cur.b)} · 전체 ${pct(cur.all)}`);
const rank = (key) => res.slice().sort((x, y) => y[key] - x[key]);
// 앞 기간 상위 → 뒤 기간 성적 (보지 않은 기간)
const topA = rank('a').slice(0, 20), topB = rank('b').slice(0, 20);
console.log(`\n[앞 기간으로 고른 상위 20개 → 뒤 기간 평균 ${pct(mean(topA.map(r => r.b)))} (지금 식 ${pct(cur.b)}), 그중 지금 식보다 나은 비율 ${topA.filter(r => r.b > cur.b).length}/20]`);
topA.slice(0, 5).forEach(r => console.log('  ' + fmt(r)));
console.log(`[뒤 기간으로 고른 상위 20개 → 앞 기간 평균 ${pct(mean(topB.map(r => r.a)))} (지금 식 ${pct(cur.a)}), 그중 지금 식보다 나은 비율 ${topB.filter(r => r.a > cur.a).length}/20]`);
topB.slice(0, 5).forEach(r => console.log('  ' + fmt(r)));
// 두 기간 모두 좋은 조합: 두 기간 중 낮은 쪽 기준
res.forEach(r => { r.min = Math.min(r.a, r.b); });
console.log('\n[두 기간 중 나쁜 쪽이 가장 좋은 조합 상위 10]'); rank('min').slice(0, 10).forEach(r => console.log('  ' + fmt(r)));
// 묶음별 평균 영향: 상위 10% 조합의 평균 비중
const top10p = rank('min').slice(0, Math.round(res.length * 0.05));
console.log('\n[두 기간 모두 좋은 상위 5% 조합의 평균 비중] ' + GK.map((g, i) => `${g} ${Math.round(mean(top10p.map(r => r.w[i])) * 100)}%`).join(' · '));
fs.writeFileSync(`${S}/opt_out.json`, JSON.stringify({ GK, cur, top: rank('min').slice(0, 50) }));
