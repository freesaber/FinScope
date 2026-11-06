const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify}=require('../src/classification.js');
function fixture(){return {b:['2026-09-30','2025-12-31','2024-12-31'].map(REPORT_DATE=>({REPORT_DATE,TOTAL_EQUITY:100,MINORITY_EQUITY:10,MONETARYFUNDS:100,SHORT_LOAN:10,NONCURRENT_LIAB_1YEAR:10,ACCOUNTS_RECE:10,INVENTORY:10})),i:['2026-09-30','2025-12-31','2024-12-31'].map(REPORT_DATE=>({REPORT_DATE,NETPROFIT:100,MINORITY_INTEREST:10,PARENT_NETPROFIT:90,OPERATE_INCOME:100})),c:[{REPORT_DATE:'2026-09-30',NETCASH_OPERATE:100}]};}
test('三类标签、阈值边界和重点线索优先',()=>{
  const d=fixture();assert.equal(classify(d).label,'推荐');
  d.i[0].MINORITY_INTEREST=15;assert.equal(classify(d).level,1);
  d.i[0].MINORITY_INTEREST=30;assert.equal(classify(d).label,'保留意见');
  d.i[0].MINORITY_INTEREST=31;assert.equal(classify(d).label,'不推荐');
  d.i[0].MINORITY_INTEREST=10;d.c[0].NETCASH_OPERATE=72;assert.equal(classify(d).level,1);
  d.c[0].NETCASH_OPERATE=71;assert.equal(classify(d).level,2);
  d.c[0].NETCASH_OPERATE=-1;assert.equal(classify(d).level,3);
});
test('数据缺失和金融企业保留意见，已知重点线索不被缺失项掩盖',()=>{
  const d=fixture();d.c=[];assert.equal(classify(d).level,2);assert.ok(classify(d).missing.length);
  d.i[0].MINORITY_INTEREST=40;assert.equal(classify(d).level,3);
  const f=fixture();f.financial=true;assert.equal(classify(f).level,2);
  assert.equal(classify({}).level,2);
  f.i[0].PARENT_NETPROFIT=-1;assert.match(classify(f).missing.join('；'),/归母利润不为正/);
});
test('季度不用于经营占款增速，年报线索和来源日期明确',()=>{
  const d=fixture();d.b[0].ACCOUNTS_RECE=1000;assert.equal(classify(d).level,1);
  d.b[1].ACCOUNTS_RECE=20;const r=classify(d);assert.equal(r.level,2);assert.equal(r.period,'2026-09-30');assert.equal(r.workingPeriod,'2025-12-31');assert.match(r.reasons.join('；'),/2025 年报应收/);
});
test('重复公告选新版，缺失短债不按零处理，旧缓存直接可分类',()=>{
  const d=fixture();d.b[0].SHORT_LOAN=null;assert.equal(classify(d).level,2);
  const newer={...d.i[0],NOTICE_DATE:'2026-11-01',MINORITY_INTEREST:40};d.i.push(newer);assert.equal(classify(d).level,3);
});
module.exports={fixture};
