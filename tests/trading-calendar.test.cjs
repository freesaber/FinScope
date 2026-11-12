const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {tradingState,parseAnnualCalendar,BUNDLED}=require('../electron/trading-calendar.cjs');
const {createPriceMonitor}=require('../electron/price-monitor.cjs');
const at=value=>Date.parse(value+'+08:00');
test('北京时间交易时段、午休和收盘边界',()=>{
  for(const time of ['09:30:00','11:29:59','13:00:00','14:59:59'])assert.equal(tradingState(at('2026-11-12T'+time)).isOpen,true,time);
  for(const time of ['09:29:59','11:30:00','12:00:00','15:00:00','21:00:00'])assert.equal(tradingState(at('2026-11-12T'+time)).isOpen,false,time);
  assert.equal(tradingState(at('2026-11-12T12:00:00')).nextOpen,new Date(at('2026-11-12T13:00:00')).toISOString());
});
test('交易所节假日、调休周末和未知年度不按工作日误判',()=>{
  assert.equal(tradingState(at('2026-02-23T10:00:00')).reason,'节假日休市');
  assert.equal(tradingState(at('2026-02-24T10:00:00')).isOpen,true);
  assert.equal(tradingState(at('2026-10-10T10:00:00')).reason,'周末休市');
  assert.equal(tradingState(at('2026-09-30T16:00:00')).nextOpen,new Date(at('2026-10-08T09:30:00')).toISOString());
  assert.equal(tradingState(at('2027-01-04T10:00:00')).reason,'交易日历待确认');
});
test('年度网页须完整解析，拒绝只有局部节日的公告',()=>{
  const html='<h3>2026年休市安排</h3>元旦 '+BUNDLED[2026].map(([a,b])=>`${Number(a.slice(0,2))}月${Number(a.slice(3))}日（星期一）至${Number(b.slice(0,2))}月${Number(b.slice(3))}日（星期二）休市。`).join('');
  assert.deepEqual(parseAnnualCalendar(html),{year:2026,ranges:BUNDLED[2026]});
  assert.throws(()=>parseAnnualCalendar('2026年休市安排 元旦 1月1日至1月3日休市'),/不完整/);
});
async function harness(t,start){
  let clock=at(start),calls=0,id=0;
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'finscope-hours-')),timers=new Map();
  const options={root,now:()=>clock,listStocks:async()=>[{code:'600100'}],quotePrice:async()=>{calls++;return {price:10};},schedule:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},cancel:key=>timers.delete(key)};
  const monitor=createPriceMonitor(options);
  async function settled(){for(let i=0;i<200;i++){const s=await monitor.getState();if(!s.running&&timers.size)return s;await new Promise(r=>setTimeout(r,2));}throw Error('未完成调度');}
  t.after(async()=>{monitor.dispose();await fs.rm(root,{recursive:true,force:true});});
  return {monitor,options,root,timers,settled,calls:()=>calls,next:async()=>{const [key,timer]=timers.entries().next().value;timers.delete(key);clock+=timer.delay;timer.fn();return settled();}};
}
test('周末开启只拉一次，休市日唤醒不拉行情，周一开盘恢复每60秒',async t=>{
  const h=await harness(t,'2026-11-14T10:00:00');await h.monitor.setEnabled(true);await h.settled();
  assert.equal(h.calls(),1);await h.next();assert.equal(h.calls(),1);
  const monday=await h.next();assert.equal(monday.trading.isOpen,true);assert.equal(h.calls(),2);
  assert.equal([...h.timers.values()][0].delay,60000);
  await h.next();assert.equal(h.calls(),3);
});
test('午休暂停，不在11:30继续拉取，13:00恢复',async t=>{
  const h=await harness(t,'2026-11-12T11:29:30');await h.monitor.setEnabled(true);await h.settled();
  assert.equal([...h.timers.values()][0].delay,30000);
  await h.next();assert.equal(h.calls(),1);assert.equal([...h.timers.values()][0].delay,90*60000);
  await h.next();assert.equal(h.calls(),2);
});
test('重启恢复监控开关，休市启动只更新一次，退出不覆盖开关',async t=>{
  const h=await harness(t,'2026-11-14T10:00:00');await h.monitor.setEnabled(true);await h.settled();h.monitor.dispose();
  const restarted=createPriceMonitor(h.options);t.after(()=>restarted.dispose());
  assert.equal((await restarted.getState()).enabled,true);
  const before=h.calls();await restarted.start();
  for(let i=0;i<100&&(await restarted.getState()).running;i++)await new Promise(r=>setTimeout(r,2));
  assert.equal(h.calls(),before+1);assert.equal((await restarted.getState()).trading.isOpen,false);
  await restarted.resume();assert.equal(h.calls(),before+1);
  await restarted.setEnabled(false);
  const another=createPriceMonitor(h.options);assert.equal((await another.getState()).enabled,false);another.dispose();
});
