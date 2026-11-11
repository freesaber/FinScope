const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createPriceMonitor,priceSignal,normalizeTargets,INTERVAL}=require('../electron/price-monitor.cjs');
async function until(monitor,predicate){
  for(let i=0;i<200;i++){
    const state=await monitor.getState();if(predicate(state))return state;
    await new Promise(resolve=>setTimeout(resolve,2));
  }
  throw Error('监控状态未达到预期');
}
async function fixture(t,quotePrice){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'finscope-monitor-'));
  const stocks=[{code:'600100'},{code:'600101'},{code:'600102'},{code:'600103'}];
  const timers=new Map();let id=0;
  const monitor=createPriceMonitor({root,listStocks:async()=>stocks,quotePrice,schedule:(fn,delay)=>{assert.ok(delay<=INTERVAL&&delay>=1000);timers.set(++id,fn);return id;},cancel:key=>timers.delete(key)});
  t.after(async()=>{monitor.dispose();await until(monitor,state=>!state.running);await fs.rm(root,{recursive:true,force:true});});
  return {root,stocks,timers,monitor,next:()=>{const [key,fn]=timers.entries().next().value;timers.delete(key);fn();}};
}
test('目标价边界包含等号，缺价格不触发，阻止冲突目标及无目标勾选',()=>{
  const target={enabled:true,buy:10,sell:20};
  assert.equal(priceSignal(10,target),'buy');assert.equal(priceSignal(20,target),'sell');
  assert.equal(priceSignal(15,target),null);assert.equal(priceSignal(null,target),null);
  assert.equal(priceSignal(0,target),null);assert.equal(priceSignal(9,{...target,enabled:false}),null);
  const allowed=new Set(['600100']);
  assert.throws(()=>normalizeTargets([{code:'600100',buy:20,sell:10,enabled:true}],allowed),/低于/);
  assert.throws(()=>normalizeTargets([{code:'600100',buy:null,sell:null,enabled:true}],allowed),/至少/);
  assert.throws(()=>normalizeTargets([{code:'600100',buy:-1,sell:null,enabled:true}],allowed),/大于/);
});
test('开启立即查价，按60秒轮询，离开目标区间与报价失败都清除提醒',async t=>{
  let price=9,error=false,calls=0;
  const f=await fixture(t,async()=>{calls++;if(error)throw Error('offline');return {price,source:'测试'};});
  await f.monitor.save([{code:'600100',buy:10,sell:20,enabled:true},{code:'600101',buy:10,sell:null,enabled:false}]);
  await f.monitor.setEnabled(true);
  let state=await until(f.monitor,s=>!s.running&&s.lastCheckedAt);
  assert.equal(calls,1);assert.equal(state.prices['600100'].signal,'buy');assert.equal(f.timers.size,1);
  price=15;f.next();state=await until(f.monitor,s=>!s.running);assert.equal(state.prices['600100'].signal,null);
  price=20;f.next();state=await until(f.monitor,s=>!s.running);assert.equal(state.prices['600100'].signal,'sell');
  error=true;f.next();state=await until(f.monitor,s=>!s.running);assert.equal(state.prices['600100'].price,null);assert.equal(state.prices['600100'].signal,null);assert.ok(state.prices['600100'].error);
  await f.monitor.setEnabled(false);assert.equal(f.timers.size,0);
});
test('只保存目标配置，重启默认关闭，移除公司同步清理目标',async t=>{
  const f=await fixture(t,async()=>({price:5}));
  await f.monitor.save([{code:'600100',buy:10,sell:null,enabled:true}]);
  const reopened=createPriceMonitor({root:f.root,listStocks:async()=>f.stocks,quotePrice:async()=>{throw Error('不应自动联网');}});
  const state=await reopened.getState();assert.equal(state.enabled,false);assert.equal(state.targets[0].buy,10);
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(path.join(f.root,'price-targets.json'),'utf8'))),['targets']);
  await f.monitor.remove('600100');assert.equal((await f.monitor.getState()).targets.length,0);
  await assert.rejects(()=>f.monitor.setEnabled(true),/先设置/);reopened.dispose();
});
test('最大并发3只，关闭时丢弃正在请求的响应，不留下动画或下一轮',async t=>{
  const pending=[];let active=0,max=0,calls=0;
  const f=await fixture(t,async()=>{calls++;active++;max=Math.max(max,active);await new Promise(resolve=>pending.push(resolve));active--;return {price:1};});
  await f.monitor.save(f.stocks.map(item=>({code:item.code,buy:10,sell:null,enabled:true})));
  await f.monitor.setEnabled(true);
  for(let i=0;i<100&&pending.length<3;i++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal(pending.length,3);await f.monitor.setEnabled(false);pending.forEach(resolve=>resolve());
  const state=await until(f.monitor,s=>!s.running);
  assert.equal(max,3);assert.equal(calls,3);assert.deepEqual(state.prices,{});assert.equal(f.timers.size,0);
});
