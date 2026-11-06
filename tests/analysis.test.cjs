const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('src/fields.js','utf8')+'\n'+fs.readFileSync('src/insights.js','utf8')+'\n'+fs.readFileSync('src/renderer.js','utf8').split('document.querySelectorAll(\'.tab\').forEach(el=>el.onclick=')[0];
function run(code){return vm.runInNewContext(source+'\n'+code);}
test('参考分区边界与白话解读准确，倍数和缺失值清楚显示',()=>{
  assert.equal(run('times(4.18)'), '4.18 倍');
  assert.equal(run('metricAssessment("minority",1.5).label'),'未触发提示线');
  assert.equal(run('metricAssessment("minority",3).label'),'偏高');
  assert.equal(run('metricAssessment("minority",4.18).label'),'明显偏高');
  assert.equal(run('metricAssessment("cash",0.8).label'),'尚未覆盖利润');
  assert.equal(run('metricAssessment("cash",1).label'),'现金金额已覆盖');
  assert.match(run('metricAssessment("cash",-2).text'),/净流出/);
  assert.match(run('metricAssessment("debt",15.12).text'),/每 1 元选定短债对应 15.12 元/);
  assert.equal(run('metricAssessment("debt",null).label'),'暂不可判断');
});
test('图表缺失值不填零，季报独立，负值坐标有限',()=>{
  const chart=run(`annual=[{date:'2025-12-31'},{date:'2024-12-31'},{date:'2023-12-31'}];latest={date:'2026-09-30'};
    trendChart('测试',[{name:'数据',value:r=>({'2023-12-31':2,'2024-12-31':null,'2025-12-31':-2,'2026-09-30':4})[r.date]}],{refs:[1]})`);
  assert.equal((chart.match(/<circle /g)||[]).length,3);
  assert.equal((chart.match(/stroke-width="2.5"/g)||[]).length,0);
  assert.doesNotMatch(chart,/NaN|Infinity/);
  assert.match(chart,/季报，单独展示/);
  assert.match(run(`annual=[{date:'2025-12-31'}];trendChart('无数据',[{name:'数据',value:()=>null}])`),/暂无可绘制/);
});
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
