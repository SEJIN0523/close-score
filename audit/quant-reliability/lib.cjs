'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const text = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const between = (s, start, end) => { const a=s.indexOf(start), b=s.indexOf(end,a+start.length); if(a<0||b<0)throw Error('Source boundary missing: '+start);return s.slice(a,b); };
const SCORE = require(path.join(ROOT,'scoring/score.js'));
const {addDays,mean}=require(path.join(ROOT,'research/fdata.js'));
const cap=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),last=a=>a?.at(-1);
function updateFunctions(){
 const s=text('scoring/update.js');
 const code=between(s,'function ttmEps(fd)', '\nconst ttmDiv')+'\n'+between(s,'  function buildRow(c, off)', '\n  // 4)')+'\n'+between(s,'  function rank(rows)', '\n  const live =')+'\n({ttmEps,buildRow,rank})';
 return vm.runInNewContext(code,{SCORE,addDays,mean,cap,last,REC_N:15,SECTOR_CAP:3,ttmDiv:(ds,d)=>ds.filter(x=>x.d>addDays(d,-365)&&x.d<=d).reduce((s,x)=>s+x.amt,0)});
}
function rank(rows){SCORE.setT([]);const cloned=structuredClone(rows),result=updateFunctions().rank(cloned);return {rows:cloned,...result};}
function researchFormula(){const source=text('research/sim_final_split.js');return vm.runInNewContext(between(source,'const FORM = {','\nconst daily =')+';FORM');}
// Only the pure legacy simulator is loaded. No original top-level downloads or writes run.
function legacyRun(context){const s=text('research/sim_final_split.js');return vm.runInNewContext(between(s,'function run(opt) {','\nconst NAME =')+';run',context);}
function curveMetrics(curve){
 if(curve.length<2)throw Error('At least two equity observations required');
 for(let i=0;i<curve.length;i++)if(!/^\d{4}-\d{2}-\d{2}$/.test(curve[i][0])||!(curve[i][1]>0)||i&&curve[i][0]<=curve[i-1][0])throw Error('Invalid equity series');
 const first=curve[0],last=curve.at(-1),years=(Date.parse(last[0])-Date.parse(first[0]))/864e5/365.25;
 let peak=first[1],mdd=0;for(const [,v]of curve){peak=Math.max(peak,v);mdd=Math.min(mdd,v/peak-1);}
 const ends={};for(const [d,v]of curve)ends[d.slice(0,4)]=[d,v];let prior=first[1];
 const annual=Object.entries(ends).map(([year,[observedThrough,v]])=>{const ret=v/prior-1;prior=v;return {year,observedThrough,ret};});
 return {observations:curve.length,from:first[0],to:last[0],totalReturn:last[1]/first[1]-1,cagr:Math.expm1(Math.log(last[1]/first[1])/years),observedMdd:mdd,annual, dailySharpe:null};
}
module.exports={ROOT,text,between,SCORE,rank,updateFunctions,researchFormula,legacyRun,curveMetrics,addDays};
