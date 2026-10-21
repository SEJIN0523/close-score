'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {ROOT,text,between,SCORE,rank,updateFunctions,researchFormula,legacyRun,curveMetrics,addDays}=require('./lib.cjs');
const OUT=path.resolve(process.argv[2]||path.join(__dirname,'results'));fs.mkdirSync(OUT,{recursive:true});
const checks=[];function check(name,fn){try{checks.push({name,status:'executed',evidence:fn()});}catch(e){checks.push({name,status:'harness_error',error:e.stack});}}
const json=p=>JSON.parse(text(p));const px=Object.values(json('scoring/data/last_px.json')),hist=json('scoring/data/history.json'),sim=json('scoring/data/sim.json');
const baseline=rank(px);const recNames=keys=>keys.map(k=>({code:k,name:px.find(r=>r.k===k)?.n}));
check('Formula equality with identical precomputed inputs (not end-to-end parity)',()=>{
 const fn=researchFormula()['새 식'];let max=0;for(const r of baseline.rows){if(r.t==null)continue;const f=SCORE.score(r);const a=fn({LGp:r.lgp,Tp:f.Tp,MOMp:r.momp,EGp:r.egp,SHp:r.shp,DGp:r.dgp});max=Math.max(max,Math.abs(f.total-a));}assert(max<1e-10);return {maxAbsoluteDifference:max};});
check('Actual snapshot / cached score reproducibility',()=>{
 const cache=new Map(px.map(r=>[r.k,r]));const diffs=baseline.rows.filter(r=>r.t!=null&&cache.get(r.k).t!=null&&Math.abs(r.t-cache.get(r.k).t)>0.001);
 const asOf=px.map(r=>r.d).sort().at(-1);return {rows:px.length,base:baseline.B.length,asOf,scoreDifferences:diffs.length,maxDifference:Math.max(0,...diffs.map(r=>Math.abs(r.t-cache.get(r.k).t))),recommendations:recNames(baseline.recs),historyRecs:hist[asOf]?.recs,historyRecsMatch:JSON.stringify(baseline.recs)===JSON.stringify(hist[asOf]?.recs)};});
check('Research tie order versus production lower-bound percentiles on SAME snapshot inputs',()=>{
 const rs=structuredClone(baseline.B);for(const [key,out]of [['eg','egp'],['sh','shp'],['dg','dgp'],['mom','momp'],['lg','lgp'],['T','Tp']]){
 if(key==='T')rs.forEach(r=>r.T=100*(r.hi>r.lo?(r.p-r.lo)/(r.hi-r.lo):0.5));
 const has=rs.filter(r=>r[key]!=null&&Number.isFinite(r[key])).sort((a,b)=>a[key]-b[key]);has.forEach((r,i)=>r[out]=has.length>1?100*i/(has.length-1):50);rs.filter(r=>r[out]==null).forEach(r=>r[out]=50);
 }
 const fn=researchFormula()['새 식'];const deltas=rs.map(r=>{const v=fn({LGp:r.lgp,Tp:r.Tp,MOMp:r.momp,EGp:r.egp,SHp:r.shp,DGp:r.dgp});const old=baseline.rows.find(x=>x.k===r.k).t;return {code:r.k,name:r.n,difference:v-old,researchStyleScore:v,productionRoundedScore:old};});
 rs.forEach((r,i)=>r.auditScore=deltas[i].researchStyleScore);rs.sort((a,b)=>b.auditScore-a.auditScore);
 const rec=[],sectors={};for(let i=0;i<rs.length&&rec.length<15;i++){const r=rs[i];if(100*i/rs.length>=20)break;if(!r.el||r.ch<=-0.08||(sectors[r.s]||0)>=3)continue;rec.push(r.k);sectors[r.s]=(sectors[r.s]||0)+1;}
 return {scope:'Feature sources held constant; includes rounding, tie ranks and boundary convention differences; NOT full research backtest',rows:rs.length,changedOverPoint1:deltas.filter(x=>Math.abs(x.difference)>0.1).length,maxAbsoluteDifference:Math.max(...deltas.map(x=>Math.abs(x.difference))),largest:deltas.sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference)).slice(0,10),recommendations:recNames(rec),overlap:rec.filter(k=>baseline.recs.includes(k)).length};});
