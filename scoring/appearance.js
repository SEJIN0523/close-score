// Appearance is independent of market data and personal investment records.
(() => {
  const root = document.documentElement, key = 'close-score-theme';
  const names = { system: '시스템', light: '라이트', dark: '미드나이트', blossom: '블로썸' };
  const media = matchMedia('(prefers-color-scheme: dark)');
  let selected = 'system';
  try { const saved = localStorage.getItem(key); if (Object.hasOwn(names, saved)) selected = saved; } catch (_) {}
  function paint() {
    root.dataset.theme = selected;
    const dark = selected === 'dark' || (selected === 'system' && media.matches);
    document.querySelector('meta[name="theme-color"]').content = selected === 'blossom' ? '#fff5fa' : dark ? '#121923' : '#f4f7fa';
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === selected)));
    const label = document.getElementById('themeCurrent');
    if (label) label.textContent = names[selected] + ' 테마 적용 중';
    const opener = document.getElementById('themeBtn');
    if (opener) opener.title = '화면 테마 · ' + names[selected];
  }
  paint();
  media.addEventListener('change', paint);
  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('themeDialog');
    document.getElementById('themeBtn').onclick = () => { paint(); dialog.showModal(); };
    document.getElementById('themeClose').onclick = () => dialog.close();
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    document.querySelectorAll('[data-theme-choice]').forEach(b => {
      b.onclick = () => {
        selected = b.dataset.themeChoice;
        try { localStorage.setItem(key, selected); } catch (_) {}
        paint();
      };
    });
    paint();
  });
})();
