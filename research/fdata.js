// Yahoo 일별 시세·재무 시계열 읽기 (검증·스크리닝 공용)
const fs = require('fs');
const dstr = t => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const c01 = v => Math.max(0, Math.min(1, v));

// 시세: [{d, c(종가), a(수정 종가), v(거래량)}], 배당: [{d, amt}]
function readPx(file) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0], adj = r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
  const bars = r.timestamp.map((t, i) => ({ d: dstr(t), c: q.close[i], a: adj ? adj[i] : q.close[i], v: q.volume[i] || 0 }))
    .filter(x => x.c > 0 && x.a > 0);
  const divs = Object.values((r.events && r.events.dividends) || {}).map(x => ({ d: dstr(x.date), amt: x.amount })).sort((x, y) => x.d < y.d ? -1 : 1);
  return { bars, divs };
}
// 재무: { 항목명: [{d(기준일), v}] } (오래된 순)
function readFund(file) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
  const res = j && j.timeseries && j.timeseries.result; if (!res) return null;
  const out = {};
  for (const x of res) {
    const k = x.meta && x.meta.type && x.meta.type[0]; if (!k || !x[k]) continue;
    out[k] = x[k].filter(e => e && e.reportedValue && Number.isFinite(e.reportedValue.raw)).map(e => ({ d: e.asOfDate, v: e.reportedValue.raw })).sort((a, b) => a.d < b.d ? -1 : 1);
  }
  return out;
}
// 공개 시차: 연간 실적은 결산일 + 92일(12월 결산이면 4월 초)부터 쓸 수 있다고 본다
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const knownAt = (arr, date, lag = 92) => { if (!arr) return null; let hit = null; for (const e of arr) if (addDays(e.d, lag) <= date) hit = e; return hit; };
// 가치 점수(검증 가능한 부분): PER 30 + PBR 30 + 배당 20 → 0~100 (주주환원 판단값 20은 제외)
function valueScore(per, pbr, dy) {
  const sPer = per > 0 ? c01((12 - per) / 10) : 0, sPbr = pbr > 0 ? c01((1.2 - pbr) / 1) : 0, sDy = c01(dy / 8);
  return { V: 100 * (0.3 * sPer + 0.3 * sPbr + 0.2 * sDy) / 0.8, sPer, sPbr, sDy };
}
module.exports = { readPx, readFund, knownAt, valueScore, mean, c01, addDays };