check('Synthetic equal-factor permutation counterexample',()=>{
 const input=[{id:'A',x:0},{id:'B',x:0},{id:'C',x:1}];const ordinal=rs=>Object.fromEntries(rs.slice().sort((a,b)=>a.x-b.x).map((r,i)=>[r.id,100*i/(rs.length-1)]));
 const first=ordinal(input),second=ordinal([input[1],input[0],input[2]]);assert.notEqual(first.A,second.A);return {label:'synthetic mechanics, no return evidence',first,second,productionExpectedTieValue:0};});
check('Synthetic high/low and close-adjusted range mismatch',()=>{
 const f=updateFunctions(),bars=Array.from({length:260},(_,i)=>({d:addDays('2025-01-01',i),c:i===259?1100:1000,h:1500,l:500,a:i===259?1100:1000,v:1e7}));
 const r=f.buildRow({ch:{bars,divs:[]},fd:true,e:100,bps:1000,shares:1e8,code:'TEST',name:'synthetic',sector:'s',eg:0,sh:0},0);
 const prod=100*(r.p-r.lo)/(r.hi-r.lo),research=100*(1100-1000)/(1100-1000);assert.notEqual(prod,research);return {label:'synthetic counterexample, no return evidence',productionRangePosition:prod,researchRangePosition:research};});
check('Synthetic report lag versus unrestricted operating TTM',()=>{
 const fd={annualDilutedEPS:[{d:'2023-12-31',v:10},{d:'2024-12-31',v:99}]};const date='2025-01-10';const known=require(path.join(ROOT,'research/fdata.js')).knownAt(fd.annualDilutedEPS,date);
 const live=updateFunctions().ttmEps(fd);assert.equal(known.v,10);assert.equal(live,99);return {label:'synthetic as-of violation potential; not proof Yahoo delivered unpublished data',signalDate:date,researchEps:known.v,operatingEps:live};});
check('Stale row removal / empirical cross-sectional sensitivity',()=>{
 const asOf=px.map(r=>r.d).sort().at(-1),old=px.filter(r=>r.d<asOf),fresh=rank(px.filter(r=>r.d===asOf));const f=new Map(fresh.rows.map(r=>[r.k,r]));const diffs=baseline.rows.filter(r=>r.t!=null&&f.get(r.k)?.t!=null).map(r=>({code:r.k,name:r.n,delta:f.get(r.k).t-r.t}));
 return {asOf,staleCount:old.length,staleBase:old.filter(r=>r.base).length,staleEligible:old.filter(r=>r.el).length,staleRecommendations:recNames(baseline.recs.filter(k=>old.some(r=>r.k===k))),freshOnlyRecommendations:recNames(fresh.recs),recommendationOverlap:baseline.recs.filter(k=>fresh.recs.includes(k)).length,maxScoreDelta:Math.max(0,...diffs.map(x=>Math.abs(x.delta))),changedOverPoint1:diffs.filter(x=>Math.abs(x.delta)>0.1).length,largest:diffs.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,5),interpretation:'Stale dates observed, cause (fetch failure, halt, etc.) not identifiable from snapshot'};});
check('Operating add rule after three tranches versus claim no more adds',()=>{
 const s={p:2000,ch:0},pos={qty:100,avg:2000,maxP:2000,stopPct:-0.2,upPct:0.3,buys:['2025-01-01','2025-01-08','2025-01-15'],firstD:'2025-01-01',lastD:'2025-01-15'};
 const result=SCORE.manage(s,0,pos,{capital:1e8,slots:10},'2025-01-25');assert.equal(result.k,'add');return {label:'synthetic mechanics',result};});
