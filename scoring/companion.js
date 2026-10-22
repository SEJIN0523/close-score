// Read-only artwork presentation: normal illustrations, portraits and small reactions.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BLOSSOM_BUDDY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const poses = { guide: '손가락으로 안내', reading: '자료 확인', welcome: '반갑게 인사', happy: '기뻐하는 표정', sad: '걱정하는 표정', celebrate: '완료를 응원' };
  const forms = { scene: '안내 일러스트', portrait: '손익 표정', mini: '작은 반응' };
  const samples = {
    scene: [['guide', '가리키기'], ['reading', '자료 확인'], ['welcome', '인사'], ['celebrate', '완료 안내']],
    portrait: [['guide', '차분함'], ['happy', '기쁨'], ['sad', '걱정'], ['celebrate', '응원']],
    mini: [['guide', '안내'], ['happy', '기쁨'], ['sad', '시무룩'], ['celebrate', '축하']],
  };
  let account = { pnl: 0, records: 0, pending: 0 }, temporary = null, timer, previewArt = 'scene';
  function describe(input, context = 'todo') {
    const rounded = Number.isFinite(Number(input.pnl)) ? Math.round(Number(input.pnl)) : 0;
    const pnl = Object.is(rounded, -0) ? 0 : rounded, hasRecords = Number(input.records) > 0;
    const financial = ['hold', 'stat'].includes(context), art = financial ? 'portrait' : 'scene';
    const pose = financial ? hasRecords && pnl > 0 ? 'happy' : hasRecords && pnl < 0 ? 'sad' : 'guide' : { todo: 'guide', rec: 'reading', watch: 'welcome' }[context] || 'guide';
    const pending = Math.max(0, Math.floor(Number(input.pending) || 0));
    const messages = {
      todo: pending ? `남은 계획 ${pending}건, 아래에서 하나씩 확인해요.` : '실제로 체결한 가격과 수량을 기록해요.',
      hold: pnl > 0 ? '손익이 플러스예요. 종목별 기록도 확인해요.' : pnl < 0 ? '마이너스인 날도, 기록은 차분하게 함께해요.' : '종목을 누르면 상세 내역이 펼쳐져요.',
      stat: pnl < 0 ? '내 투자 흐름을 차분하게 살펴봐요.' : '내 투자 기록의 흐름을 함께 살펴봐요.',
      rec: '종목별 점수와 근거를 펼쳐 살펴봐요.',
      watch: '관심종목과 백업 파일을 여기서 관리해요.',
    };
    return { art, pose, message: messages[context] || messages.todo,
      caption: financial ? hasRecords ? `총손익 기준 · ${pnl > 0 ? '+' : ''}${pnl.toLocaleString('ko-KR')}원` : '아직 투자 기록이 없어요' : context === 'todo' ? hasRecords ? '오늘의 계획 · 실제 체결 기준' : '실제 기록을 남기면 내 계좌에 맞춰져요' : '캐릭터를 누르면 도움말을 볼 수 있어요',
      sign: financial && hasRecords ? pnl > 0 ? 'up' : pnl < 0 ? 'down' : '' : '', pnl };
  }
  function paint() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.buddyReaction = temporary?.pose || '';
    document.querySelectorAll('[data-buddy-context]').forEach(header => {
      const context = header.dataset.buddyContext, view = describe(account, context);
      if (temporary && (!temporary.context || temporary.context === context)) Object.assign(view, temporary);
      const character = header.querySelector('[data-buddy]');
      character.dataset.pose = view.pose; character.dataset.art = view.art;
      character.setAttribute('aria-label', forms[view.art] + ' · ' + poses[view.pose] + ' · 안내 보기');
      const message = header.querySelector('[data-buddy-message]'), caption = header.querySelector('[data-buddy-caption]');
      if (message.textContent !== view.message) message.textContent = view.message;
      caption.textContent = view.caption;
      caption.classList.remove('up', 'down'); if (view.sign) caption.classList.add(view.sign);
    });
  }
  function update(input) {
    if (Number(input.records) < Number(account.records)) { clearTimeout(timer); temporary = null; }
    account = { ...account, ...input }; paint();
  }
  function react(value) {
    clearTimeout(timer); temporary = value; paint();
    timer = setTimeout(() => { temporary = null; paint(); }, 4200);
  }
  function celebrate() { react({ pose: 'celebrate', message: '체결 기록을 저장했어요. 하나씩 꼼꼼하게!', context: null }); }
  function guide(context) {
    const help = { todo: '아래 계획을 펼치면 실제 체결 가격을 입력할 수 있어요.', hold: '매매 기록·이미지 등록 버튼으로 체결 내역을 남겨요.', stat: '자산·손익·월별·추천 탭으로 보기를 바꿔보세요.', rec: '순서와 점수는 투자 알고리즘이 계산한 결과예요.', watch: '데이터 관리에서 백업 파일을 받을 수 있어요.' };
    react({ art: 'scene', pose: 'guide', message: help[context] || help.todo, context });
  }
  function preview(pose) {
    const demo = document.getElementById('buddyDemo');
    demo.dataset.art = previewArt; demo.dataset.pose = pose;
    demo.setAttribute('aria-label', forms[previewArt] + ' · ' + poses[pose]);
    document.querySelectorAll('[data-buddy-preview]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.buddyPreview === pose)));
    document.getElementById('buddyPreviewText').textContent = { scene: '할 일·추천·이미지 등록에서 동작으로 안내해요.', portrait: '보유·통계에서 실제 총손익에 따라 표정이 바뀌어요.', mini: '체결 저장 완료 알림에 작은 축하 반응으로 나타나요.' }[previewArt];
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', paint);
    document.addEventListener('click', event => {
      const buddy = event.target.closest('[data-buddy]');
      if (buddy) { guide(buddy.closest('[data-buddy-context]').dataset.buddyContext); return; }
      const form = event.target.closest('[data-buddy-art-choice]');
      if (form && samples[form.dataset.buddyArtChoice]) {
        previewArt = form.dataset.buddyArtChoice;
        document.querySelectorAll('[data-buddy-art-choice]').forEach(button => button.setAttribute('aria-pressed', String(button === form)));
        document.querySelectorAll('[data-buddy-preview]').forEach((button, i) => { const [pose, label] = samples[previewArt][i]; button.dataset.buddyPreview = pose; button.textContent = label; });
        preview(samples[previewArt][0][0]); return;
      }
      const button = event.target.closest('[data-buddy-preview]');
      if (button && samples[previewArt].some(([pose]) => pose === button.dataset.buddyPreview)) preview(button.dataset.buddyPreview);
    });
  }
  return { describe, update, celebrate, guide };
});
