// 검증용 데이터 받기: 전 종목 일별 시세(2022~)·재무 시계열·코스피 지수를 research/data에 저장 (이미 받은 파일은 건너뜀)
// 사용: node research/fetch_data.js   (약 5분, 약 190MB)
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'data'), CONC = 8, NOW = Math.floor(Date.now() / 1000);
for (const d of ['allpx', 'allfund', 'krx']) fs.mkdirSync(path.join(D, d), { recursive: true });
const TYPES = 'annualDilutedEPS,annualStockholdersEquity,annualOrdinarySharesNumber,annualNetIncomeCommonStockholders,quarterlyDilutedEPS,quarterlyStockholdersEquity,quarterlyOrdinarySharesNumber';
const chart = (tk, p1) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}?period1=${p1}&period2=${NOW}&interval=1d&events=div%2Csplit`;
const fund = tk => `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${tk}?type=${TYPES}&period1=1420070400&period2=${NOW}`;
async function save(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (r.status === 404) return; if (!r.ok) throw new Error(r.status); fs.writeFileSync(file, await r.text()); return; }
    catch (e) { await new Promise(s => setTimeout(s, 1500 * (i + 1))); }
  }
}
(async () => {
  await save(chart('^KS11', 946684800), path.join(D, 'krx', 'kospi_daily.json'));
  const list = fs.readFileSync(path.join(D, 'all_list.txt'), 'utf8').trim().split('\n').map(l => l.split('\t')[0]);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < list.length) { const tk = list[i++];
      await save(chart(tk, 1640995200), path.join(D, 'allpx', tk + '.json'));
      await save(fund(tk), path.join(D, 'allfund', tk + '.json'));
      if (++done % 250 === 0) console.log(`${done}/${list.length}`); }
  }));
  console.log('완료:', D);
})();