check('Legacy daily order timing and all-cost sensitivity (synthetic only)',()=>{
 const DAYS=['2025-01-02','2025-01-03','2025-01-06','2025-01-07'];
 const dist={vcut:[0.4,0.6],cells:Object.fromEntries(Array.from({length:15},(_,i)=>[`${Math.floor(i/3)}_${i%3}`,{stop:-0.2,q:[-0.2,0,0.1,0.3,0.5]}]))};
 const daily={'새 식':new Map(DAYS.map((d,i)=>[d,{rows:new Map([['X',{rk:i>=2?90:1,band:i>=2?4:0,vol:0.3}]]),recs:i>=2?[]:['X']}]))};
 const context={DAYS,daily,DNEW:dist,DIST:dist,BYTK:new Map([['X',{idx:new Map(DAYS.map((d,i)=>[d,i])),a:[100,110,120,130]}]])};
 const run=legacyRun(context),gross=run({maxPos:1,take:false,trim:false,add:false,cashRate:0,buyCost:0,sellCost:0}),cost=run({maxPos:1,take:false,trim:false,add:false,cashRate:0,buyCost:0.001,sellCost:0.0025});
 assert.equal(gross.log[0].d,DAYS[1]);assert.equal(gross.log[1].d,DAYS[3]);assert.equal(gross.log.length,2);assert(cost.final<gross.final);
 return {label:'SYNTHETIC TEST; must not be reported as investment performance',firstFill:cost.log[0].d,firstSell:cost.log[1].d,costPaid:cost.costPaid,legacyCostImplementation:'buy units=budget*(1-buyCost)/price; sell proceeds=notional*(1-sellCost)',assertions:3};});
SCORE.setT(baseline.TS);
const weights={baseline_40_40_20:[0.4,0.4,0.2],equal_thirds:[1/3,1/3,1/3],size20_trend60_growth20:[0.2,0.6,0.2],size0_trend80_growth20:[0,0.8,0.2],size0_trend100_growth0:[0,1,0]};
const weightSnapshot=[];for(const [name,w]of Object.entries(weights)){
 const rs=baseline.rows.filter(r=>r.base).map(r=>{const f=SCORE.score(r);return {...r,auditScore:w[0]*f.size+w[1]*f.trend+w[2]*f.growth};}).sort((a,b)=>b.auditScore-a.auditScore);
 const picks=[],sectors={};for(let i=0;i<rs.length&&picks.length<15;i++){const r=rs[i];if(i/rs.length>=0.2)break;if(!r.el||r.ch<=-0.08||(sectors[r.s]||0)>=3)continue;picks.push(r.k);sectors[r.s]=(sectors[r.s]||0)+1;}
 weightSnapshot.push({name,weights:w,picks:recNames(picks),baselineOverlap:picks.filter(k=>baseline.recs.includes(k)).length,performance:null});
}
const momentum=baseline.rows.filter(r=>r.base&&r.mom!=null).sort((a,b)=>b.mom-a.mom);weightSnapshot.push({name:'simple_12minus1_momentum',weights:null,picks:recNames(momentum.slice(0,10).map(r=>r.k)),performance:null,policy:'Top 10 raw 12-1 momentum among base; no sector/eligible filter, only a snapshot comparator'});
const archive=Object.entries(sim.series).map(([name,curve])=>({name,evidence:'Archived thinned curve arithmetic only; NOT independent backtest',...curveMetrics(curve),reportedUnverified:sim.stats[name],dailySharpe:null,tradeWinRate:null,tradeCount:null}));
const attempts=[];for(const script of ['bt2.js','bt3.js','fx.js','opt.js','bt6.js','sim_split.js','sim_t.js','sim_g.js','sim_final_split.js']){
 // Existing programs fail on missing inputs before writes. Guard against accidental mutation if data are later restored.
 if(fs.existsSync(path.join(ROOT,'research/data/krx/kospi_daily.json'))||fs.existsSync(path.join(ROOT,'research/data/fx_obs.json'))){attempts.push({script,status:'not_executed',reason:'Use isolated legacy-replay.cjs for restored raw data'});continue;}
 const p=cp.spawnSync(process.execPath,[path.join(ROOT,'research',script),path.join(ROOT,'research/data'),path.join(OUT,script+'.json')],{encoding:'utf8',timeout:10000});
 attempts.push({script,status:p.status===0?'unexpected_success':'blocked_missing_input',exitCode:p.status,stderr:p.stderr.slice(0,1300)});
}
check('Full-sample distribution reused by operating model',()=>{
 const d=json('research/data/dist_new.json');assert.deepEqual(SCORE.DIST,d);return {equal:true,interpretation:'Confirms identical stored calibration; does not validate its historical inputs or OOS calibration'};});
