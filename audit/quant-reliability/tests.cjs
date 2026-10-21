'use strict';
// Entire fixture is synthetic and is NEVER written to results as investment performance.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {ROOT,curveMetrics}=require('./lib.cjs'),{prepare,dailyMetrics}=require('./legacy-replay.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'close-score-audit-fixture-'));
try {
 for(const d of ['allpx','allfund','krx'])fs.mkdirSync(path.join(dir,d));
 for(const f of ['dist2.json','dist_new.json'])fs.copyFileSync(path.join(ROOT,'research/data',f),path.join(dir,f));
 fs.writeFileSync(path.join(dir,'all_list.txt'),'000001.KS\tSYNTHETIC\tTEST\n');
 const dates=[];for(let t=Date.parse('2022-01-03');dates.length<900;t+=864e5){const d=new Date(t);if(d.getUTCDay()%6!==0)dates.push(t/1000);}
 const close=dates.map((_,i)=>2000+i),volume=dates.map(()=>2e6);
 const payload={chart:{result:[{timestamp:dates,indicators:{quote:[{close,volume}],adjclose:[{adjclose:close}]},events:{}}]}};
 for(const f of ['allpx/000001.KS.json','krx/kospi_daily.json'])fs.writeFileSync(path.join(dir,f),JSON.stringify(payload));
 const types={annualDilutedEPS:[100,110,120,130],annualStockholdersEquity:[1e11,1e11,1e11,1e11],annualOrdinarySharesNumber:[1e8,1e8,1e8,1e8]};
 const timeseries={result:Object.entries(types).map(([k,vals])=>({meta:{type:[k]},[k]:vals.map((v,i)=>({asOfDate:(2020+i)+'-12-31',reportedValue:{raw:v}}))}))};fs.writeFileSync(path.join(dir,'allfund/000001.KS.json'),JSON.stringify({timeseries}));
 const e=prepare(dir);assert.equal(e.ST.length,1);let calls=0;
 for(const form of ['새 식','equal','20/60/20','0/80/20','momentum'])for(const slippage of [0,.001,.003,.005]){
 const r=e.run({form,take:false,entry:'third',buyCost:.001,sellCost:.0025,slippage,cashRate:0});assert(r.curve.length>100);assert(r.log.length>0);assert(r.costPaid>0);assert.equal(r.slipPaid>0,slippage>0);const m=dailyMetrics(r.curve,r.log);assert(Number.isFinite(m.cagr));assert(Number.isFinite(m.dailySharpe));calls++;
 }
 // Exact fee and two-sided slippage identity on a separate four-day toy ledger.
 const vm=require('node:vm'),DAYS=['2025-01-02','2025-01-03','2025-01-06','2025-01-07'];
 const dist=JSON.parse(fs.readFileSync(path.join(dir,'dist_new.json'),'utf8'));
 const daily={'새 식':new Map(DAYS.map((d,i)=>[d,{rows:new Map([['X',{rk:i>=2?90:1,band:i>=2?4:0,vol:.3}]]),recs:i>=2?[]:['X']}]))};
 const run=vm.runInNewContext('('+e.run.toString()+')',{DAYS,daily,DNEW:dist,DIST:dist,BYTK:new Map([['X',{idx:new Map(DAYS.map((d,i)=>[d,i])),a:[100,110,120,130]}]])});
 for(const slippage of [0,.001,.003,.005]){const r=run({form:'새 식',maxPos:1,take:false,trim:false,add:false,cashRate:0,buyCost:.001,sellCost:.0025,slippage});
 const expected=1e8/(110*(1+slippage)*(1+.001))*130*(1-slippage)*(1-.0025);
 assert.equal(r.log.length,2);assert.equal(r.log[0].d,DAYS[1]);assert.equal(r.log[1].d,DAYS[3]);assert(Math.abs(r.final-Math.round(expected))<.01);}
 assert.throws(()=>curveMetrics([['2025-01-02',100],['2025-01-01',101]]),/Invalid/);
 const m=curveMetrics([['2024-01-01',100],['2024-06-01',50],['2025-01-01',100]]);assert.equal(m.observedMdd,-.5);assert.equal(m.totalReturn,0);
 console.log(JSON.stringify({status:'synthetic_harness_checks_completed',scenarioCalls:calls,exactTwoSidedCostCases:4,includes:'fee/slippage code paths, alternative forms, dates, MDD, returns and daily metric mechanics',notValidated:'Any real strategy return, PIT dataset, future holdout, liquidity or execution price'}));
} finally {fs.rmSync(dir,{recursive:true,force:true});}
