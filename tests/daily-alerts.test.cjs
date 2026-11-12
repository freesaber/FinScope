const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createDailyAlerts,dayKey}=require('../electron/daily-alerts.cjs');
async function rootFor(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'finscope-alerts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
const state=(price=9)=>({enabled:true,targets:[{code:'600100',enabled:true,buy:10,sell:20}],prices:{'600100':{price,error:null}}});
test('同一股票买卖共用每天一次额度，重启后不重复，北京时间跨日重新允许',async t=>{
  const root=await rootFor(t),alerts=[];let clock=Date.UTC(2026,10,12,15,59,59);
  const options={root,now:()=>clock,listStocks:async()=>[{code:'600100',name:'测试公司'}],notify:async data=>alerts.push(data)};
  const service=createDailyAlerts(options);
  await service.update(state());await service.update(state());await service.update(state(30));
  assert.equal(alerts.length,1);assert.equal(alerts[0].signal,'buy');assert.equal(alerts[0].day,'2026-11-12');
  service.dispose();const restarted=createDailyAlerts(options);
  await restarted.update(state(30));assert.equal(alerts.length,1);
  clock=Date.UTC(2026,10,12,16,0,0);await restarted.update(state(30));
  assert.equal(alerts.length,2);assert.equal(alerts[1].signal,'sell');assert.equal(alerts[1].day,'2026-11-13');
  assert.equal(dayKey(clock),'2026-11-13');restarted.dispose();
});
test('未勾选、未触价、无报价、停止监控或已删除股票都不提醒',async t=>{
  const root=await rootFor(t),alerts=[];let stocks=[{code:'600100',name:'测试'}];
  const service=createDailyAlerts({root,listStocks:async()=>stocks,notify:async data=>alerts.push(data)});
  await service.update({...state(),enabled:false});await service.update(state(15));
  await service.update({...state(),targets:[{code:'600100',enabled:false,buy:10,sell:20}]});
  await service.update({...state(),prices:{'600100':{price:null,error:'offline'}}});
  stocks=[];await service.update(state());assert.equal(alerts.length,0);service.dispose();
});
test('弹窗容量不足时不消耗额度，有空间后提醒一次',async t=>{
  const root=await rootFor(t),alerts=[];let space=false;
  const service=createDailyAlerts({root,listStocks:async()=>[{code:'600100',name:'测试'}],canNotify:()=>space,notify:async data=>alerts.push(data)});
  await service.update(state());assert.equal(alerts.length,0);
  space=true;await service.retry();await service.retry();assert.equal(alerts.length,1);service.dispose();
});
