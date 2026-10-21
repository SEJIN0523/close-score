import { VERSION, defaults } from "./config/app.js";
import {
  load,
  save,
  backup,
  restore,
  restoreSafely,
  recoveryBackup,
  currentRaw,
  resetPersonalRecords,
} from "./services/storage.js";
import { calculate } from "./services/portfolio.js";
import { getMarket, analysisFor } from "./services/market.js";
import { escape as e, icon, empty, section } from "./components/ui.js";
let state,
  storageError = "";
try {
  state = load();
} catch (err) {
  state = defaults();
  storageError =
    "저장 데이터를 읽지 못했습니다. 원본을 덮어쓰지 않도록 저장을 중단했습니다. 설정에서 백업을 복원하거나 초기화하세요.";
}
const market = await getMarket();
const names = {
  home: "대시보드",
  explore: "종목 탐색",
  portfolio: "포트폴리오",
  settings: "설정",
};
const types = {
  buy: "매수",
  sell: "매도",
  deposit: "입금",
  withdraw: "출금",
  dividend: "배당",
};
const app = document.querySelector("#app"),
  dialog = document.querySelector("#editor");
let search = "",
  sector = "전체",
  sort = "name",
  onlyWatch = false,
  compare = new Set();
const stock = (code) =>
  market.stocks.find((s) => s.code === code) || {
    code,
    name: code,
    sector: "직접 입력",
    market: "기타",
  };
const money = (n) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("ko-KR", {
        maximumFractionDigits: 2,
        ...(state.settings.number === "compact" ? { notation: "compact" } : {}),
      }).format(n) + "원";
const pct = (n) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const today = () => new Date().toLocaleDateString("sv-SE");
const button = (text, action, cls = "ghost") =>
  `<button class="${cls}" data-action="${action}">${text}</button>`;
