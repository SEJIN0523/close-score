// Build an isolated UI preview from an existing data.json, without recalculating market data.
// node research/build_preview.js <data.json> <output-directory> [sim.json]
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const [dataFile, output, simulation] = process.argv.slice(2), root = path.join(__dirname, '..'), scoring = path.join(root, 'scoring');
if (!dataFile || !output) throw new Error('Usage: node research/build_preview.js <data.json> <output-dir> [sim.json]');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
if (!data.META.tradingCalendar) {
  const calendar = JSON.parse(fs.readFileSync(path.join(scoring, 'calendar.json'), 'utf8'));
  data.META.tradingCalendar = { sessions: calendar.sessions, observedThrough: data.META.asOf, forecastThrough: calendar.through };
}
if (!data.META.rankHistory) {
  const history = JSON.parse(fs.readFileSync(path.join(scoring, 'data/history.json'), 'utf8'));
  data.META.rankHistory = Object.fromEntries(Object.entries(history).filter(([d]) => d <= data.META.asOf).map(([d, v]) => [d, v.rk]));
}
if (simulation) data.SIM = JSON.parse(fs.readFileSync(simulation, 'utf8'));
let html = fs.readFileSync(path.join(scoring, 'template.html'), 'utf8');
for (const name of ['trading', 'score', 'ocr']) html = html.replace(`/*__${name.toUpperCase()}__*/`, () => fs.readFileSync(path.join(scoring, name + '.js'), 'utf8'));
html = html.replace('/*__BOOT__*/', 'window.WEB_MODE=true;(async()=>{const {META,ROWS,SIM}=await (await fetch("data.json")).json();').replace('/*__END__*/', '})();');
for (const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(scoring, 'web'), output, { recursive: true });
fs.writeFileSync(path.join(output, 'index.html'), html); fs.writeFileSync(path.join(output, 'data.json'), JSON.stringify(data));
console.log('Built isolated preview', output);
