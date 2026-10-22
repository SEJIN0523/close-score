// 토스증권 체결 내역: OCR과 검토용 자료만 만든다. 저장·투자 판단은 앱에서 한다.
(function (root) {
  'use strict';
  const normalize = s => String(s || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
  const number = s => Number(String(s || '').replace(/[ ,원주]/g, ''));
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  function matchStock(name, stocks) {
    const q = normalize(name);
    const code = String(name || '').trim().match(/(?:^|\s)(\d{6})$/);
    if (code && stocks.some(r => r.k === code[1])) return code[1];
    const aliases = { KTG: '033780', KT: '030200', 네이버: '035420', 포스코홀딩스: '005490', SK하이닉스: '000660', SK텔레콤: '017670', SK바이오팜: '326030', 삼성전자: '005930' };
    if (aliases[q] && stocks.some(r => r.k === aliases[q])) return aliases[q];
    const matches = stocks.filter(r => normalize(r.n) === q || r.k === String(name).trim());
    return matches.length === 1 ? matches[0].k : '';
  }
  function dateFrom(text, fallback) {
    const full = text.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
    const short = text.match(/(?:^|\s)(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일|\s|$)/);
    const m = full || short;
    if (!m) return fallback;
    const parts = full ? [m[1], m[2], m[3]] : [fallback.slice(0, 4), m[1], m[2]];
    const d = parts.map((v, i) => i ? v.padStart(2, '0') : v).join('-');
    return validDate(d) ? d : fallback;
  }
  function parse(data, stocks, fallback) {
    // 토스는 종목명·가격이 한 줄, 수량·방향이 다음 줄에 있다.
    // Tesseract가 열 단위로 읽은 결과도 좌표로 다시 줄 순서에 맞춘다.
    let lines = data.lines || (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []));
    if (lines.length && lines.every(l => l.bbox)) {
      const words = lines;
      const sorted = words.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0), groups = [];
      for (const w of sorted) {
        const center = (w.bbox.y0 + w.bbox.y1) / 2, h = w.bbox.y1 - w.bbox.y0;
        let g = groups.find(g => Math.abs(g.center - center) < Math.max(8, Math.min(g.h, h) * .6));
        if (!g) { g = { center, h, words: [] }; groups.push(g); }
        g.words.push(w);
      }
      lines = groups.sort((a, b) => a.center - b.center).map(g => ({ text: g.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(w => w.text).join(' ') }));
    }
    const texts = (lines.length ? lines.map(l => l.text) : String(data.text || '').split('\n')).map(s => s.trim()).filter(Boolean);
    const rows = []; let date = fallback, name = '', price = 0, qty = 0, side = '', raw = [];
    const emit = () => {
      if (name || price || qty || side) rows.push({ name, code: matchStock(name, stocks), date, price, qty, side, raw: raw.join('\n'), included: true });
      name = ''; price = 0; qty = 0; side = ''; raw = [];
    };
    for (const original of texts) {
      let t = original.replace(/\s+/g, ' ');
      const foundDate = dateFrom(t, date);
      // 날짜는 첫 종목 앞에만 표시될 수 있다. 이전 행을 끝낸 뒤 갱신한다.
      const datePrefix = t.match(/^(?:(?:20\d{2})[.\-/년]\s*)?\d{1,2}[.\-/월]\s*\d{1,2}(?:일)?(?=\s|$)/);
      if (datePrefix) { if (qty || side) emit(); date = foundDate; t = t.slice(datePrefix[0].length).trim(); }
      const pm = t.match(/(?:주\s*당|체결\s*가(?:격)?)\s*([\d, ]+)\s*[원운]?/) || t.match(/([\d,]+)\s*원/);
      const qm = t.match(/([\d,]+)\s*주(?!\s*당)/);
      const sm = t.match(/구매|매수|판매|매도|\bBUY\b|\bSELL\b/i);
      let candidate = t.replace(/(?:주\s*당|체결\s*가(?:격)?)\s*[\d, ]+\s*[원운]?/g, '').replace(/[\d,]+\s*원/g, '')
        .replace(/[\d,]+\s*주(?!\s*당)/g, '').replace(/구매|매수|판매|매도|완료|체결|\bBUY\b|\bSELL\b/gi, '').replace(/(?:^|\s)주(?=\s|$)/g, '').trim();
      if (!/[가-힣A-Za-z]/.test(candidate) || /^(거래내역|체결내역|토스증권|주식|전체)$/.test(candidate.replace(/\s/g, ''))) candidate = '';
      if (candidate && name && (qty || side || price)) emit();
      if (candidate) name = candidate;
      if (pm) price = number(pm[1]);
      if (qm) qty = number(qm[1]);
      if (sm) side = /구매|매수|BUY/i.test(sm[0]) ? 'buy' : 'sell';
      if (candidate || pm || qm || sm) raw.push(original);
      if (name && price && qty && side) emit();
    }
    emit();
    return rows;
  }
  const key = r => [r.date, r.code, r.side, Number(r.qty), Number(r.price)].join('|');
  function issues(rows, logs, stocks) {
    const known = new Set(stocks.map(r => r.k)), existing = new Set(logs.map(key)), seen = new Set();
    return rows.map(r => {
      const errors = [];
      if (!known.has(r.code)) errors.push('종목을 목록에서 선택하세요');
      if (!validDate(r.date)) errors.push('날짜를 확인하세요');
      if (!['buy', 'sell'].includes(r.side)) errors.push('매수·매도를 선택하세요');
      if (!Number.isSafeInteger(Number(r.qty)) || Number(r.qty) <= 0) errors.push('수량을 확인하세요');
      if (!Number.isSafeInteger(Number(r.price)) || Number(r.price) <= 0) errors.push('가격을 확인하세요');
      const k = key(r), duplicate = existing.has(k) || seen.has(k);
      if (r.included) seen.add(k);
      return { errors, duplicate };
    });
  }
  // 날짜·기록 순서대로 검증하여 과거 매도나 일괄 매도도 보유량을 넘지 않게 한다.
  function oversold(logs) {
    const held = {};
    for (const r of logs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
      held[r.code] = (held[r.code] || 0) + (r.side === 'buy' ? Number(r.qty) : -Number(r.qty));
      if (held[r.code] < 0) return r;
    }
    return null;
  }
  const api = { normalize, matchStock, parse, issues, key, validDate, oversold };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TOSS_OCR = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
