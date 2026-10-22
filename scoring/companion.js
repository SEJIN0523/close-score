// Read-only character presentation. It never persists data or changes trade rules.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BLOSSOM_BUDDY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const poses = { guide: '손가락으로 안내하는 SD 캐릭터', happy: '기뻐하는 SD 캐릭터', sad: '시무룩한 SD 캐릭터', celebrate: '기록 완료를 축하하는 SD 캐릭터' };
  let account = { pnl: 0, records: 0, pending: 0 }, temporary = null, timer;
  function describe(input, context = 'todo') {
    const rounded = Number.isFinite(Number(input.pnl)) ? Math.round(Number(input.pnl)) : 0;
    const pnl = Object.is(rounded, -0) ? 0 : rounded;
    const hasRecords = Number(input.records) > 0;
    const financial = ['todo', 'hold', 'stat'].includes(context);
    const pose = financial && hasRecords ? pnl > 0 ? 'happy' : pnl < 0 ? 'sad' : 'guide' : 'guide';
    const messages = {
      todo: !hasRecords ? '반가워요! 실제 체결을 기록하며 시작해요.' : pnl > 0 ? '손익이 플러스예요. 오늘 기록도 함께 확인해요.' : pnl < 0 ? '마이너스인 날도, 기록은 차분하게 함께해요.' : Number(input.pending) > 0 ? `남은 계획 ${Math.floor(Number(input.pending))}건, 아래에서 확인해요.` : '오늘의 계획을 아래에서 함께 확인해요.',
      hold: '종목을 누르면 상세 내역이 펼쳐져요.',
      stat: '내 투자 기록의 흐름을 함께 살펴봐요.',
      rec: '궁금한 종목을 눌러 상세 정보를 확인해요.',
      watch: '관심종목과 백업 파일을 여기서 관리해요.',
    };
    return { pose, message: messages[context] || messages.todo,
      caption: financial && hasRecords ? `총손익 기준 · ${pnl > 0 ? '+' : ''}${pnl.toLocaleString('ko-KR')}원` : financial ? '아직 투자 기록이 없어요' : '캐릭터를 누르면 도움말을 볼 수 있어요',
      sign: pnl > 0 ? 'up' : pnl < 0 ? 'down' : '', pnl };
  }
  function paint() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.buddyReaction = temporary?.pose || '';
    document.querySelectorAll('[data-buddy-context]').forEach(header => {
      const context = header.dataset.buddyContext, view = describe(account, context);
      if (temporary && (!temporary.context || temporary.context === context)) Object.assign(view, temporary);
      const character = header.querySelector('[data-buddy]');
      character.dataset.pose = view.pose;
      character.setAttribute('aria-label', poses[view.pose] + ' · 안내 보기');
      const message = header.querySelector('[data-buddy-message]'), caption = header.querySelector('[data-buddy-caption]');
      if (message.textContent !== view.message) message.textContent = view.message;
      caption.textContent = view.caption;
      caption.classList.remove('up', 'down'); if (view.sign) caption.classList.add(view.sign);
    });
  }
  function update(input) { account = { ...account, ...input }; paint(); }
  function react(value) {
    clearTimeout(timer); temporary = value; paint();
    timer = setTimeout(() => { temporary = null; paint(); }, 4200);
  }
  function celebrate() { react({ pose: 'celebrate', message: '체결 기록을 저장했어요. 하나씩 꼼꼼하게!', context: null }); }
  function guide(context) {
    const help = { todo: '아래 계획을 펼치면 실제 체결 가격을 입력할 수 있어요.', hold: '매매 기록·이미지 등록 버튼으로 체결 내역을 남겨요.', stat: '자산·손익·월별·추천 탭으로 보기를 바꿔보세요.', rec: '순서와 점수는 투자 알고리즘이 계산한 결과예요.', watch: '데이터 관리에서 백업 파일을 받을 수 있어요.' };
    react({ pose: 'guide', message: help[context] || help.todo, context });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', paint);
    document.addEventListener('click', event => {
      const buddy = event.target.closest('[data-buddy]');
      if (buddy) { guide(buddy.closest('[data-buddy-context]').dataset.buddyContext); return; }
      const preview = event.target.closest('[data-buddy-preview]');
      if (!preview) return;
      const pose = preview.dataset.buddyPreview;
      if (!poses[pose]) return;
      document.getElementById('buddyDemo').dataset.pose = pose;
      document.getElementById('buddyDemo').setAttribute('aria-label', poses[pose]);
      document.querySelectorAll('[data-buddy-preview]').forEach(button => button.setAttribute('aria-pressed', String(button === preview)));
      document.getElementById('buddyPreviewText').textContent = { guide: '손가락으로 화면 사용법을 안내해요.', happy: '실제 총손익이 플러스일 때 기뻐해요.', sad: '실제 총손익이 마이너스일 때 함께 시무룩해져요.', celebrate: '체결 기록이 저장됐을 때 잠깐 축하해요.' }[pose];
    });
  }
  return { describe, update, celebrate, guide };
});
