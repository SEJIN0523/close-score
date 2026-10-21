// 자동 점수와 매수·매도 신호 (update.js와 대시보드가 함께 쓴다). AI·공시 없이 시세·재무 데이터만 쓴다
// 점수 = 0.40×규모 + 0.40×추세 + 0.20×성장·환원 (모두 그날 전 종목 중 백분위, 0~100)
//   규모: 시가총액이 클수록 높음, 추세: 52주 범위 안 위치와 12개월 모멘텀(최근 1개월 제외) 반반,
//   성장·환원: 이익 증가·주식 수 감소·배당 증가 같은 비중. 가치(PER·PBR·배당)는 참고로만 보여준다
// 항목별 검증과 기간을 나눈 비중 검증(2023.4~2024.12로 고르고 2025~2026.9로 확인, 반대도)으로 정했다
// 신호는 그날 전 종목 중 순위로 정한다 (검증: 상위 5% +17.7%, 5~20% +7.7%, 20~40% +1.7%, 40~70% −1.8%, 하위 30% −6.3%, 이후 6개월 평균 대비)
const SCORE = (() => {
  const c01 = v => Math.max(0, Math.min(1, v));
  const BANDS = [[5, '적극 매수'], [20, '매수'], [40, '탐색 매수'], [70, '관망'], [100, '보류']];
  // 과거(2023.4~2026.9) 같은 순위 구간 × 변동성(연 41%·60% 경계)이었던 종목의 이후 6개월 실제 수익 분포
  // h: 1·6·12개월 뒤 수익 (med 중앙값, mean 평균, p25~p75, up 오른 비율)
  // q: 하위10%·25%·중앙·상위25%·10% 수익, stop: 손절선(하위10%, −8%~−25%로 제한), hitUp/hitDn: 6개월 안에 목표(q[3])/손절선에 한 번이라도 닿은 비율
  const DIST = {"vcut":[0.41,0.603],"cells":{"0_0":{"n":995,"q":[-0.151,-0.018,0.138,0.328,0.519],"stop":-0.151,"hitUp":0.4,"hitDn":0.229,"h":{"1":{"n":1017,"med":0.01,"mean":0.026,"p25":-0.035,"p75":0.07,"up":0.557},"6":{"n":995,"med":0.138,"mean":0.186,"p25":-0.018,"p75":0.328,"up":0.722},"12":{"n":894,"med":0.348,"mean":0.44,"p25":0.075,"p75":0.618,"up":0.821}}},"0_1":{"n":855,"q":[-0.314,-0.167,0.057,0.427,0.94],"stop":-0.25,"hitUp":0.412,"hitDn":0.322,"h":{"1":{"n":917,"med":0.002,"mean":0.028,"p25":-0.089,"p75":0.109,"up":0.501},"6":{"n":855,"med":0.057,"mean":0.234,"p25":-0.167,"p75":0.427,"up":0.559},"12":{"n":645,"med":0.145,"mean":0.513,"p25":-0.2,"p75":0.724,"up":0.588}}},"0_2":{"n":706,"q":[-0.39,-0.214,0.061,0.487,0.925],"stop":-0.25,"hitUp":0.459,"hitDn":0.424,"h":{"1":{"n":1011,"med":-0.016,"mean":0.025,"p25":-0.154,"p75":0.158,"up":0.463},"6":{"n":706,"med":0.061,"mean":0.211,"p25":-0.214,"p75":0.487,"up":0.545},"12":{"n":530,"med":0.005,"mean":0.41,"p25":-0.368,"p75":0.676,"up":0.506}}},"1_0":{"n":2869,"q":[-0.189,-0.077,0.059,0.226,0.458],"stop":-0.189,"hitUp":0.464,"hitDn":0.211,"h":{"1":{"n":2966,"med":0.005,"mean":0.019,"p25":-0.045,"p75":0.063,"up":0.523},"6":{"n":2869,"med":0.059,"mean":0.111,"p25":-0.077,"p75":0.226,"up":0.602},"12":{"n":2506,"med":0.142,"mean":0.288,"p25":-0.071,"p75":0.433,"up":0.668}}},"1_1":{"n":2481,"q":[-0.315,-0.177,0.013,0.296,0.677],"stop":-0.25,"hitUp":0.457,"hitDn":0.307,"h":{"1":{"n":2729,"med":-0.007,"mean":0.023,"p25":-0.088,"p75":0.096,"up":0.477},"6":{"n":2481,"med":0.013,"mean":0.142,"p25":-0.177,"p75":0.296,"up":0.519},"12":{"n":1958,"med":-0.006,"mean":0.262,"p25":-0.247,"p75":0.446,"up":0.492}}},"1_2":{"n":2148,"q":[-0.462,-0.309,-0.109,0.27,0.839],"stop":-0.25,"hitUp":0.549,"hitDn":0.546,"h":{"1":{"n":3065,"med":-0.034,"mean":0.007,"p25":-0.159,"p75":0.132,"up":0.438},"6":{"n":2148,"med":-0.109,"mean":0.084,"p25":-0.309,"p75":0.27,"up":0.402},"12":{"n":1552,"med":-0.14,"mean":0.189,"p25":-0.38,"p75":0.402,"up":0.401}}},"2_0":{"n":4014,"q":[-0.22,-0.111,0.005,0.163,0.389],"stop":-0.22,"hitUp":0.495,"hitDn":0.201,"h":{"1":{"n":4242,"med":-0.003,"mean":0.01,"p25":-0.052,"p75":0.055,"up":0.48},"6":{"n":4014,"med":0.005,"mean":0.072,"p25":-0.111,"p75":0.163,"up":0.508},"12":{"n":3304,"med":0.028,"mean":0.159,"p25":-0.14,"p75":0.29,"up":0.543}}},"2_1":{"n":3353,"q":[-0.351,-0.22,-0.049,0.196,0.57],"stop":-0.25,"hitUp":0.536,"hitDn":0.376,"h":{"1":{"n":3774,"med":-0.02,"mean":0.009,"p25":-0.092,"p75":0.075,"up":0.427},"6":{"n":3353,"med":-0.049,"mean":0.061,"p25":-0.22,"p75":0.196,"up":0.437},"12":{"n":2728,"med":-0.069,"mean":0.161,"p25":-0.282,"p75":0.303,"up":0.433}}},"2_2":{"n":2628,"q":[-0.448,-0.3,-0.121,0.131,0.601],"stop":-0.25,"hitUp":0.654,"hitDn":0.555,"h":{"1":{"n":3647,"med":-0.041,"mean":-0.01,"p25":-0.154,"p75":0.086,"up":0.401},"6":{"n":2628,"med":-0.121,"mean":0.021,"p25":-0.3,"p75":0.131,"up":0.358},"12":{"n":1974,"med":-0.163,"mean":0.084,"p25":-0.385,"p75":0.168,"up":0.344}}},"3_0":{"n":5971,"q":[-0.251,-0.151,-0.035,0.111,0.326],"stop":-0.25,"hitUp":0.567,"hitDn":0.206,"h":{"1":{"n":6388,"med":-0.008,"mean":0.007,"p25":-0.058,"p75":0.047,"up":0.451},"6":{"n":5971,"med":-0.035,"mean":0.027,"p25":-0.151,"p75":0.111,"up":0.422},"12":{"n":4691,"med":-0.047,"mean":0.061,"p25":-0.191,"p75":0.162,"up":0.43}}},"3_1":{"n":5265,"q":[-0.344,-0.22,-0.062,0.153,0.532],"stop":-0.25,"hitUp":0.575,"hitDn":0.369,"h":{"1":{"n":5905,"med":-0.017,"mean":0.008,"p25":-0.087,"p75":0.066,"up":0.437},"6":{"n":5265,"med":-0.062,"mean":0.048,"p25":-0.22,"p75":0.153,"up":0.409},"12":{"n":4364,"med":-0.092,"mean":0.119,"p25":-0.294,"p75":0.228,"up":0.4}}},"3_2":{"n":3844,"q":[-0.444,-0.3,-0.128,0.084,0.423],"stop":-0.25,"hitUp":0.697,"hitDn":0.526,"h":{"1":{"n":5243,"med":-0.041,"mean":-0.017,"p25":-0.145,"p75":0.071,"up":0.391},"6":{"n":3844,"med":-0.128,"mean":-0.031,"p25":-0.3,"p75":0.084,"up":0.329},"12":{"n":2976,"med":-0.171,"mean":0.065,"p25":-0.36,"p75":0.138,"up":0.328}}},"4_0":{"n":4888,"q":[-0.317,-0.216,-0.09,0.051,0.278],"stop":-0.25,"hitUp":0.717,"hitDn":0.334,"h":{"1":{"n":5197,"med":-0.02,"mean":-0.003,"p25":-0.071,"p75":0.039,"up":0.397},"6":{"n":4888,"med":-0.09,"mean":-0.021,"p25":-0.216,"p75":0.051,"up":0.326},"12":{"n":3740,"med":-0.13,"mean":-0.035,"p25":-0.268,"p75":0.048,"up":0.301}}},"4_1":{"n":5572,"q":[-0.374,-0.246,-0.096,0.095,0.378],"stop":-0.25,"hitUp":0.656,"hitDn":0.412,"h":{"1":{"n":6285,"med":-0.025,"mean":-0.003,"p25":-0.094,"p75":0.057,"up":0.405},"6":{"n":5572,"med":-0.096,"mean":-0.012,"p25":-0.246,"p75":0.095,"up":0.354},"12":{"n":4548,"med":-0.145,"mean":0.04,"p25":-0.321,"p75":0.094,"up":0.323}}},"4_2":{"n":4302,"q":[-0.431,-0.298,-0.137,0.06,0.36],"stop":-0.25,"hitUp":0.742,"hitDn":0.521,"h":{"1":{"n":5977,"med":-0.037,"mean":-0.013,"p25":-0.129,"p75":0.066,"up":0.392},"6":{"n":4302,"med":-0.137,"mean":-0.049,"p25":-0.298,"p75":0.06,"up":0.309},"12":{"n":3448,"med":-0.203,"mean":-0.025,"p25":-0.4,"p75":0.079,"up":0.306}}}},"all":{"1":{"n":58363,"med":-0.017,"mean":0.003,"p25":-0.09,"p75":0.064,"up":0.433},"6":{"n":49891,"med":-0.054,"mean":0.037,"p25":-0.213,"p75":0.148,"up":0.416},"12":{"n":39858,"med":-0.075,"mean":0.115,"p25":-0.274,"p75":0.235,"up":0.419}}};

  // 52주 위치는 가격에 따라 바뀌므로, 그날 전 종목의 52주 위치 분포(오름차순)로 백분위를 다시 구한다
  let TS = [];
  const setT = arr => { TS = arr || []; };
  const pctT = t => { if (!TS.length) return t; let lo = 0, hi = TS.length; while (lo < hi) { const m = (lo + hi) >> 1; TS[m] < t ? lo = m + 1 : hi = m; } return 100 * Math.min(lo, TS.length - 1) / Math.max(1, TS.length - 1); };
  // s: 종목 행, p: 계산할 가격(기본 종가)
  function score(s, p = s.p) {
    const per = s.e > 0 ? p / s.e : 0, pbr = s.b > 0 ? p / s.b : 0, dy = (s.dv || 0) / p * 100;
    const sPer = per > 0 ? c01((12 - per) / 10) : 0, sPbr = pbr > 0 ? c01((1.2 - pbr) / 1) : 0;
    const V = 100 * (0.3 * sPer + 0.3 * sPbr + 0.2 * c01(dy / 8)) / 0.8;
    const H = Math.max(s.hi, p), L = Math.min(s.lo, p), T = 100 * (H > L ? (p - L) / (H - L) : 0.5);
    const Tp = pctT(T), trend = (Tp + s.momp) / 2, growth = (s.egp + s.shp + s.dgp) / 3;
    const total = 0.4 * s.lgp + 0.4 * trend + 0.2 * growth;
    return { per, pbr, dy, V, T, Tp, trend, growth, size: s.lgp, total };
  }
  // 점수 → 그날 순위 구간 (cut: 상위 5·20·40·70% 경계 점수)
  const band = (t, cut) => t >= cut[5] ? 0 : t >= cut[20] ? 1 : t >= cut[40] ? 2 : t >= cut[70] ? 3 : 4;
  const tickOf = p => p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000;
  const tick = (p, up) => { const t = tickOf(p); return (up ? Math.ceil(p / t) : Math.floor(p / t)) * t; };
  // 종가가 이 값 이상이면 '매수'(상위 20%) / 이 값 아래면 '보류'(하위 30%) 구간. 없으면 null
  function lines(s, cut) {
    const now = score(s).total; let buy = null, sell = null;
    if (now < cut[20]) for (let x = s.p; x <= s.p * 2; x += s.p * 0.002) if (score(s, x).total >= cut[20]) { buy = tick(x, true); break; }
    if (now >= cut[70]) for (let x = s.p; x >= s.p * 0.4; x -= s.p * 0.002) if (score(s, x).total < cut[70]) { sell = tick(x, false); break; }
    return { buy, sell };
  }
  // 목표가·손절가 시나리오. base: 기준 가격(새로 살 때 종가)
  function plan(s, b) {
    if (b == null || s.vol == null) return null;
    const v = s.vol < DIST.vcut[0] ? 0 : s.vol < DIST.vcut[1] ? 1 : 2, c = DIST.cells[b + '_' + v];
    return { v, n: c.n, q: c.q, prices: c.q.map(x => tick(s.p * (1 + x), false)), target: tick(s.p * (1 + c.q[3]), true), mid: tick(s.p * (1 + c.q[2]), false), stop: tick(s.p * (1 + c.stop), false), stopPct: c.stop, upPct: c.q[3], hitUp: c.hitUp, hitDn: c.hitDn, h: c.h };
  }
  const won = v => Math.round(v).toLocaleString('ko-KR');
  const pct = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';

  // 신호와 할 일. hold: {price, qty} 또는 null
  function decide(s, f, b, ln, hold, pl) {
    const flags = [];
    if (s.ch >= 0.15) flags.push(`하루 ${pct(s.ch)} 급등 · 흔들림이 클 수 있음 (검증상 건너뛰지 않는 편이 나았음)`);
    if (s.ch <= -0.08) flags.push(`하루 ${pct(s.ch)} 급락 · 원인 확인 전 신규 매수 금지`);
    (s.f || []).forEach(x => flags.push(x));
    if (hold && hold.price > 0) {
      const g = s.p / hold.price - 1, hard = hold.price * 0.8, trail = pl ? Math.max(hard, pl.stop) : hard, stopAt = won(trail);
      if (g <= -0.2) return { k: 'stop', act: `매수가 대비 ${pct(g)} · 손절선(−20%) 도달 → <b>전량 매도</b>`, flags, gain: g };
      if (hold.target && s.p >= hold.target) return { k: 'take', act: `목표가 ${won(hold.target)}원 도달 → <b>절반 매도</b>, 나머지는 손절가 ${stopAt}원으로 올려 보유`, flags, gain: g };
      if (b === 4) return { k: 'sell', act: '순위가 하위 30%로 떨어짐 → <b>매도</b>', flags, gain: g };
      if (b === 3) return { k: 'trim', act: `순위가 상위 40% 밖 → <b>비중 절반으로</b>${ln.sell ? ` · 종가 ${won(ln.sell)}원 아래면 매도` : ''} · 손절가 ${stopAt}원`, flags, gain: g };
      return { k: 'hold', act: `<b>보유 유지</b>${b <= 1 ? ' (추가 매수 가능)' : ''} · 손절가 <b>${stopAt}원</b>${hold.target ? ` · 목표 ${won(hold.target)}원` : ''}`, flags, gain: g };
    }
    let k, act;
    const lim3 = tick(s.p * 0.97, false), lim5 = tick(s.p * 0.95, false);
    if (b === 0) { k = 'strong'; act = `다음 거래일 <b>15:20~15:30 장 마감 동시호가</b>에 한 종목 몫 매수`; }
    else if (b === 1) { k = 'buy'; act = `다음 거래일 <b>15:20~15:30 장 마감 동시호가</b>에 한 종목 몫 매수`; }
    else if (b === 2) { k = 'probe'; act = `다음 거래일 15:20~15:30 장 마감 동시호가에 <b>한 종목 몫의 40%만</b> 매수`; }
    else if (b === 3) { k = 'wait'; act = `새로 사지 않음${ln.buy ? ` · 종가 <b>${won(ln.buy)}원</b> 이상이면 매수 구간(상위 20%)` : ''}`; }
    else { k = 'avoid'; act = '사지 않음 (하위 30%)'; }
    if (b <= 2 && s.ch <= -0.08) { k = 'wait'; act = '급락 원인을 확인하기 전까지 <b>매수 보류</b>'; }
    else if (b <= 2 && pl) act += `<br>🎯 목표 <b>${won(pl.target)}원</b> (${pct(pl.upPct, 0)}) · 🛑 손절 <b>${won(pl.stop)}원</b> (${pct(pl.stopPct, 0)}) · 6개월 기준`;
    if (pl) act += `<br>📅 기대수익(과거 중앙값) 1개월 <b>${pct(pl.h[1].med)}</b> · 6개월 <b>${pct(pl.h[6].med)}</b> · 1년 <b>${pct(pl.h[12].med)}</b>`;
    return { k, act, flags };
  }
  // 보유 종목 매일 점검 (가상 1억 운용 검증으로 정한 규칙)
  // pos: {qty, avg, maxP(매수 뒤 최고 종가), stopPct, upPct, lastD(마지막 매매일)}, cfg: {capital 총 운용 금액, slots 목표 종목 수}
  // 손절가는 '평균 매수가'와 '매수 뒤 최고 종가' 중 높은 값에서 stopPct만큼 아래 → 주가가 오르면 따라 올라감(트레일링)
  function manage(s, b, pos, cfg, asOf) {
    const val = pos.qty * s.p, target = cfg.capital / cfg.slots, gain = s.p / pos.avg - 1;
    const stop = tick(Math.max(pos.avg, pos.maxP) * (1 + pos.stopPct), false), ref = tick(pos.avg * (1 + pos.upPct), true);
    const days = (new Date(asOf) - new Date(pos.lastD)) / 864e5, flags = [];
    if (s.ch <= -0.08) flags.push(`하루 ${pct(s.ch)} 급락 · 원인 확인 전 추가 매수 금지`);
    const half = Math.floor(pos.qty / 2), base = { stop, ref, gain, val, target, flags };
    if (s.p <= stop) return { ...base, light: 'red', k: 'stop', act: `손절가 ${won(stop)}원 이하로 마감 → 다음 거래일 15:20~15:30 <b>전량 매도 ${pos.qty.toLocaleString()}주</b> (약 ${won(val)}원)`, sellQty: pos.qty };
    if (b === 4) return { ...base, light: 'red', k: 'sell', act: `순위가 하위 30%로 떨어짐 → 다음 거래일 15:20~15:30 <b>전량 매도 ${pos.qty.toLocaleString()}주</b> (약 ${won(val)}원)`, sellQty: pos.qty };
    if (b === 3 && val > 0.6 * target && half > 0) return { ...base, light: 'yellow', k: 'trim', act: `순위가 상위 40% 밖 → 다음 거래일 15:20~15:30 <b>절반 매도 ${half.toLocaleString()}주</b> (약 ${won(half * s.p)}원)`, sellQty: half };
    if (s.p <= stop * 1.05) return { ...base, light: 'yellow', k: 'near', act: `<b>보유 유지</b> · 손절가 ${won(stop)}원까지 ${pct(stop / s.p - 1)} 남음, 추가 매수하지 않음` };
    const addN = Math.floor((target - val) / s.p), nb = (pos.buys || []).length || 1, since = (new Date(asOf) - new Date(pos.firstD || pos.lastD)) / 864e5;
    // 분할 매수: 첫 매수 뒤 7일·14일(약 5·10거래일)에 아직 상위 20%면 1/3씩 더 산다
    if (b <= 1 && nb < 3 && val < target * 0.95 && days >= 5 && since >= 7 * nb && s.ch > -0.08) { const n3 = Math.floor(Math.min(target / 3, target - val) / s.p);
      if (n3 > 0) return { ...base, light: 'green', k: 'add', act: `분할 매수 ${nb + 1}/3번째 · 아직 상위 20% → 다음 거래일 15:20~15:30 <b>추가 매수 ${n3.toLocaleString()}주</b> (약 ${won(n3 * s.p)}원)`, buyQty: n3 }; }
    if (b <= 1 && val < 0.6 * target && days >= 7 && addN > 0 && s.ch > -0.08) return { ...base, light: 'green', k: 'add', act: `상위 20% 유지 · 비중이 목표의 ${Math.round(val / target * 100)}% → 다음 거래일 15:20~15:30 <b>추가 매수 ${addN.toLocaleString()}주</b> (약 ${won(addN * s.p)}원)`, buyQty: addN };
    return { ...base, light: 'green', k: 'hold', act: `<b>보유 유지</b> · 손절가 <b>${won(stop)}원</b> (종가 기준, 주가가 오르면 따라 올라감)` };
  }
  return { score, setT, band, lines, decide, plan, manage, BANDS, won, pct, tick, DIST };
})();
if (typeof module !== 'undefined') module.exports = SCORE;
