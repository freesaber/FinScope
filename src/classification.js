'use strict';
// 主进程与页面共用同一套规则，旧缓存无需迁移。
const Classification = (() => {
  const fields = typeof module !== 'undefined' ? require('./fields.js') : F;
  const labels = {1:'推荐',2:'保留意见',3:'不推荐'};
  const numeric = value => value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim())?null:Number.isFinite(Number(value))?Number(value):null;
  function value(row,key){const f=fields[key],source=row?.[f.sheet];const field=f.names.find(name=>source&&Object.hasOwn(source,name));return field?numeric(source[field]):null;}
  function map(rows){const result=new Map();for(const row of rows||[]){const date=String(row.REPORT_DATE||row.REPORTDATE||'').slice(0,10).replaceAll('/','-');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;const old=result.get(date);if(!old||String(row.NOTICE_DATE||row.UPDATE_DATE||'')>String(old.NOTICE_DATE||old.UPDATE_DATE||''))result.set(date,row);}return result;}
  function classify(data){
    const b=map(data.b),i=map(data.i),c=map(data.c);
    const dates=[...b.keys()].filter(date=>i.has(date)).sort().reverse();
    const row=date=>({date,b:b.get(date),i:i.get(date),c:c.get(date)});
    const r=dates.length?row(dates[0]):null;
    const reasons=[],missing=[];let level=1;
    const signal=(grade,text)=>{level=Math.max(level,grade);reasons.push(text);};
    if(!r)return {level:2,label:labels[2],period:null,workingPeriod:null,reasons:[],missing:['缺少按报告期配对的资产负债表与利润表']};
    const equity=value(r,'equity'),me=value(r,'minorityEquity'),profit=value(r,'profit'),mp=value(r,'minorityProfit');
    const minority=equity>0&&me>0&&profit>0&&mp!==null&&mp>=0?(mp/profit)/(me/equity):null;
    if(minority===null||!Number.isFinite(minority))missing.push('少数股东指标缺失或不适用');
    else if(minority>1.5)signal(minority>3?3:2,`少数股东偏离 ${minority.toFixed(2)} 倍${minority>3?'，超过 3 倍':'，超过 1.5 倍'}`);
    const parent=value(r,'parentProfit'),ocf=value(r,'ocf');
    const cash=parent>0&&ocf!==null?ocf/parent:null;
    if(cash===null||!Number.isFinite(cash))missing.push('现金兑现指标缺失或归母利润不为正');
    else if(cash<0.8)signal(cash<0?3:2,cash<0?'归母盈利但经营现金净流出':`现金兑现 ${cash.toFixed(2)} 倍，低于 0.8 倍`);
    const annualDate=dates.find(date=>date.endsWith('-12-31'));
    if(data.financial){missing.push('金融企业：经营占款与短债初筛不适用');}
    else{
      const money=value(r,'monetary'),short=value(r,'shortDebt'),due=value(r,'currentLongDebt');
      const debt=money!==null&&money>=0&&short!==null&&short>=0&&due!==null&&due>=0&&short+due>0?money/(short+due):null;
      if(debt===null||!Number.isFinite(debt))missing.push('短债覆盖指标缺失或选定短债为零');
      else if(debt<1)signal(2,`现金覆盖短债 ${debt.toFixed(2)} 倍，低于 1 倍`);
      const prev=annualDate?`${Number(annualDate.slice(0,4))-1}-12-31`:null;
      if(!annualDate||!dates.includes(prev))missing.push('经营占款缺少连续两年年报');
      else{
        const a=row(annualDate),p=row(prev);
        const growth=key=>{const now=value(a,key),base=value(p,key);return now!==null&&base>0?(now-base)/base:null;};
        const revenue=growth('revenue'),receivable=growth('receivable'),inventory=growth('inventory');
        if([revenue,receivable,inventory].some(n=>n===null||!Number.isFinite(n)))missing.push('经营占款增速缺失或基数不为正');
        for(const [name,n] of [['应收',receivable],['存货',inventory]])if(n!==null&&revenue!==null&&n-revenue>0.2)signal(2,`${annualDate.slice(0,4)} 年报${name}增速高于营收 ${((n-revenue)*100).toFixed(1)} 个百分点`);
      }
    }
    if(level===1&&missing.length)level=2;
    return {level,label:labels[level],period:r.date,workingPeriod:annualDate||null,reasons,missing};
  }
  return {classify,labels};
})();
if(typeof module!=='undefined')module.exports=Classification;
