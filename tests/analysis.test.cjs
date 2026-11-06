const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('src/renderer.js','utf8').split('document.querySelectorAll(\'.tab\').forEach(el=>el.onclick=')[0];
function run(code){return vm.runInNewContext(source+'\n'+code);}
test('缺失和非法数值不作为零，负利润不触发现金比值',()=>{
  assert.equal(run("number('  ')"),null);
  assert.equal(run('number(false)'),null);
  assert.equal(run('number(0)'),0);
  assert.equal(run('minority({b:{TOTAL_EQUITY:100},i:{NETPROFIT:20}}).ratio'),null);
  assert.equal(run('cash({i:{PARENT_NETPROFIT:-1},c:{NETCASH_OPERATE:20}}).ratio'),null);
  assert.equal(run('debt({b:{MONETARYFUNDS:100,SHORT_LOAN:0,NONCURRENT_LIAB_1YEAR:0}}).coverage'),null);
});
test('偏离倍数公式与营收优先使用营业收入',()=>{
  assert.ok(Math.abs(run('minority({b:{TOTAL_EQUITY:100,MINORITY_EQUITY:10},i:{NETPROFIT:100,MINORITY_NETPROFIT:30}}).ratio')-3)<1e-10);
  assert.equal(run('val({i:{OPERATE_INCOME:10,TOTAL_OPERATE_INCOME:20}},"revenue")'),10);
  assert.equal(run('val({i:{MINORITY_INTEREST:2249717236.09}},"minorityProfit")'),2249717236.09);
});
test('最新三年年报与当年季报单列，修订报表取最新公告',()=>{
  const result=JSON.parse(run(`
    const dates=['2026-09-30','2025-12-31','2024-12-31','2023-12-31','2022-12-31'];
    raw={b:dates.map(REPORT_DATE=>({REPORT_DATE})),i:dates.map(REPORT_DATE=>({REPORT_DATE})),c:[]};merge();
    JSON.stringify({annual:annual.map(x=>x.date),latest:latest.date})`));
  assert.deepEqual(result.annual,['2025-12-31','2024-12-31','2023-12-31']);
  assert.equal(result.latest,'2026-09-30');
  assert.equal(run("buildMap([{REPORT_DATE:'2025-12-31',NOTICE_DATE:'2026-01-01',v:1},{REPORT_DATE:'2025-12-31',NOTICE_DATE:'2026-02-01',v:2}]).get('2025-12-31').v"),2);
});
