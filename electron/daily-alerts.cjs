'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {priceSignal}=require('./price-monitor.cjs');
const dayKey=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
function createDailyAlerts({root,listStocks,notify,canNotify=()=>true,now=Date.now,onError=()=>{}}){
  const file=path.join(root,'price-alert-days.json');
  let loaded,ledger={},latest=null,draining=false,disposed=false;
  async function ready(){
    if(!loaded)loaded=(async()=>{try{ledger=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}})();
    await loaded;
  }
  async function drain(){
    if(draining||disposed)return;
    draining=true;
    try{
      await ready();
      while(!disposed&&latest?.enabled&&canNotify()){
        const day=dayKey(now()),stocks=await listStocks();
        if(!latest?.enabled||disposed)return;
        const allowed=new Map(stocks.map(stock=>[stock.code,stock.name]));
        const target=latest.targets.find(target=>{
          const quote=latest.prices[target.code];
          return allowed.has(target.code)&&ledger[target.code]!==day&&!quote?.error&&priceSignal(quote?.price,target);
        });
        if(!target)return;
        const quote=latest.prices[target.code],signal=priceSignal(quote.price,target);
        // 买、卖共用当天额度；先落盘，避免重复轮询或重启重复弹出。
        const next=Object.fromEntries(Object.entries(ledger).filter(([,date])=>date===day));next[target.code]=day;
        await fs.mkdir(root,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(next),'utf8');await fs.rename(file+'.tmp',file);ledger=next;
        if(disposed||!latest?.enabled)return;
        const currentTarget=latest.targets.find(item=>item.code===target.code),current=latest.prices[target.code];
        if(!current||current.error||priceSignal(current.price,currentTarget)!==signal)continue;
        await notify({code:target.code,name:allowed.get(target.code),signal,price:current.price,target:signal==='buy'?currentTarget.buy:currentTarget.sell,quotedAt:current.quotedAt,source:current.source,day});
      }
    }catch(error){onError(error);}
    finally{draining=false;}
  }
  return {update:state=>{latest=state;return drain();},retry:()=>drain(),dispose:()=>{disposed=true;latest=null;},idle:async()=>{while(draining)await new Promise(resolve=>setTimeout(resolve,1));}};
}
module.exports={createDailyAlerts,dayKey};