function notify(text) {
  const t = document.querySelector("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => t.classList.remove("show"), 4200);
}
function commit(next) {
  try {
    if (storageError) throw Error(storageError);
    save(next);
    state = next;
    return true;
  } catch (err) {
    notify("저장 실패: " + err.message);
    return false;
  }
}
function mutate(fn) {
  const next = structuredClone(state);
  fn(next);
  return commit(next);
}
function route() {
  const [page, code] = location.hash.slice(1).split("/");
  return { page: page || state.settings.home, code };
}
function nav() {
  return Object.entries(names)
    .map(
      ([key, name]) =>
        `<a href="#${key}" ${route().page === key ? 'aria-current="page"' : ""}>${icon(key)}<span>${name}</span></a>`,
    )
    .join("");
}
function stockRow(s) {
  return `<div class="stock-row"><button class="star ${state.watchlist.includes(s.code) ? "selected" : ""}" data-watch="${s.code}" aria-label="${e(s.name)} 관심종목 ${state.watchlist.includes(s.code) ? "해제" : "등록"}">${state.watchlist.includes(s.code) ? "★" : "☆"}</button><a href="#detail/${s.code}" class="stock-name"><strong>${e(s.name)}</strong><small>${s.code} <span>· ${s.market} · ${s.sector}</span></small></a><span class="quote-missing">시세 미연결</span><label class="compare-check"><input type="checkbox" data-compare="${s.code}" ${compare.has(s.code) ? "checked" : ""} aria-label="${e(s.name)} 비교 선택"></label></div>`;
}
function summary(p) {
  return `<div class="metrics"><div><span>현금</span><strong>${money(p.cash)}</strong></div><div><span>평가손익</span><strong>${money(p.unrealized)}</strong></div><div><span>실현손익</span><strong class="${p.realized < 0 ? "negative" : "positive"}">${money(p.realized)}</strong></div></div>`;
}
function home(p) {
  return `<div class="page-intro"><div><small class="eyebrow">YOUR INVESTMENT, IN FOCUS</small><h1>투자의 맥락을<br class="mobile-only"> 한눈에.</h1><p>시장을 살피고, 나만의 판단을 기록하세요.</p></div><div class="session"><span class="dot"></span>분석 엔진 연결 대기</div></div><div class="dashboard-grid"><section class="panel asset-panel"><div class="section-head"><span class="eyebrow">MY PORTFOLIO</span><a href="#portfolio">자산 관리 ${icon("arrow")}</a></div><p class="muted">총자산 ${!p.complete ? '<span class="badge">평가 가격 필요</span>' : ""}</p><div class="hero-value">${money(p.assets)}</div><p class="asset-caption">${p.positions.length ? "보유 " + p.positions.length + "종목 · 목표 " + state.settings.target + "종목" : "첫 거래를 기록하면 자산 흐름이 시작됩니다."}</p>${summary(p)}<div class="asset-bottom"><span>순입금 기준 손익률 <b>${pct(p.returnRate)}</b></span><button class="primary" data-action="transaction">${icon("plus")} 거래 기록</button></div></section>${section("MARKET PULSE", "시장 브리핑", `<div class="indices">${["KOSPI", "KOSDAQ", "USD / KRW"].map((x) => `<div><small>${x}</small><strong>—</strong><span>시세 미연결</span></div>`).join("")}</div><div class="connection-note"><span class="dot"></span>실제 시장 데이터 연결 후 표시됩니다.</div>`)}${section("MARKET CONTEXT", "주도 업종 & 위험도", `<div class="context-row"><span>주도 업종</span><strong>분석 대기</strong></div><div class="risk-track"><i></i><i></i><i></i><i></i><i></i></div><div class="context-row"><span>시장 위험도</span><span class="badge">판단 불가</span></div><p class="muted small">가격·거래량 데이터가 없어 위험을 평가하지 않습니다.</p>`)}${section(
    "WATCHLIST",
    "나의 관심종목",
    state.watchlist.length
      ? state.watchlist
          .slice(0, 4)
          .map((c) => stockRow(stock(c)))
          .join("")
      : empty(
          "관찰에서 시작하는 투자",
          "탐색에서 별을 눌러 관심종목을 모아보세요.",
        ),
    '<a href="#explore">전체 보기 ' + icon("arrow") + "</a>",
  )}${section("NEXT ACTION", "오늘의 점검", `<a class="action-row" href="#portfolio"><span class="number">01</span><div><strong>${p.positions.some((h) => h.value === null) ? "보유 종목 평가 가격 입력" : "포트폴리오 기록 점검"}</strong><small>${p.positions.length ? "거래 내역과 평가 기준일을 확인하세요." : "초기 투자금과 현금을 설정하세요."}</small></div>${icon("arrow")}</a><div class="action-row"><span class="number">02</span><div><strong>매수·매도 신호 미연결</strong><small>분석 엔진 연결 후 근거와 함께 표시합니다.</small></div><span class="badge">대기</span></div>`)}${section("RESEARCH QUEUE", "투자 후보", empty("근거가 연결되면, 더 선명하게", "실제 분석 결과가 없어 투자 후보와 추천을 생성하지 않습니다."))}</div>`;
}
function explore() {
  const list = market.stocks
    .filter(
      (s) =>
        (s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.code.includes(search)) &&
        (sector === "전체" || s.sector === sector) &&
        (!onlyWatch || state.watchlist.includes(s.code)),
    )
    .sort((a, b) =>
      sort === "code"
        ? a.code.localeCompare(b.code)
        : a.name.localeCompare(b.name, "ko") * (sort === "reverse" ? -1 : 1),
    );
  return `<div class="page-intro"><div><small class="eyebrow">DISCOVER & OBSERVE</small><h1>종목 탐색</h1><p>관찰할 기업을 찾고, 판단의 근거를 쌓으세요.</p></div><span class="badge">참조 목록 ${market.stocks.length}종목</span></div><section class="panel"><div class="search-box">${icon("explore")}<input id="search" aria-label="종목명 또는 종목코드 검색" placeholder="종목명 또는 종목코드" value="${e(search)}"></div><div class="filters"><label>업종<select id="sector">${["전체", ...new Set(market.stocks.map((s) => s.sector))].map((v) => `<option ${v === sector ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>정렬<select id="sort"><option value="name" ${sort === "name" ? "selected" : ""}>이름 오름차순</option><option value="reverse" ${sort === "reverse" ? "selected" : ""}>이름 내림차순</option><option value="code" ${sort === "code" ? "selected" : ""}>종목코드순</option></select></label><label class="watch-toggle"><input id="only-watch" type="checkbox" ${onlyWatch ? "checked" : ""}> 관심종목만</label></div><div class="list-caption"><span>${list.length}개 기업</span><span>시세·점수 미연결</span></div><div id="stock-list">${list.length ? list.map(stockRow).join("") : empty("검색 결과가 없습니다", "검색어 또는 필터를 변경하세요.")}</div><p class="muted small">제한된 기업 참조 목록입니다. 전체 KOSPI·KOSDAQ 데이터는 추후 연결됩니다.</p></section>${compare.size ? section("SIDE BY SIDE", `종목 비교 · ${compare.size} / 3`, `<div class="comparison">${[...compare].map((c) => `<div><h3>${e(stock(c).name)}</h3><small>${c} · ${stock(c).sector}</small><dl><dt>주가 / 추세</dt><dd>미연결</dd><dt>분석 점수</dt><dd>미연결</dd><dt>데이터 품질</dt><dd>평가 대기</dd></dl><a href="#detail/${c}">상세 보기 →</a></div>`).join("")}</div>`, button("선택 해제", "clear-compare")) : ""}`;
}
function detail(code) {
  const s = stock(code),
    a = analysisFor(code);
  return `<a href="#explore" class="back-link">← 종목 탐색</a><div class="page-intro"><div><small class="eyebrow">${s.market} / ${code}</small><h1>${e(s.name)}</h1><p>${e(s.sector)} · 독립 종목 분석</p></div><button class="ghost" data-watch="${code}">${state.watchlist.includes(code) ? "★ 관심종목 해제" : "☆ 관심종목 등록"}</button></div><div class="detail-grid">${section("01 / PRICE & TREND", "주가 및 추세", `<div class="detail-price">— <span>KRW</span></div><div class="chart-placeholder"><div class="chart-lines"></div><span>가격 시계열 미연결</span></div><p class="muted small">데이터 기준일: 미연결 · 임의의 차트를 생성하지 않습니다.</p>`)}${section("02 / SUPPORTING EVIDENCE", "상승 가능성의 근거", empty("분석 근거 미연결", "실적·수급·추세의 확인 가능한 근거를 표시할 영역입니다."))}${section("03 / COUNTER EVIDENCE", "위험과 반대 근거", empty("위험 분석 미연결", "하방 요인과 기존 가설의 반대 근거를 함께 검토합니다."))}${section("04 / DECISION CONDITIONS", "판단을 위한 조건", empty("관찰 조건 미연결", "점수·예상 시나리오는 검증된 엔진 결과만 표시합니다."))}${section("05 / DATA QUALITY", "데이터 품질과 평가 근거", `<dl class="quality"><dt>데이터 출처</dt><dd>${a.quality.source ?? "미연결"}</dd><dt>기준일</dt><dd>미연결</dd><dt>가격 / 재무 / 공시</dt><dd>연결 대기</dd><dt>분석 모델</dt><dd>미구현 · V1 UI</dd></dl><p class="muted small">종목명과 코드는 참조 정보이며 투자 추천이 아닙니다.</p>`)}</div>`;
}
function portfolio(p) {
  return `<div class="page-intro"><div><small class="eyebrow">CAPITAL & CONVICTION</small><h1>포트폴리오</h1><p>기록은 정확하게, 판단은 차분하게.</p></div><button class="primary" data-action="transaction">${icon("plus")} 거래 기록</button></div><section class="panel asset-panel"><div class="section-head"><span class="eyebrow">TOTAL ASSETS</span>${button("초기 현금 설정", "capital")}</div><div class="hero-value">${money(p.assets)}</div><p class="asset-caption">${p.complete ? "현재 입력된 평가 가격 기준" : "평가 가격이 없는 보유 종목이 있어 총자산·평가손익 계산을 보류합니다."}</p>${summary(p)}<div class="portfolio-extra"><span>초기 투자금 <b>${money(state.initialCash)}</b></span><span>순입금 <b>${money(p.netCapital)}</b></span><span>배당금 <b>${money(p.dividends)}</b></span><span>총손익 <b>${money(p.profit)}</b></span><span>손익률 <b>${pct(p.returnRate)}</b></span></div></section><div class="dashboard-grid">${section("ALLOCATION", `보유 자산 · ${p.positions.length} / ${state.settings.target}`, p.positions.length ? p.positions.map((h) => `<div class="holding"><div class="section-head"><a href="#detail/${h.code}"><strong>${e(stock(h.code).name)}</strong><small>${h.code} · ${h.quantity.toLocaleString()}주</small></a><strong>${money(h.value)}</strong></div><div class="holding-info"><span>평균 매수가 <b>${money(h.average)}</b></span><span>평가손익 <b>${money(h.unrealized)}</b></span></div><div class="weight"><i style="width:${p.assets > 0 && h.value !== null ? (h.value / p.assets) * 100 : 0}%"></i></div><div class="section-head small"><span>${p.assets > 0 && h.value !== null ? ((h.value / p.assets) * 100).toFixed(1) + "%" : "비중 계산 대기"} · ${h.quote ? "수동 평가 " + h.quote.date : "평가 가격 미입력"}</span><button class="ghost" data-quote="${h.code}">평가 가격 입력</button></div></div>`).join("") : empty("아직 보유 종목이 없습니다", "초기 현금을 설정하고 첫 매수 기록을 추가하세요."))}${section("CASH RESERVE", "현금 비중", `<div class="cash-ratio">${p.assets > 0 ? ((p.cash / p.assets) * 100).toFixed(1) + "%" : "—"}</div><div class="weight"><i style="width:${p.assets > 0 ? (p.cash / p.assets) * 100 : 0}%"></i></div><p class="muted">사용 가능 현금 <strong>${money(p.cash)}</strong></p><p class="small muted">시세는 자동 갱신되지 않습니다. 평가 가격은 사용자가 기준일과 함께 입력합니다.</p>`)}</div>${section(
    "TRANSACTION LEDGER",
    "거래 기록",
    state.transactions.length
      ? `<div class="ledger">${[...state.transactions]
          .reverse()
          .map(
            (t) =>
              `<div class="ledger-row"><span class="transaction-type ${t.type}">${types[t.type]}</span><div><strong>${t.code ? e(stock(t.code).name) : types[t.type]}</strong><small>${t.date} · ${t.code ? t.quantity + "주 × " + money(t.price) : money(t.amount)}</small></div><div class="ledger-actions"><button data-edit="${e(t.id)}" class="ghost" aria-label="${t.date} ${types[t.type]} 수정">수정</button><button data-delete="${e(t.id)}" class="ghost" aria-label="${t.date} ${types[t.type]} 삭제">삭제</button></div></div>`,
          )
          .join("")}</div>`
      : empty(
          "첫 기록을 기다리고 있어요",
          "매수·매도, 입출금과 배당을 한 장부에서 관리하세요.",
        ),
    button("JSON 백업", "backup"),
  )}<p class="muted small">이동평균 원가법 · 수수료·세금 제외 · 동일 날짜는 입력 순서로 계산합니다. 손익률 = (실현손익 + 평가손익 + 배당) ÷ 순입금. 순입금이 0 이하이면 수익률을 표시하지 않습니다.</p>`;
}
function settings() {
  const s = state.settings;
  return `<div class="page-intro"><div><small class="eyebrow">MAKE IT YOURS</small><h1>설정</h1><p>나의 투자 환경을, 나의 방식으로.</p></div></div><div class="detail-grid">${section(
    "APPEARANCE",
    "화면과 표시",
    `<div class="setting-row"><label for="theme">테마<small>선택 즉시 이 브라우저에 저장</small></label><select id="theme" data-setting="theme"><option value="dark" ${s.theme === "dark" ? "selected" : ""}>다크</option><option value="light" ${s.theme === "light" ? "selected" : ""}>라이트</option></select></div><div class="setting-row"><label for="number">금액 표시</label><select id="number" data-setting="number"><option value="full" ${s.number === "full" ? "selected" : ""}>전체 금액</option><option value="compact" ${s.number === "compact" ? "selected" : ""}>만·억 단위</option></select></div><div class="setting-row"><label for="home">기본 화면</label><select id="home" data-setting="home">${Object.entries(
      names,
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${s.home === k ? "selected" : ""}>${v}</option>`,
      )
      .join("")}</select></div>`,
  )}${section("PORTFOLIO PREFERENCES", "운용 설정", `<div class="setting-row"><label for="target">목표 보유 종목 수<small>1~100종목 · 자동 매매와 무관</small></label><input type="number" min="1" max="100" id="target" data-setting="target" value="${s.target}"></div><div class="setting-row"><div>초기 투자금 / 현금<small>입출금은 거래 기록으로 관리</small></div>${button("수정", "capital")}</div>`)}${section("LOCAL DATA", "백업과 복원", `<p class="muted">기록은 현재 기기·브라우저에만 저장됩니다. 브라우저 간 자동 동기화는 지원하지 않습니다.</p><div class="button-group">${button("JSON 백업 다운로드", "backup", "primary")}${button("JSON 파일 복원", "restore")}${button("복원 전 기록 다운로드", "recovery")}</div><p class="small muted">복원은 관심종목·설정·매매 장부·수동 평가 가격을 덮어씁니다. 복원 직전 기록 1개를 이 브라우저에 별도 보관합니다. 다음 복원 전에 복원 전 기록을 다운로드해 보관하세요. 다른 기기로 옮길 때 백업 파일을 사용하세요.</p><input id="restore-file" type="file" accept="application/json,.json" hidden><div class="danger-zone">${button("개인 기록 초기화", "reset", "danger")}</div>`)}${section("SYSTEM", "앱 정보", `<dl class="quality"><dt>버전</dt><dd>PRISM ${VERSION}</dd><dt>분석 엔진</dt><dd>미연결</dd><dt>시장 데이터 기준일</dt><dd>미연결</dd><dt>저장 방식</dt><dd>브라우저 로컬 저장소</dd><dt>저장 키</dt><dd>prism-v1-state</dd></dl>`)}</div>`;
}
function render() {
  const r = route(),
    p = calculate(state.initialCash, state.transactions, state.quotes);
  document.documentElement.dataset.theme = state.settings.theme;
  document.querySelector('meta[name="theme-color"]').content =
    state.settings.theme === "dark" ? "#101719" : "#f4f5f0";
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#home"><span class="prism-mark">△</span>PRISM<span class="version">V1</span></a><p class="brand-caption">INVESTMENT INTELLIGENCE</p><nav aria-label="주 메뉴">${nav()}</nav><div class="sidebar-bottom"><span class="dot"></span> Independent by design<small>개인의 판단을 위한 투자 워크스페이스</small></div></aside><div class="workspace"><header class="topbar"><a class="brand mobile-brand" href="#home"><span class="prism-mark">△</span>PRISM</a><div class="breadcrumb">WORKSPACE <span>/</span> ${names[r.page] || "종목 분석"}</div><div class="topbar-right"><span class="local-label">LOCAL · 기기 내 저장</span><button class="icon-button" data-action="theme" aria-label="테마 전환">${icon("sun")}</button></div></header><main id="main">${storageError ? '<div class="alert">' + e(storageError) + "</div>" : ""}${r.page === "home" ? home(p) : r.page === "explore" ? explore() : r.page === "portfolio" ? portfolio(p) : r.page === "settings" ? settings() : r.page === "detail" && /^\d{6}$/.test(r.code) ? detail(r.code) : empty("페이지를 찾을 수 없습니다", "하단 메뉴에서 화면을 선택하세요.")}<footer><span>PRISM <b>·</b> PROFESSIONAL INVESTMENT INTELLIGENCE</span><span>투자 권유가 아닌 참고 자료 · 시장 데이터 미연결</span></footer></main><nav class="bottom-nav" aria-label="모바일 메뉴">${nav()}</nav></div>`;
}
function openDialog(title, body, onSubmit) {
  dialog.innerHTML = `<form id="dialog-form"><div class="section-head"><h2>${title}</h2><button type="button" class="icon-button" data-close aria-label="닫기">✕</button></div>${body}<p id="form-error" role="alert"></p><div class="dialog-buttons"><button type="button" data-close class="ghost">취소</button><button type="submit" class="primary">저장</button></div></form>`;
  dialog.showModal();
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    try {
      if (onSubmit(new FormData(event.target)) !== false) {
        dialog.close();
        render();
        notify("저장했습니다.");
      }
    } catch (err) {
      dialog.querySelector("#form-error").textContent = err.message;
    }
  };
}
const field = (label, name, type, value, extra = "") =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${e(value)}" required ${extra}></label>`;
function transaction(id) {
  const t = state.transactions.find((t) => t.id === id) || {
    type: "buy",
    date: today(),
    code: "",
    price: "",
    quantity: "",
    amount: "",
  };
  openDialog(
    id ? "거래 기록 수정" : "거래 기록 추가",
    `<label class="field">거래 종류<select name="type" id="trade-type">${Object.entries(
      types,
    )
      .map(
        ([k, v]) =>
          `<option value="${k}" ${t.type === k ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></label>${field("거래 날짜", "date", "date", t.date)}<div id="trade-fields">${field("종목코드 (6자리)", "code", "text", t.code ?? "", 'inputmode="numeric" pattern="[0-9]{6}" list="codes"')}<datalist id="codes">${market.stocks.map((s) => `<option value="${s.code}">${s.name}</option>`).join("")}</datalist><div class="two-fields">${field("1주 가격 (원)", "price", "number", t.price ?? "", 'min="0.01" step="0.01"')}${field("수량 (주)", "quantity", "number", t.quantity ?? "", 'min="1" step="1"')}</div></div><div id="cash-fields">${field("금액 (원)", "amount", "number", t.amount ?? "", 'min="0.01" step="0.01"')}</div><p class="small muted">과거 기록 수정·삭제 시 이후 거래도 다시 검증합니다.</p>`,
    (data) => {
      const type = data.get("type");
      const record = {
        id: id || crypto.randomUUID(),
        type,
        date: data.get("date"),
        ...(["buy", "sell"].includes(type)
          ? {
              code: data.get("code").trim(),
              price: Number(data.get("price")),
              quantity: Number(data.get("quantity")),
            }
          : { amount: Number(data.get("amount")) }),
      };
      const next = structuredClone(state);
      if (id)
        next.transactions[next.transactions.findIndex((t) => t.id === id)] =
          record;
      else next.transactions.push(record);
      calculate(next.initialCash, next.transactions, next.quotes);
      return commit(next);
    },
  );
  const toggle = () => {
    const isTrade = ["buy", "sell"].includes(
      dialog.querySelector("#trade-type").value,
    );
    for (const [sel, enabled] of [
      ["#trade-fields", isTrade],
      ["#cash-fields", !isTrade],
    ]) {
      dialog.querySelector(sel).hidden = !enabled;
      dialog
        .querySelectorAll(sel + " input")
        .forEach((i) => (i.disabled = !enabled));
    }
  };
  dialog.querySelector("#trade-type").onchange = toggle;
  toggle();
}
function confirmDialog(title, text, action) {
  openDialog(title, `<p>${e(text)}</p>`, () => action());
  dialog.querySelector('[type="submit"]').textContent = "확인";
}
function downloadJSON(text, filename) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const actions = {
  transaction: () => transaction(),
  theme: () => {
    if (
      mutate(
        (s) =>
          (s.settings.theme = s.settings.theme === "dark" ? "light" : "dark"),
      )
    )
      render();
  },
  "clear-compare": () => {
    compare.clear();
    render();
  },
  capital: () =>
    openDialog(
      "초기 투자금·현금",
      `${field("거래 시작 전 현금 (원)", "capital", "number", state.initialCash, 'min="0" max="100000000000000" step="0.01"')}<p class="muted small">현재 현금은 초기 현금과 전체 거래로 계산됩니다. 추가 투자금과 현금 조정은 입금·출금으로 기록하세요.</p>`,
      (data) => {
        const next = structuredClone(state);
        next.initialCash = Number(data.get("capital"));
        calculate(next.initialCash, next.transactions, next.quotes);
        return commit(next);
      },
    ),
  backup: () => {
    downloadJSON(backup(state), `prism-v1-backup-${today()}.json`);
    notify("백업 파일을 다운로드했습니다.");
  },
  recovery: () => {
    try {
      downloadJSON(recoveryBackup(), `prism-v1-before-restore-${today()}.json`);
    } catch (err) {
      notify(err.message);
    }
  },
  restore: () => document.querySelector("#restore-file").click(),
  reset: () => {
    openDialog(
      "개인 기록 초기화",
      `<p>이 브라우저의 PRISM 기록과 설정을 모두 삭제합니다. 먼저 JSON 백업을 보관하세요.</p>${field("확인하려면 초기화 입력", "confirmation", "text", "", 'autocomplete="off"')}`,
      (data) => {
        if (data.get("confirmation") !== "초기화")
          throw Error("초기화를 정확히 입력하세요.");
        const next = defaults();
        resetPersonalRecords();
        state = next;
        storageError = "";
        return true;
      },
    );
  },
};
document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.hasAttribute("data-close")) {
    dialog.close();
    return;
  }
  if (target.dataset.action) {
    actions[target.dataset.action]?.();
    return;
  }
  if (target.dataset.watch) {
    const c = target.dataset.watch;
    if (
      mutate((s) => {
        s.watchlist = s.watchlist.includes(c)
          ? s.watchlist.filter((x) => x !== c)
          : [...s.watchlist, c];
      })
    )
      render();
  }
  if (target.dataset.edit) transaction(target.dataset.edit);
  if (target.dataset.delete)
    confirmDialog(
      "거래 기록 삭제",
      "이 거래를 삭제하고 전체 장부를 다시 계산합니다.",
      () => {
        const next = structuredClone(state);
        next.transactions = next.transactions.filter(
          (t) => t.id !== target.dataset.delete,
        );
        calculate(next.initialCash, next.transactions, next.quotes);
        return commit(next);
      },
    );
  if (target.dataset.quote) {
    const c = target.dataset.quote,
      q = state.quotes[c];
    openDialog(
      e(stock(c).name) + " 평가 가격",
      `${field("수동 평가 가격 (원)", "price", "number", q?.price ?? "", 'min="0.01" step="0.01"')}${field("평가 기준일", "date", "date", q?.date ?? today())}<p class="muted small">실제 시세 또는 직접 확인한 평가 가격을 입력하세요. 자동 갱신되지 않습니다.</p>`,
      (data) =>
        mutate(
          (s) =>
            (s.quotes[c] = {
              price: Number(data.get("price")),
              date: data.get("date"),
            }),
        ),
    );
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    search = event.target.value;
    const pos = event.target.selectionStart;
    render();
    const input = document.querySelector("#search");
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});
document.addEventListener("change", async (event) => {
  const t = event.target;
  if (t.dataset.setting) {
    let value = t.dataset.setting === "target" ? Number(t.value) : t.value;
    if (
      t.dataset.setting === "target" &&
      (!Number.isInteger(value) || value < 1 || value > 100)
    ) {
      notify("목표 종목 수는 1~100의 정수입니다.");
      render();
      return;
    }
    if (mutate((s) => (s.settings[t.dataset.setting] = value))) render();
  }
  if (t.id === "sector") {
    sector = t.value;
    render();
  }
  if (t.id === "sort") {
    sort = t.value;
    render();
  }
  if (t.id === "only-watch") {
    onlyWatch = t.checked;
    render();
  }
  if (t.dataset.compare) {
    if (t.checked && compare.size >= 3) {
      t.checked = false;
      notify("최대 3개 종목을 비교할 수 있습니다.");
      return;
    }
    t.checked
      ? compare.add(t.dataset.compare)
      : compare.delete(t.dataset.compare);
    render();
  }
  if (t.id === "restore-file" && t.files[0]) {
    try {
      if (t.files[0].size > 5000000) throw Error("5MB 이하 파일만 지원합니다.");
      const next = restore(await t.files[0].text());
      const expectedRaw = currentRaw();
      confirmDialog(
        "백업 복원",
        `거래 ${next.transactions.length}건과 관심종목 ${next.watchlist.length}개로 현재 기록을 교체합니다. 현재 기록은 복원 전 기록으로 별도 보관하며, 보관에 실패하면 복원을 중단합니다. 기존 복원 전 기록은 이번 기록으로 교체됩니다.`,
        () => {
          restoreSafely(next, expectedRaw);
          state = next;
          storageError = "";
          return true;
        },
      );
    } catch (err) {
      notify("복원 실패: " + err.message);
    } finally {
      t.value = "";
    }
  }
});
window.addEventListener("hashchange", () => {
  dialog.close();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("storage", (event) => {
  if (event.key === "prism-v1-state") {
    try {
      state = load();
      render();
      notify("다른 탭의 변경 사항을 반영했습니다.");
    } catch {
      notify("다른 탭의 저장 데이터를 확인하세요.");
    }
  }
});
render();
