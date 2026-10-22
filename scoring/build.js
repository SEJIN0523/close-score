// Render the same verified market snapshot with the current UI, without refetching prices.
const fs = require('fs'), path = require('path'), themeAssets = require('./theme-assets.js');
module.exports = ({ META, ROWS: rows }, options = {}) => {
  const DIR = __dirname, DATA = path.join(DIR, 'data');
  const OUT = options.output || path.join(DIR, '..', '종가스코어링_대시보드.html');
  const tpl = fs.readFileSync(path.join(DIR, 'template.html'), 'utf8').replace('/*__TRADING__*/', () => fs.readFileSync(path.join(DIR, 'trading.js'), 'utf8')).replace('/*__OCR__*/', () => fs.readFileSync(path.join(DIR, 'ocr.js'), 'utf8')), scoreJs = fs.readFileSync(path.join(DIR, 'score.js'), 'utf8');
  const simJson = fs.existsSync(path.join(DATA, 'sim.json')) ? fs.readFileSync(path.join(DATA, 'sim.json'), 'utf8') : 'null';
  // 파일 버전: 데이터를 HTML 안에 넣는다
  const html = themeAssets(tpl, true).replace('/*__SCORE__*/', () => scoreJs).replace('/*__END__*/', '})();')
    .replace('/*__BOOT__*/', () => `(async () => {\nconst META = ${JSON.stringify(META)};\nconst ROWS = ${JSON.stringify(rows)};\nconst SIM = ${simJson};`);
  fs.writeFileSync(OUT, html, 'utf8');
  // 웹앱 버전: 화면은 index.html, 데이터는 data.json (열 때마다 새로 받음)
  if (options.web) {
    const WD = path.resolve(options.web), WEB = path.join(DIR, 'web');
    fs.mkdirSync(WD, { recursive: true });
    const boot = `window.WEB_MODE = true;
(async () => {
let D = null;
try { const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); D = await r.json(); }
catch (e) { try { const c = await caches.match(new URL('data.json', location.href).href); if (c) { D = await c.json(); window.OFFLINE = true; } } catch (e2) {} }
if (!D) { document.querySelector('main').innerHTML = '<p class="empty">데이터를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 열어 주세요.</p>'; return; }
const { META, ROWS, SIM } = D;`;
    const head = '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n<script>if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js"));</script>\n</head>';
    fs.writeFileSync(path.join(WD, 'index.html'), themeAssets(tpl).replace('/*__SCORE__*/', () => scoreJs).replace('/*__BOOT__*/', () => boot).replace('/*__END__*/', '})();').replace('</head>', () => head), 'utf8');
    fs.writeFileSync(path.join(WD, 'data.json'), `{"META":${JSON.stringify(META)},"ROWS":${JSON.stringify(rows)},"SIM":${simJson}}`, 'utf8');
    for (const f of fs.readdirSync(WEB)) fs.cpSync(path.join(WEB, f), path.join(WD, f), { recursive: true });
    console.log('웹앱 파일:', WD);
  }
};