check('Cached financial statement periods versus snapshot date',()=>{
 const date=px.map(r=>r.d).sort().at(-1),latest={},dir=path.join(ROOT,'scoring/data/fund');let futurePeriodRecords=0;
 for(const file of fs.readdirSync(dir)){const j=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));for(const t of j.timeseries?.result||[]){const k=t.meta?.type?.[0];for(const x of t[k]||[]){if(x.asOfDate>date)futurePeriodRecords++;if(!latest[k]||x.asOfDate>latest[k])latest[k]=x.asOfDate;}}}
 return {date,futurePeriodRecords,latest,interpretation:'No future accounting-period endpoints observed is NOT evidence of true publication availability or revision vintages'};
});
const inputPaths=['scoring/score.js','scoring/update.js','scoring/template.html','scoring/data/last_px.json','scoring/data/history.json','scoring/data/sim.json',...fs.readdirSync(path.join(ROOT,'research')).filter(f=>f.endsWith('.js')).map(f=>'research/'+f),'research/data/all_list.txt','research/data/dist_new.json','research/data/dist2.json'];
const inputs=inputPaths.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')}));
const fundDir=path.join(ROOT,'scoring/data/fund'),fundHash=crypto.createHash('sha256');for(const file of fs.readdirSync(fundDir).sort()){fundHash.update(file+'\0');fundHash.update(fs.readFileSync(path.join(fundDir,file)));}inputs.push({path:'scoring/data/fund/* (sorted filenames + NUL + raw bytes)',sha256:fundHash.digest('hex')});
const inventory={historicalPricesDirectory:fs.existsSync(path.join(ROOT,'research/data/allpx')),historicalFundamentalsDirectory:fs.existsSync(path.join(ROOT,'research/data/allfund')),historicalIndexDirectory:fs.existsSync(path.join(ROOT,'research/data/krx')),optimizationObservations:fs.existsSync(path.join(ROOT,'research/data/fx_obs.json')),currentFundFiles:fs.readdirSync(path.join(ROOT,'scoring/data/fund')).length,currentRows:px.length};
const result={schema:1,sourceCommit:cp.execSync('git rev-parse HEAD',{cwd:ROOT,encoding:'utf8'}).trim(),inventory,inputs,checks,weightSnapshot,archive,legacyAttempts:attempts,blocked:['Full historical independent replay','Cost/slippage-adjusted realized performance','Daily Sharpe and complete trades/win rate','KOSDAQ and KOSPI200 benchmarks','True untouched out-of-sample evaluation','Delisted securities and historical constituents','Actual publication timestamps and unrevised financial vintages','Auction fills, spreads, halts and capacity']};
fs.writeFileSync(path.join(OUT,'audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceCommit:result.sourceCommit,inventory,checks:checks.map(c=>({name:c.name,status:c.status})),stale:checks.find(c=>c.name.startsWith('Stale')).evidence,archive:archive.map(({name,totalReturn,cagr,observedMdd})=>({name,totalReturn,cagr,observedMdd})),legacyAttempts:attempts.map(({script,status})=>({script,status}))},null,2));
if(checks.some(c=>c.status==='harness_error'))process.exitCode=1;
