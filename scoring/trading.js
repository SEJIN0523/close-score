// Shared execution rules for the dashboard and research simulator. No storage or network access.
const TRADING = (() => {
  'use strict';
  const VERSION = 2, dateOK = d => /^\d{4}-\d{2}-\d{2}$/.test(d || ''), finite = x => Number.isFinite(x);
  const band = rk => !finite(rk) ? null : rk < 5 ? 0 : rk < 20 ? 1 : rk < 40 ? 2 : rk < 70 ? 3 : 4;
  const tick = (p, up = false) => { const t = p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000; return (up ? Math.ceil(p / t) : Math.floor(p / t)) * t; };
  // Suffix maxima preserve the highest daily close since any entry date in a small series.
  function peakSeries(bars) {
    const out = []; let high = -Infinity;
    for (let i = bars.length - 1; i >= 0; i--) if (bars[i].c > high) { high = bars[i].c; out.push([bars[i].d, high]); }
    return out.reverse();
  }
  function calendar(data = {}) {
    const days = [...new Set((data.sessions || []).filter(dateOK))].sort(), index = new Map(days.map((d, i) => [d, i]));
    const upper = d => { let lo = 0, hi = days.length; while (lo < hi) { const m = (lo + hi) >>> 1; days[m] <= d ? lo = m + 1 : hi = m; } return lo; };
    return {
      days, has: d => index.has(d), next: d => days[upper(d)] || null,
      shift: (d, n) => index.has(d) ? days[index.get(d) + n] || null : null,
      distance: (a, b) => index.has(a) && index.has(b) ? index.get(b) - index.get(a) : null,
      between: (a, b) => days.slice(upper(a), upper(b)),
      observedThrough: data.observedThrough || null,
    };
  }
  let context = { calendar: calendar(), ranks: {} };
  function configure(data = {}) { context = { calendar: calendar(data.calendar), ranks: data.ranks || {} }; return context; }
  const planId = (date, code, side) => `${date}|${code}|${side}`;
  function validPlan(p) {
    return p && dateOK(p.date) && dateOK(p.signalDate) && /^\d{6}$/.test(p.code) && ['buy', 'sell'].includes(p.side)
      && ['buy', 'add', 'trim', 'sell'].includes(p.kind) && Number.isSafeInteger(p.qty) && p.qty > 0 && finite(p.price) && p.price > 0
      && p.id === planId(p.date, p.code, p.side);
  }
  function mergePlans(current = {}, incoming = {}) {
    const out = {};
    for (const book of [incoming, current]) for (const p of Object.values(book || {})) if (validPlan(p)) out[p.id] = { ...p, cancelled: p.cancelled === true };
    return out;
  }
  function progress(plan, logs) {
    const fills = logs.filter(l => l.date === plan.date && l.code === plan.code && l.side === plan.side);
    const filled = fills.reduce((s, l) => s + (finite(l.qty) && l.qty > 0 ? l.qty : 0), 0), remaining = Math.max(0, plan.qty - filled);
    return { filled, remaining, excess: Math.max(0, filled - plan.qty), count: fills.length,
      status: remaining === 0 ? filled > plan.qty ? 'overfilled' : 'filled' : plan.cancelled ? 'cancelled' : filled > 0 ? 'partial' : 'open' };
  }
  function completedStages(code, pos, plans, logs) {
    const stages = new Set(), cycleLogs = (pos.events?.length ? pos.events : logs).filter(l => l.code === code && l.date >= pos.firstD);
    for (const p of Object.values(plans || {})) {
      if (p.code !== code || p.side !== 'buy' || p.date < pos.firstD || p.date > pos.lastD) continue;
      const done = progress(p, cycleLogs), reached = cycleLogs.filter(l => l.date <= p.date).reduce((s, l) => s + (l.side === 'buy' ? l.qty : -l.qty), 0);
      if (done.filled > 0 && finite(p.goalQty) && reached >= p.goalQty) stages.add(p.stage || 1);
      if (done.filled > 0 && finite(p.fullTargetQty) && reached >= p.fullTargetQty) stages.add(3);
      if (done.filled > 0 && Array.isArray(p.phaseGoals)) p.phaseGoals.forEach((qty, i) => { if (i < 3 && finite(qty) && qty > 0 && reached >= qty) stages.add(i + 1); });
    }
    return [...stages];
  }
  // 분할 단계는 첫 매수가 대비 종가로 정한다(불타기): +5%면 누적 2/3, +10%면 전체. 체결 건수는 단계가 아니다.
  // 검증: 2016~2026 상장폐지 포함 데이터는 시작일 5개 모두, 원본 연구 데이터는 5개 중 3개에서 시간 기준(0·5·10거래일)보다
  // 나았고 최대 낙폭은 두 데이터 모두 줄었다. +3·7% ~ +10·20%로 바꿔도 같은 방향 (HANDOFF 20절).
  const PYRAMID = [.05, .10];
  function phase(pos, row, signalDate, executionDate, ctx = context) {
    const cal = ctx.calendar, age = cal.distance(pos.firstD, executionDate), events = pos.events || [];
    const history = Object.entries(ctx.ranks || {}).filter(([d]) => d >= pos.firstD && d <= signalDate).sort(([a], [b]) => a.localeCompare(b));
    let lastInside40 = pos.lastInside40 || pos.firstD;
    for (const [d, ranks] of history) if (finite(ranks[row.k]) && ranks[row.k] < 40) lastInside40 = d;
    if (band(row.rk) != null && band(row.rk) <= 2) lastInside40 = signalDate;
    // 순위가 상위 20% 밖인 날은 추가 매수를 보류한다(다시 들어오면 재개)
    const cancelled = band(row.rk) == null || band(row.rk) > 1;
    const first = events.find(e => e.side === 'buy' && (!pos.firstD || e.date >= pos.firstD)), entry = first && finite(first.price) ? first.price : pos.avg;
    const rise = finite(entry) && entry > 0 && finite(row.p) ? row.p / entry - 1 : 0;
    const trimKey = `${row.k}:${pos.firstD}:${lastInside40}:trim`;
    const trimmed = events.filter(e => e.decision === trimKey && e.side === 'sell').reduce((s, e) => s + e.qty, 0);
    return { age, stage: age == null ? null : 1 + (rise >= PYRAMID[0]) + (rise >= PYRAMID[1]), cancelled, lastInside40, trimKey, trimmed,
      entry, next: null };
  }
  // 투자금별 권장 종목 수: 한 종목 몫을 약 500만원 이상으로, 검증 범위 7~10종목 안에서 (HANDOFF 21절)
  const suggestSlots = capital => finite(capital) && capital > 0 ? Math.max(7, Math.min(10, Math.floor(capital / 5e6))) : 10;
  function targetValue(row, pos, cfg, policy = {}) {
    let value = cfg.capital / cfg.slots;
    // Experimental sizing is opt-in; production uses equal capital allocations.
    if (policy.riskFraction > 0) {
      const stop = pos ? tick(Math.max(pos.avg, pos.maxP) * (1 + pos.stopPct)) : row.p * (1 + row.stopPct);
      const distance = row.p - stop;
      if (!(distance > 0)) return 0;
      value = Math.min(value, cfg.capital * policy.riskFraction / distance * row.p);
    }
    if (policy.maxPosition > 0) value = Math.min(value, cfg.capital * policy.maxPosition);
    return Math.max(0, value);
  }
  function manage(row, b, pos, cfg, signalDate, options = {}) {
    const ctx = options.context || context, executionDate = options.executionDate || ctx.calendar.next(signalDate), policy = options.policy || {};
    const val = pos.qty * row.p, target = targetValue(row, pos, cfg, policy), gain = row.p / pos.avg - 1;
    const stop = tick(Math.max(pos.avg, pos.maxP) * (1 + pos.stopPct)), ref = tick(pos.avg * (1 + pos.upPct), true);
    const split = phase(pos, row, signalDate, executionDate, ctx), base = { stop, ref, gain, val, target, split, flags: [] };
    if (row.ch <= -.08) base.flags.push('하루 급락 · 추가 매수 보류');
    if (row.old || !finite(row.p) || row.p <= 0) return { ...base, light: 'yellow', k: 'data', reason: '시세·순위 확인 대기' };
    if (row.p <= stop) return { ...base, light: 'red', k: 'stop', sellQty: pos.qty, reason: '손절가 아래 마감' };
    if (b == null) return { ...base, light: 'yellow', k: 'data', reason: '순위 확인 대기' };
    if (b === 4) return { ...base, light: 'red', k: 'sell', sellQty: pos.qty, reason: '순위 하위 30%' };
    if (b === 3) {
      const qty = Math.max(0, Math.floor((pos.qty + split.trimmed) / 2) - split.trimmed);
      if ((val > .6 * target || split.trimmed > 0) && qty > 0) return { ...base, light: 'yellow', k: 'trim', sellQty: qty, decision: split.trimKey, reason: '순위 40% 밖 · 이번 구간에서 절반 축소' };
    }
    if (row.p <= stop * 1.05) return { ...base, light: 'yellow', k: 'near', reason: '손절가 근접 · 추가 매수 보류' };
    if (!executionDate || split.stage == null) return { ...base, light: 'yellow', k: 'calendar', reason: '거래일 이력 확인 대기' };
    const gap = Math.max(0, target - val), cooldown = ctx.calendar.distance(pos.lastD, executionDate);
    const complete = (pos.completedStages || []).includes(split.stage);
    if (b <= 1 && row.ch > -.08 && !split.cancelled && !complete) {
      const goalQty = Math.floor(target * split.stage / 3 / row.p), qty = Math.max(0, goalQty - pos.qty);
      if (qty > 0) return { ...base, light: 'green', k: 'add', buyQty: qty, goalQty, reason: `분할 ${split.stage}/3단계 누적 목표 ${goalQty.toLocaleString()}주` };
    }
    // A cancelled split does not resume. A later recovery is a separate, cooled-down decision.
    if (b <= 1 && row.ch > -.08 && (split.cancelled || (pos.completedStages || []).includes(3)) && val < .6 * target && cooldown != null && cooldown >= 5) {
      const qty = Math.floor(gap / row.p);
      if (qty > 0) return { ...base, light: 'green', k: 'add', buyQty: qty, goalQty: pos.qty + qty, reason: '분할을 마친 뒤 비중이 부족해 재평가' };
    }
    const nextAt = split.stage < 3 && finite(split.entry) ? tick(split.entry * (1 + PYRAMID[split.stage - 1]), true) : null;
    return { ...base, light: 'green', k: 'hold', reason: split.cancelled ? '순위 상위 20% 밖 · 추가 매수 보류' : nextAt ? `다음 분할: 종가 ${nextAt.toLocaleString()}원 이상 (첫 매수가 +${PYRAMID[split.stage - 1] * 100}%)` : '분할 목표 충족 · 보유 유지' };
  }
  // Sell proceeds and slots are available only after real fills, not on a hypothetical sale.
  function orders(input) {
    const { rows, positions, recs, signalDate, executionDate } = input, ctx = input.context || context;
    const cfg = { capital: finite(input.equity) ? Math.max(0, input.equity) : 0, slots: Number.isInteger(input.slots) && input.slots > 0 ? input.slots : 10 }, policy = input.policy || {}, notes = [], items = [];
    if (!ctx.calendar.has(signalDate) || !ctx.calendar.has(executionDate) || executionDate !== ctx.calendar.next(signalDate)) return { items, notes: ['거래일을 확인할 수 없어 새 계획을 만들지 않았습니다.'], cash: input.cash };
    const reserve = cfg.capital * (policy.cashReserve || 0), fee = policy.buyCost ?? .001;
    const startingCash = finite(input.cash) ? input.cash : 0, spendable = Math.max(0, startingCash - reserve);
    let cash = spendable, free = Math.max(0, cfg.slots - Object.keys(positions).length);
    const sectors = {};
    for (const [code, pos] of Object.entries(positions)) { const row = rows[code]; if (row) sectors[row.s || '기타'] = (sectors[row.s || '기타'] || 0) + pos.qty * row.p; }
    const allocate = (row, desired) => {
      const sector = row.s || '기타', room = policy.maxSector > 0 ? Math.max(0, cfg.capital * policy.maxSector - (sectors[sector] || 0)) : Infinity;
      const qty = Math.max(0, Math.min(desired, Math.floor(cash / (row.p * (1 + fee))), Math.floor(room / row.p)));
      if (qty > 0) { cash -= qty * row.p * (1 + fee); sectors[sector] = (sectors[sector] || 0) + qty * row.p; }
      return qty;
    };
    const make = (row, side, qty, kind, reason, extras = {}) => ({ id: planId(executionDate, row.k, side), date: executionDate, signalDate, code: row.k, side, qty, price: row.p, kind, why: reason, version: VERSION, stopPct: row.stopPct, upPct: row.upPct, ...extras });
    for (const [code, pos] of Object.entries(positions)) {
      const row = rows[code]; if (!row) continue;
      const m = manage(row, band(row.rk), pos, cfg, signalDate, { context: ctx, executionDate, policy });
      if (m.sellQty) items.push(make(row, 'sell', m.sellQty, m.k === 'trim' ? 'trim' : 'sell', m.reason, { decision: m.decision, goalQty: pos.qty - m.sellQty }));
      if (m.buyQty) { const qty = allocate(row, m.buyQty); if (qty) items.push(make(row, 'buy', qty, 'add', m.reason, { baseQty: pos.qty, goalQty: m.goalQty, fullTargetQty: Math.floor(m.target / row.p), phaseGoals: [1, 2, 3].map(n => Math.floor(m.target * n / 3 / row.p)), stage: m.split.stage })); }
      if (['data', 'calendar'].includes(m.k)) notes.push(`${row.n || code}: ${m.reason}`);
    }
    for (const code of recs || []) {
      if (!free) break;
      const row = rows[code]; if (!row || !finite(row.p) || row.p <= 0 || positions[code] || row.old || band(row.rk) == null || band(row.rk) > 1 || row.ch <= -.08) continue;
      const target = targetValue(row, null, cfg, policy), desired = Math.floor(target / 3 / row.p);
      const qty = allocate(row, desired);
      if (!qty) continue;
      items.push(make(row, 'buy', qty, 'buy', `상위 ${row.rk < 1 ? row.rk.toFixed(1) : Math.round(row.rk)}% · 1/3 누적 목표`, { baseQty: 0, goalQty: desired, fullTargetQty: Math.floor(target / row.p), phaseGoals: [1, 2, 3].map(n => Math.floor(target * n / 3 / row.p)), stage: 1 })); free--;
    }
    if (!items.length) notes.push('현재 신호·실제 현금·보유 비중에 맞는 주문이 없습니다.');
    if (items.some(p => p.side === 'sell')) notes.push('매도 예정 금액은 현금에 미리 더하지 않습니다. 체결 기록 후 매수 계획을 다시 확인하세요.');
    return { items, notes, cash: startingCash - (spendable - cash) };
  }
  return { VERSION, band, peakSeries, calendar, configure, planId, validPlan, mergePlans, progress, completedStages, phase, suggestSlots, targetValue, manage, orders };
})();
if (typeof module !== 'undefined') module.exports = TRADING;
