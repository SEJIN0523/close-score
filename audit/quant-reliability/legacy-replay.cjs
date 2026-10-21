'use strict';
// Diagnostic sensitivity of the LEGACY research model, not a validated live-strategy replica.
// No source edits, downloads, original output writes or production updates.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {ROOT,text,curveMetrics}=require('./lib.cjs');
function patch(source,needle,replacement){assert(source.includes(needle),'Source changed: '+needle);return source.replace(needle,replacement);}
function prepare(dataDir){
 const S=path.resolve(dataDir);
 for(const p of ['krx/kospi_daily.json','dist2.json','dist_new.json','all_list.txt','allpx','allfund'])if(!fs.existsSync(path.join(S,p)))throw Error('Missing real historical input: '+path.join(S,p));
 let source=text('research/sim_final_split.js');source=source.slice(0,source.indexOf('\nconst NAME ='));
 source=patch(source,"const FORM = {",`const FORM = {
  'equal': r => (r.LGp + (r.Tp+r.MOMp)/2 + (r.EGp+r.SHp+r.DGp)/3)/3,
  '20/60/20': r => .2*r.LGp+.6*(r.Tp+r.MOMp)/2+.2*(r.EGp+r.SHp+r.DGp)/3,
  '0/80/20': r => .8*(r.Tp+r.MOMp)/2+.2*(r.EGp+r.SHp+r.DGp)/3,
  'momentum': r => r.MOMp,`);
 // Retain the full-sample distribution deliberately; mark this limitation in every output.
 source=patch(source,"(opt.form || '새 식') === '새 식' ? DNEW : DIST","opt.form === '이전 식' ? DIST : DNEW");
 source=patch(source,'costPaid = 0,','costPaid = 0, slipPaid = 0,');
 source=patch(source,'const units = amt * (1 - o.buyCost) / a','const units = amt / ((1 + o.buyCost) * a * (1 + (o.slippage || 0)))');
 source=patch(source,'costPaid += amt * o.buyCost;','costPaid += amt * o.buyCost / (1 + o.buyCost); slipPaid += units * a * (o.slippage || 0);');
 source=patch(source,'net = val * (1 - o.sellCost)','net = val * (1 - (o.slippage || 0)) * (1 - o.sellCost)');
 source=patch(source,'costPaid += val * o.sellCost;','costPaid += val * (1 - (o.slippage || 0)) * o.sellCost; slipPaid += val * (o.slippage || 0);');
 source=patch(source,'costPaid, curve, log: trades','costPaid, slipPaid, curve, log: trades');
 const readOnlyFs={readFileSync:fs.readFileSync.bind(fs),existsSync:fs.existsSync.bind(fs),statSync:fs.statSync.bind(fs)};
 const req=name=>{if(name==='fs')return readOnlyFs;if(name==='./fdata.js')return require(path.join(ROOT,'research/fdata.js'));throw Error('Unexpected dependency '+name);};
 return vm.runInNewContext(source+'\n({run,DAYS,ST})',{require:req,process:{argv:['node','audit',S,'unused']},console},{timeout:300000});
}
function dailyMetrics(curve,log){
 const m=curveMetrics(curve),r=curve.slice(1).map(([,v],i)=>v/curve[i][1]-1),avg=r.reduce((a,b)=>a+b,0)/r.length,sd=Math.sqrt(r.reduce((a,b)=>a+(b-avg)**2,0)/(r.length-1));
 const closed=log?.filter(x=>x.pnl!=null)||[];
 return {...m,dailySharpe:sd>0?avg/sd*Math.sqrt(252):null,sharpeRiskFree:0,tradeCount:log?log.length:null,tradeWinRate:log&&closed.length?closed.filter(x=>x.pnl>0).length/closed.length:null,winRateDefinition:'profitable sell events / sell events, not complete position round trips',annual:m.annual};
}
function main(){
 const [dataDir,outDir]=process.argv.slice(2);if(!dataDir||!outDir)throw Error('Usage: node audit/quant-reliability/legacy-replay.cjs /path/to/real-data /tmp/audit-replay');
 // All inputs are checked before creating output. Missing data never produces returns.
 const engine=prepare(dataDir);if(engine.ST.length<100)throw Error('Coverage too small for a full-universe legacy comparison: '+engine.ST.length);
 const results=[];
 for(const form of ['새 식','equal','20/60/20','0/80/20','momentum'])for(const slippage of [0,0.001,0.003,0.005]){
 const r=engine.run({form,take:false,entry:'third',buyCost:.001,sellCost:.0025,slippage});
 results.push({form,slippage,metrics:dailyMetrics(r.curve,r.log),fees:r.costPaid,slippageCost:r.slipPaid,curve:r.curve,log:r.log,warning:'LEGACY SENSITIVITY ONLY: full-sample DIST, survivors, ordinal ties, annual financial lag proxy, adjusted fractional units, no liquidity/auction constraints; not live implementation parity or untouched OOS.'});}
 const benchmarks=[];const {readPx}=require(path.join(ROOT,'research/fdata.js'));
 for(const [name,file]of [['KOSPI','kospi_daily.json'],['KOSDAQ','kosdaq_daily.json'],['KOSPI200','kospi200_daily.json']]){
 const p=readPx(path.join(dataDir,'krx',file));if(!p){benchmarks.push({name,status:'missing',metrics:null});continue;}
 const map=new Map(p.bars.map(x=>[x.d,x.c]));if(!engine.DAYS.every(d=>map.has(d))){benchmarks.push({name,status:'incomplete_dates',metrics:null});continue;}
 const base=map.get(engine.DAYS[0]),curve=engine.DAYS.map(d=>[d,1e8*map.get(d)/base]);benchmarks.push({name,status:'computed_price_index_only',metrics:dailyMetrics(curve),warning:'No dividends or investable ETF fees; strategy uses dividend-adjusted prices, so comparison is not like for like.'});}
 fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'legacy-sensitivity.json'),JSON.stringify({status:'diagnostic_not_validated',results,benchmarks},null,2));
 console.log('Wrote diagnostic results only; no claim of untouched OOS or live strategy reproduction.');
}
module.exports={prepare,dailyMetrics};if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
