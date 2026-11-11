'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {stockCode}=require('./data.cjs');
const INTERVAL=60_000;

function normalizeTargets(targets,allowed){
  if(!Array.isArray(targets)||targets.length>2000)throw Error('目标价配置无效');
  const seen=new Set();
  return targets.map(target=>{
    const code=stockCode(target.code).code;
    if(!allowed.has(code)||seen.has(code))throw Error('自选名单已变更，请重新打开设置');
    seen.add(code);
    const price=(value,label)=>{
      if(value===null||value===undefined||value==='')return null;
      if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e9)throw Error(`${code} 的${label}须为大于 0 的价格`);
      const rounded=Math.round(value*100)/100;
      if(rounded<=0)throw Error(`${code} 的${label}至少为 0.01 元`);
      return rounded;
    };
    const buy=price(target.buy,'买入价'),sell=price(target.sell,'卖出价');
    if(buy!==null&&sell!==null&&buy>=sell)throw Error(`${code} 的买入价须低于卖出价`);
    if(typeof target.enabled!=='boolean')throw Error('监控勾选状态无效');
    if(target.enabled&&buy===null&&sell===null)throw Error(`${code} 请至少填写一个目标价`);
    return {code,buy,sell,enabled:target.enabled};
  });
}
function priceSignal(price,target){
  if(!Number.isFinite(price)||price<=0||!target?.enabled)return null;
  if(target.buy!==null&&price<=target.buy)return 'buy';
  if(target.sell!==null&&price>=target.sell)return 'sell';
  return null;
}
function createPriceMonitor({root,listStocks,quotePrice,onChange=()=>{},now=Date.now,schedule=setTimeout,cancel=clearTimeout}){
  const file=path.join(root,'price-targets.json');
  let targets=[],loaded,enabled=false,running=false,timer=null,generation=0,prices={},lastCheckedAt=null,nextCheckAt=null,revision=0,cycleStartedAt=0;
  let pending=Promise.resolve();
  const serialized=fn=>{const task=pending.then(fn);pending=task.catch(()=>{});return task;};
  const snapshot=()=>({revision,enabled,running,intervalSeconds:INTERVAL/1000,targets:structuredClone(targets),prices:structuredClone(prices),lastCheckedAt,nextCheckAt});
  const publish=()=>{revision++;onChange(snapshot());};
  async function ready(){
    if(!loaded)loaded=(async()=>{
      try{
        const saved=JSON.parse(await fs.readFile(file,'utf8'));
        const allowed=new Set((await listStocks()).map(item=>item.code));
        targets=normalizeTargets(saved.targets.filter(target=>allowed.has(target.code)),allowed);
      }catch(error){if(error.code!=='ENOENT')throw Error('目标价配置读取失败：'+error.message);}
    })();
    await loaded;
  }
  function clearTimer(){if(timer!==null)cancel(timer);timer=null;nextCheckAt=null;}
  function stop(){enabled=false;generation++;clearTimer();for(const item of Object.values(prices))item.signal=null;publish();}
  function plan(){
    if(!enabled||timer!==null)return;
    const delay=Math.max(1000,INTERVAL-(now()-cycleStartedAt));
    nextCheckAt=new Date(now()+delay).toISOString();
    timer=schedule(()=>{timer=null;nextCheckAt=null;void tick();},delay);
    timer?.unref?.();
  }
  async function tick(){
    if(!enabled||running)return;
    clearTimer();running=true;cycleStartedAt=now();
    const version=generation;
    publish();
    try{
      const current=new Set((await listStocks()).map(item=>item.code));
      const queue=targets.filter(target=>target.enabled&&current.has(target.code));
      if(!queue.length){stop();return;}
      let index=0;
      await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
        while(enabled&&version===generation&&index<queue.length){
          const target=queue[index++];
          try{
            const quote=await quotePrice(target.code);
            if(!enabled||version!==generation)return;
            if(!(quote.price>0)||!Number.isFinite(quote.price))throw Error('没有有效报价');
            prices[target.code]={price:quote.price,signal:priceSignal(quote.price,target),source:quote.source,quotedAt:quote.quotedAt||null,checkedAt:new Date(now()).toISOString(),error:null};
          }catch{
            if(!enabled||version!==generation)return;
            prices[target.code]={price:null,signal:null,checkedAt:new Date(now()).toISOString(),error:'本次报价失败，下轮自动重试'};
          }
          publish();
        }
      }));
      if(version===generation)lastCheckedAt=new Date(now()).toISOString();
    }catch{
      if(version===generation)for(const target of targets.filter(target=>target.enabled))prices[target.code]={price:null,signal:null,error:'本轮查询失败，下轮自动重试'};
    }finally{
      running=false;
      // 设置或开关在请求期间变化时，旧响应不再生效，新一轮立即开始。
      if(enabled&&version!==generation){void tick();}
      else plan();
      publish();
    }
  }
  async function persist(){
    await fs.mkdir(root,{recursive:true});
    await fs.writeFile(file+'.tmp',JSON.stringify({targets}),'utf8');
    await fs.rename(file+'.tmp',file);
  }
  return {
    getState:async()=>{await ready();return snapshot();},
    save:input=>serialized(async()=>{
      await ready();
      const allowed=new Set((await listStocks()).map(item=>item.code));
      const next=normalizeTargets(input,allowed),previous=targets;
      targets=next;
      try{await persist();}catch(error){targets=previous;throw error;}
      generation++;prices={};clearTimer();
      if(!targets.some(target=>target.enabled))enabled=false;
      publish();if(enabled)void tick();return snapshot();
    }),
    setEnabled:value=>serialized(async()=>{
      await ready();
      if(typeof value!=='boolean')throw Error('监控开关状态无效');
      if(!value){stop();return snapshot();}
      const allowed=new Set((await listStocks()).map(item=>item.code));
      if(!targets.some(target=>target.enabled&&allowed.has(target.code)))throw Error('请先设置目标价并勾选要监控的公司');
      if(!enabled){enabled=true;generation++;prices={};publish();void tick();}
      return snapshot();
    }),
    remove:code=>serialized(async()=>{
      await ready();targets=targets.filter(target=>target.code!==code);delete prices[code];
      generation++;clearTimer();await persist();
      if(!targets.some(target=>target.enabled))enabled=false;
      publish();if(enabled)void tick();
    }),
    dispose:()=>{stop();}
  };
}
module.exports={createPriceMonitor,normalizeTargets,priceSignal,INTERVAL};
