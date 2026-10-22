// 종가 스코어링 갱신: 전 종목 시세·재무(Yahoo)만으로 자동 점수를 매기고, 그날의 추천 종목을 골라 대시보드 HTML을 만든다 (AI·공시 없음)
// 사용: node scoring/update.js [--open] [--fund]
//   --open  끝나면 브라우저로 열기
//   --web <폴더>  웹앱(PWA)용 index.html·data.json·설치 파일을 그 폴더에 만들기 (GitHub Actions에서 사용)
//   --fund  재무(EPS·자본·주식 수)를 전부 다시 받기 (분기 실적 시즌 뒤 권장. 없거나 45일 지난 파일은 자동으로 다시 받음)
const fs = require('fs'), path = require('path');
const SCORE = require('./score.js');
const TRADING = require('./trading.js');
const DIR = __dirname, DATA = path.join(DIR, 'data'), OUT = path.join(DIR, '..', '종가스코어링_대시보드.html');
const REC_N = 15, SECTOR_CAP = 3, CONC = +process.env.CONC || 10;
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const kst = t => new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const last = a => a && a.length ? a[a.length - 1] : null;
const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

const LIST = fs.readFileSync(path.join(DATA, 'list.txt'), 'utf8').trim().split('\n').map(l => l.split('\t'));
const HIST_F = path.join(DATA, 'history.json'), hist = rd(HIST_F, {});
const LAST_F = path.join(DATA, 'last_px.json'), lastPx = rd(LAST_F, {});

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ac.signal }); clearTimeout(to);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (i === 2) throw e; await new Promise(s => setTimeout(s, 1500 * (i + 1))); }
  }
}
async function pool(items, fn) {
  let i = 0, done = 0; const out = new Array(items.length);
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; }
      if (++done % 500 === 0) process.stdout.write(`  ${done}/${items.length}\n`); }
  }));
  return out;
}
const chartUrl = tk => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}?range=2y&interval=1d&events=div%2Csplit`;
const FUND_T = 'annualDilutedEPS,annualStockholdersEquity,annualOrdinarySharesNumber,quarterlyDilutedEPS,quarterlyStockholdersEquity,quarterlyOrdinarySharesNumber';
const fundUrl = tk => `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${tk}?type=${FUND_T}&period1=1420070400&period2=${Math.floor(Date.now() / 1000) + 86400}`;

function parseChart(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0], adj = r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
  const bars = r.timestamp.map((t, i) => ({ d: kst(t), h: q.high[i], l: q.low[i], c: q.close[i], a: adj ? adj[i] : q.close[i], v: q.volume[i] || 0 })).filter(b => b.c > 0);
  const divs = Object.values((r.events && r.events.dividends) || {}).map(x => ({ d: kst(x.date), amt: x.amount }));
  return { bars, divs, meta: r.meta };
}
function parseFund(j) {
  const res = j && j.timeseries && j.timeseries.result; if (!res) return null;
  const out = {};
  for (const x of res) { const k = x.meta && x.meta.type && x.meta.type[0]; if (!k || !x[k]) continue;
    out[k] = x[k].filter(e => e && e.reportedValue && Number.isFinite(e.reportedValue.raw)).map(e => ({ d: e.asOfDate, v: e.reportedValue.raw })).sort((a, b) => a.d < b.d ? -1 : 1); }
  return out;
}
// 최근 4개 분기 EPS: 최근 연간 + (그 뒤 분기들 − 1년 전 같은 분기들). 맞는 분기가 없으면 최근 연간
function ttmEps(fd) {
  const fy = last(fd.annualDilutedEPS), q = fd.quarterlyDilutedEPS || []; if (!fy) return null;
  let eps = fy.v;
  for (const x of q.filter(y => y.d > fy.d)) { const prev = q.find(y => y.d === addDays(x.d, -365) || y.d === addDays(x.d, -366)); if (!prev) return fy.v; eps += x.v - prev.v; }
  return eps;
}
const ttmDiv = (divs, d) => divs.filter(x => x.d > addDays(d, -365) && x.d <= d).reduce((s, x) => s + x.amt, 0);

(async () => {
  const t0 = Date.now(), refund = process.argv.includes('--fund');
  fs.mkdirSync(path.join(DATA, 'fund'), { recursive: true }); // 처음 실행(클라우드)이면 재무 폴더부터
  // 1) 재무: 없거나 45일 지났거나 --fund면 다시 받기
  const stale = LIST.filter(([tk]) => { const f = path.join(DATA, 'fund', tk + '.json'); return refund || !fs.existsSync(f) || Date.now() - fs.statSync(f).mtimeMs > 45 * 864e5; });
  if (stale.length) {
    console.log(`재무 받는 중: ${stale.length}종목`);
    await pool(stale, async ([tk]) => { const j = await get(fundUrl(tk)); if (j) fs.writeFileSync(path.join(DATA, 'fund', tk + '.json'), JSON.stringify(j)); });
  }
  // 2) 시세 (배당 증가를 보려고 2년치)
  console.log(`시세 받는 중: ${LIST.length}종목`);
  const kospi = parseChart(await get(chartUrl('^KS11')));
  const charts = await pool(LIST, async ([tk]) => parseChart(await get(chartUrl(tk))));
  const kb = kospi.bars, asOf = last(kb).d, regEnd = (kospi.meta.currentTradingPeriod || {}).regular?.end || 0;
  const final = !(asOf === kst(Date.now() / 1000) && Date.now() / 1000 < regEnd + 600);

  // 3) 종목 행: off=0 오늘(마지막 거래일), off=1 하루 전. 재무 값은 같고 시세만 하루 당겨 계산한다
  const ctxs = [], newLast = {}; let failed = 0, reused = 0;
  LIST.forEach(([tk, name, sector], i) => {
    const ch = charts[i];
    if (!ch || ch.bars.length < 2 || last(ch.bars).d < addDays(asOf, -7)) { failed++; if (lastPx[tk]) { reused++; newLast[tk] = lastPx[tk]; ctxs.push({ tk, old: lastPx[tk] }); } return; }
    const fd = parseFund(rd(path.join(DATA, 'fund', tk + '.json')));
    let e = 0, bps = 0, shares = 0, eg = null, sh = null;
    if (fd) {
      e = ttmEps(fd) || 0;
      const A = fd.annualDilutedEPS || [], s1 = last(fd.quarterlyOrdinarySharesNumber) || last(fd.annualOrdinarySharesNumber), eq = last(fd.quarterlyStockholdersEquity) || last(fd.annualStockholdersEquity);
      if (s1 && eq) { bps = eq.v / s1.v; shares = s1.v; }
      // 이익 증가율: 최근 연간 EPS vs 그 전 연간 (검증과 같은 정의)
      if (A.length >= 2) { const [p0, p1] = A.slice(-2).map(x => x.v); eg = p0 > 0 ? cap(p1 / p0 - 1, -1, 2) : p1 > 0 ? 1 : -1; }
      // 주식 수 변화: 최근 분기 vs 1년 전 같은 분기, 없으면 최근 연간 vs 그 전 연간 (+면 감소·소각)
      const Q = fd.quarterlyOrdinarySharesNumber || [], q1 = last(Q), q0 = q1 && Q.find(x => x.d === addDays(q1.d, -365) || x.d === addDays(q1.d, -366));
      const S = fd.annualOrdinarySharesNumber || [];
      if (q1 && q0 && q0.v > 0) sh = cap(1 - q1.v / q0.v, -0.3, 0.3); else if (S.length >= 2 && S[S.length - 2].v > 0) sh = cap(1 - S[S.length - 1].v / S[S.length - 2].v, -0.3, 0.3);
    }
    ctxs.push({ tk, code: tk.slice(0, 6), name, sector, ch, fd: !!fd, e, bps, shares, eg, sh });
  });
  function buildRow(c, off) {
    const all = c.ch.bars.slice(0, c.ch.bars.length - off); if (all.length < 2) return null;
    const b = all.slice(-252), n = b.length - 1, today = b[n];
    const hi = Math.max(...b.map(x => x.h ?? x.c)), lo = Math.min(...b.map(x => x.l ?? x.c));
    const tv = mean(b.slice(-20).map(x => x.c * x.v)) / 1e8;
    const jumps = b.some((x, k) => k > 0 && Math.abs(Math.log(x.a / b[k - 1].a)) > Math.log(1.35));
    const dv = ttmDiv(c.ch.divs, today.d), dv0 = ttmDiv(c.ch.divs, addDays(today.d, -365));
    const mc = c.shares ? today.c * c.shares / 1e8 : 0;
    const mom = all.length >= 253 ? all[all.length - 22].a / all[all.length - 253].a - 1 : null; // 12개월 모멘텀(최근 1개월 제외)
    const dg = dv0 > 0 ? cap(dv / dv0 - 1, -1, 2) : dv > 0 ? 1 : 0;
    // 순위 계산 대상(검증과 같은 조건): 재무 있음, 거래대금 3억·주가 1,000원 이상, 1년 안 비정상 점프 없음
    const base = c.fd && c.e !== 0 && c.bps > 0 && today.c / c.bps >= 0.05 && tv >= 3 && today.c >= 1000 && !jumps;
    const el = base && tv >= 10 && mc >= 1000 && c.e > 0;
    const row = { k: c.code, n: c.name, s: c.sector, d: today.d, p: today.c, ch: today.c / b[n - 1].c - 1, hi, lo, e: Math.round(c.e * 100) / 100, b: Math.round(c.bps), dv: Math.round(dv * 100) / 100,
      tv: Math.round(tv * 10) / 10, mc: Math.round(mc), eg: c.eg == null ? null : Math.round(c.eg * 1000) / 1000, sh: c.sh == null ? null : Math.round(c.sh * 1000) / 1000, dg: Math.round(dg * 1000) / 1000,
      mom: mom == null ? null : Math.round(mom * 1000) / 1000, lg: mc > 0 ? Math.round(Math.log(mc) * 1000) / 1000 : null, base, el };
    if (off) return row;
    // One prior-close suffix series serves both views: max(prior peaks, selected close).
    row.peaks = TRADING.peakSeries(all.slice(0, -1));
    const lr = b.slice(-121).map((x, k, a2) => k ? Math.log(x.a / a2[k - 1].a) : null).slice(1), lm = mean(lr);
    row.vol = lr.length > 60 ? Math.round(Math.sqrt(lr.reduce((s2, x) => s2 + (x - lm) ** 2, 0) / (lr.length - 1) * 252) * 1000) / 1000 : null; // 최근 120일 변동성(연)
    // 최근 1년 주간 종가 (그래프용): 주마다 마지막 거래일 종가
    const wk = []; b.forEach((x, k) => { const nx = b[k + 1]; if (!nx || (new Date(nx.d) - new Date(x.d)) / 864e5 >= 3 || new Date(nx.d).getUTCDay() < new Date(x.d).getUTCDay()) wk.push(x); });
    row.wd = wk.map(x => x.d.slice(2).replace(/-/g, '')).join(','); row.wc = wk.map(x => +x.c.toPrecision(6));
    const per = c.e > 0 ? today.c / c.e : 0, f = [];
    if (per > 0 && per < 2) f.push('PER 2배 미만 (일회성 이익인지 확인)');
    if (c.eg != null && c.eg < 0) f.push('작년 이익 감소');
    if (c.sh != null && c.sh <= -0.05) f.push('주식 수 5% 이상 증가 (증자 등)');
    row.f = f;
    return row;
  }
  // 4) 백분위 → 점수 → 순위 → 추천 (오늘·하루 전 같은 방식)
  function rank(rows) {
    const B = rows.filter(r => r.base);
    for (const [key, out] of [['eg', 'egp'], ['sh', 'shp'], ['dg', 'dgp'], ['mom', 'momp'], ['lg', 'lgp']]) {
      const has = B.filter(r => r[key] != null).sort((x, y) => x[key] - y[key]), n = has.length, vals = has.map(r => r[key]);
      rows.forEach(r => { if (r[key] == null || !n) { r[out] = 50; return; }
        let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; vals[m] < r[key] ? lo = m + 1 : hi = m; } // 같은 값은 같은 백분위
        r[out] = Math.round(100 * Math.min(lo, n - 1) / Math.max(1, n - 1)); });
    }
    // 52주 위치 분포 (점수 계산에서 백분위로 씀)
    const TS = B.map(r => +(100 * (r.hi > r.lo ? (r.p - r.lo) / (r.hi - r.lo) : 0.5)).toFixed(1)).sort((x, y) => x - y);
    SCORE.setT(TS);
    rows.forEach(r => { r.t = r.b > 0 ? +SCORE.score(r).total.toFixed(2) : null; });
    const sorted = B.map(r => r.t).sort((x, y) => y - x), cutAt = q => sorted[Math.min(sorted.length - 1, Math.floor(q / 100 * sorted.length))];
    const cut = { 5: cutAt(5), 20: cutAt(20), 40: cutAt(40), 70: cutAt(70) };
    const rankPct = t => { let k = 0; while (k < sorted.length && sorted[k] > t) k++; return Math.max(0.1, 100 * k / sorted.length); };
    rows.forEach(r => { if (r.t != null) r.rk = +rankPct(r.t).toFixed(1); });
    // 추천: 추천 조건(거래대금 10억·시총 1,000억·흑자) 통과 종목 중 점수순 최대 15개, 업종당 3개, 그날 −8% 급락 제외, 상위 20% 안
    const cand = rows.filter(r => r.el).sort((x, y) => y.t - x.t), recs = [], perSector = {};
    for (const r of cand) {
      if (recs.length >= REC_N || r.t < cut[20]) break;
      if ((perSector[r.s] || 0) >= SECTOR_CAP || r.ch <= -0.08) continue;
      recs.push(r.k); perSector[r.s] = (perSector[r.s] || 0) + 1;
    }
    return { B, TS, cut, cand, recs };
  }
  const live = ctxs.filter(c => c.ch);
  // 하루 전 기준 (오늘 할 일 계산용)
  const prows = live.map(c => buildRow(c, 1)).filter(Boolean), P1 = rank(prows), pdate = prows.length ? prows.map(r => r.d).sort().pop() : null;
  const prevSnap = { date: pdate, recs: P1.recs, rk: {}, p: {}, ch: {} };
  prows.filter(r => r.rk != null).forEach(r => { prevSnap.rk[r.k] = r.rk; prevSnap.p[r.k] = r.p; prevSnap.ch[r.k] = +r.ch.toFixed(4); });
  // 오늘 기준
  const rows = live.map(c => { const r = buildRow(c, 0); newLast[c.tk] = r; return r; }).filter(Boolean);
  ctxs.filter(c => c.old).forEach(c => rows.push({ ...c.old, old: c.old.d }));
  const { B, TS, cut, cand, recs } = rank(rows);
  fs.writeFileSync(LAST_F, JSON.stringify(newLast));

  // 6) 기록 (종가일 때만, 최근 90일): 추천 목록·순위·추천 종목 가격 (지난 추천 성과 계산용)
  if (!hist[pdate] && pdate) hist[pdate] = { recs: P1.recs, rk: prevSnap.rk, rp: Object.fromEntries(P1.recs.map(k => [k, prevSnap.p[k]])) };
  const prevDate = Object.keys(hist).filter(d => d < asOf).sort().pop() || null, prev = prevDate ? hist[prevDate] : null;
  if (final) {
    hist[asOf] = { recs, rk: Object.fromEntries(rows.filter(r => r.rk != null).map(r => [r.k, r.rk])), rp: Object.fromEntries(recs.map(k => [k, rows.find(r => r.k === k).p])) };
    Object.keys(hist).sort().slice(0, -90).forEach(d => delete hist[d]);
  }
  fs.writeFileSync(HIST_F, JSON.stringify(hist));
  // 지난 추천 성과: 그날 추천 종목을 그날 종가에 샀다면 지금까지 수익
  const byK = Object.fromEntries(rows.map(r => [r.k, r]));
  const recPerf = Object.keys(hist).filter(d => d < asOf && hist[d].rp).sort().reverse().slice(0, 30).map(d => {
    const rs = Object.entries(hist[d].rp).filter(([k]) => byK[k]).map(([k, p0]) => [k, byK[k].p / p0 - 1]);
    return { d, n: rs.length, avg: rs.length ? +(rs.reduce((s2, x) => s2 + x[1], 0) / rs.length).toFixed(4) : 0, up: rs.filter(x => x[1] > 0).length, items: rs.map(([k, r]) => [k, +r.toFixed(4)]) };
  });
  const forecast = rd(path.join(DIR, 'calendar.json'), { sessions: [] });
  const tradingCalendar = { sessions: [...new Set([...forecast.sessions.filter(d => d < kb[0].d || d > asOf), ...kb.map(b => b.d)])].sort(), observedThrough: asOf, forecastThrough: forecast.through, source: forecast.source };
  const rankHistory = Object.fromEntries(Object.keys(hist).filter(d => d <= asOf).sort().map(d => [d, hist[d].rk]));
  const META = { asOf, final, tradingCalendar, rankHistory, kospi: last(kb).c, kchg: last(kb).c / kb[kb.length - 2].c - 1, prevDate, prevRecs: prev ? prev.recs : null, prevRk: prev ? prev.rk : {},
    builtAt: new Date().toISOString(), recs, cut, tsort: TS, base: B.length, eligible: cand.length, total: rows.length, failed, reused, prevSnap, recPerf,
    fundOldest: (() => { const t = fs.readdirSync(path.join(DATA, 'fund')).map(f => fs.statSync(path.join(DATA, 'fund', f)).mtimeMs); return new Date(Math.min(...t) + 9 * 3600e3).toISOString().slice(0, 10); })() };

  const tpl = fs.readFileSync(path.join(DIR, 'template.html'), 'utf8').replace('/*__TRADING__*/', () => fs.readFileSync(path.join(DIR, 'trading.js'), 'utf8')).replace('/*__OCR__*/', () => fs.readFileSync(path.join(DIR, 'ocr.js'), 'utf8')), scoreJs = fs.readFileSync(path.join(DIR, 'score.js'), 'utf8');
  const simJson = fs.existsSync(path.join(DATA, 'sim.json')) ? fs.readFileSync(path.join(DATA, 'sim.json'), 'utf8') : 'null';
  // 파일 버전: 데이터를 HTML 안에 넣는다
  const html = tpl.replace('/*__SCORE__*/', () => scoreJs).replace('/*__END__*/', '})();')
    .replace('/*__BOOT__*/', () => `(async () => {\nconst META = ${JSON.stringify(META)};\nconst ROWS = ${JSON.stringify(rows)};\nconst SIM = ${simJson};`);
  fs.writeFileSync(OUT, html, 'utf8');
  // 웹앱 버전: 화면은 index.html, 데이터는 data.json (열 때마다 새로 받음)
  const wi = process.argv.indexOf('--web');
  if (wi > 0) {
    const WD = path.resolve(process.argv[wi + 1] || 'site'), WEB = path.join(DIR, 'web');
    fs.mkdirSync(WD, { recursive: true });
    const boot = `window.WEB_MODE = true;
(async () => {
let D = null;
try { const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); D = await r.json(); }
catch (e) { try { const c = await caches.match(new URL('data.json', location.href).href); if (c) { D = await c.json(); window.OFFLINE = true; } } catch (e2) {} }
if (!D) { document.querySelector('main').innerHTML = '<p class="empty">데이터를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 열어 주세요.</p>'; return; }
const { META, ROWS, SIM } = D;`;
    const head = '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n<script>if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js"));</script>\n</head>';
    fs.writeFileSync(path.join(WD, 'index.html'), tpl.replace('/*__SCORE__*/', () => scoreJs).replace('/*__BOOT__*/', () => boot).replace('/*__END__*/', '})();').replace('</head>', () => head), 'utf8');
    fs.writeFileSync(path.join(WD, 'data.json'), `{"META":${JSON.stringify(META)},"ROWS":${JSON.stringify(rows)},"SIM":${simJson}}`, 'utf8');
    for (const f of fs.readdirSync(WEB)) fs.cpSync(path.join(WEB, f), path.join(WD, f), { recursive: true });
    console.log('웹앱 파일:', WD);
  }
  console.log(`${asOf} ${final ? '종가' : '장중 잠정'} · 전 종목 ${rows.length} · 순위 대상 ${B.length} · 추천 조건 ${cand.length} · 추천 ${recs.length} · 받기 실패 ${failed}(직전 값 ${reused}) · ${Math.round((Date.now() - t0) / 1000)}초`);
  console.log(`  구간 경계 점수: 상위5% ${cut[5].toFixed(1)} · 20% ${cut[20].toFixed(1)} · 40% ${cut[40].toFixed(1)} · 70% ${cut[70].toFixed(1)}`);
  recs.forEach((k, i) => { const r = rows.find(y => y.k === k); console.log(`  ${i + 1}. ${r.n} ${r.p.toLocaleString()}원 ${r.t.toFixed(1)}점 (상위 ${r.rk}%)`); });
  console.log('저장:', OUT);
  if (process.argv.includes('--open')) require('child_process').exec(`start "" "${OUT}"`);
})().catch(e => { console.error('갱신 실패:', e.stack || e.message); process.exit(1); });
