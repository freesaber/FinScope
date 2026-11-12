'use strict';
let monitorState={enabled:false,running:false,targets:[],prices:{}},monitorBusy=false,settingsRows=[],targetScrollPosition=null;
const manualCardQuotes=new Map();
function rememberCardQuote(data){
  if(data?.market?.price>0)manualCardQuotes.set(data.stock.code,data.market);
}
function getCardQuote(code){
  const manual=manualCardQuotes.get(code)||(raw?.stock.code===code?raw.market:null);
  const polled=monitorState.prices[code];
  if(!polled)return manual;
  if(manual&&Date.parse(manual.fetchedAt)>Date.parse(polled.checkedAt||0))return manual;
  return polled;
}
function cardPriceSignal(code){
  const target=monitorState.targets.find(target=>target.code===code),quote=getCardQuote(code);
  if(!monitorState.enabled||!target?.enabled||quote?.error||!(quote?.price>0))return null;
  if(target.buy!==null&&quote.price<=target.buy)return 'buy';
  if(target.sell!==null&&quote.price>=target.sell)return 'sell';
  return null;
}
function monitorRowState(code){
  const target=monitorState.targets.find(target=>target.code===code),quote=getCardQuote(code);
  if(!target?.enabled)return {text:'未监控',tone:''};
  if(!monitorState.enabled)return {text:'已配置 · 未开启',tone:''};
  if(quote?.error)return {text:'报价失败 · 将重试',tone:'error'};
  if(cardPriceSignal(code)==='buy')return {text:'已到买入价',tone:'buy'};
  if(cardPriceSignal(code)==='sell')return {text:'已到卖出价',tone:'sell'};
  return {text:quote?(monitorState.trading?.isOpen===false?'休市 · 已更新':'监控中'):'等待报价',tone:'active'};
}
function paintMonitorCards(){
  const configured=new Map(monitorState.targets.map(target=>[target.code,target]));
  document.querySelectorAll('.tile-cell').forEach(cell=>{
    const tile=cell.querySelector('[data-tile]');if(!tile)return;
    const code=tile.dataset.tile,target=configured.get(code),quote=monitorState.prices[code];
    const displayed=getCardQuote(code),price=tile.querySelector('.quote-price'),change=tile.querySelector('.quote-change');
    if(price&&change){
      price.textContent=displayed?.price>0?displayed.price.toFixed(2):'—';
      const percent=displayed?.changePercent;
      change.textContent=Number.isFinite(percent)?`${percent>0?'+':''}${percent.toFixed(2)}%`:'—';
      change.classList.toggle('quote-up',percent>0);change.classList.toggle('quote-down',percent<0);
      const time=displayed?.quotedAt||displayed?.checkedAt||displayed?.fetchedAt;
      tile.querySelector('.tile-quote').title=displayed?.error?displayed.error:displayed?`${displayed.source||'行情'}${time?' · '+new Date(time).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):''}${!monitorState.enabled?' · 监控关闭，报价不自动刷新':''}`:'开启监控后获取报价，交易时段每 60 秒更新';
    }
    const signal=cardPriceSignal(code);
    cell.classList.toggle('price-buy',signal==='buy');cell.classList.toggle('price-sell',signal==='sell');
    let badge=cell.querySelector('.price-alert');
    if(signal){
      if(!badge){badge=document.createElement('span');badge.className='price-alert';cell.append(badge);}
      badge.textContent=signal==='buy'?'买':'卖';
      badge.setAttribute('aria-label',signal==='buy'?'当前价已达到买入目标':'当前价已达到卖出目标');
      badge.title=`最近价 ${displayed.price.toFixed(2)} 元 · ${displayed.source||'行情'}${displayed.quotedAt?' · '+new Date(displayed.quotedAt).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):''}`;
    }else badge?.remove();
    let dot=cell.querySelector('.monitor-dot');
    if(monitorState.enabled&&target?.enabled){
      if(!dot){dot=document.createElement('span');dot.className='monitor-dot';cell.append(dot);}
      dot.classList.toggle('quote-error',Boolean(quote?.error));dot.title=monitorRowState(code).text;
    }else dot?.remove();
  });
}
function applyMonitorState(state){
  if((state.revision??0)<(monitorState.revision??0))return;
  monitorState=state;
  const button=$('monitor-toggle'),count=state.targets.filter(target=>target.enabled).length;
  button.setAttribute('aria-checked',String(state.enabled));
  button.setAttribute('aria-label',state.enabled?'关闭价格监控':'开启价格监控');
  $('monitor-toggle-label').textContent=state.enabled?(state.trading?.isOpen===false?(state.running?'休市更新中':'休市暂停'):'监控中'):'监控关闭';
  const checked=state.lastCheckedAt?new Date(state.lastCheckedAt).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):'尚未完成';
  const next=state.trading?.nextOpen?new Date(state.trading.nextOpen).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):'交易日历确认后';
  button.title=state.enabled&&state.trading?.isOpen===false?`${state.trading.reason} · ${state.running?'正在更新一次报价':'已更新一次，不轮询'} · 下次恢复 ${next}`:state.enabled?`全部自选股每 60 秒更新 · ${count} 只设置触价提醒 · 上轮完成 ${checked}${state.running?' · 正在刷新报价':''}`:'开启后更新一次；交易时段每 60 秒刷新，休市暂停；重启恢复开关状态';
  paintMonitorCards();
  if($('target-dialog').open)paintTargetQuotes();
}
function paintTargetQuotes(){
  $('target-rows').querySelectorAll('[data-target-row]').forEach(row=>{
    const code=row.dataset.targetRow,quote=monitorState.prices[code],state=monitorRowState(code);
    const current=getCardQuote(code)?.price;
    row.querySelector('.target-current').textContent=current>0?current.toFixed(2):'—';
    const status=row.querySelector('.target-row-status');status.textContent=state.text;status.className='target-row-status '+state.tone;
  });
}
function updateTargetCount(){
  const rows=$('target-rows').querySelectorAll('[data-target-row]');
  const selected=[...rows].filter(row=>row.querySelector('[data-target-enabled]').checked).length;
  $('target-summary-count').textContent=`全部 ${rows.length} 家 · 已勾选 ${selected} 家`;
}
async function openTargetSettings(){
  if(monitorBusy)return;
  monitorBusy=true;$('target-settings').disabled=true;
  try{
    const [state,items]=await Promise.all([window.finscope.monitorState(),window.finscope.history()]);
    applyMonitorState(state);settingsRows=items;
    const targets=new Map(state.targets.map(target=>[target.code,target]));
    $('target-error').textContent='';
    $('target-rows').innerHTML=items.map(item=>{
      const target=targets.get(item.code)||{buy:null,sell:null,enabled:false};
      return `<tr data-target-row="${E(item.code)}"><td><input type="checkbox" data-target-enabled ${target.enabled?'checked':''} aria-label="监控 ${E(item.name)}"></td><td><strong>${E(item.name)}</strong><small>${E(item.code)}</small></td><td class="target-current">—</td><td><div class="target-price-input"><input type="number" data-target-buy min="0.01" max="1000000000" step="0.01" placeholder="不设" value="${target.buy??''}" aria-label="${E(item.name)} 买入价"><span>元</span></div></td><td><div class="target-price-input"><input type="number" data-target-sell min="0.01" max="1000000000" step="0.01" placeholder="不设" value="${target.sell??''}" aria-label="${E(item.name)} 卖出价"><span>元</span></div></td><td><span class="target-row-status"></span></td></tr>`;
    }).join('');
    $('target-empty').classList.toggle('hidden',items.length>0);
    $('target-rows').querySelectorAll('[data-target-row]').forEach(row=>{
      row.querySelector('[data-target-enabled]').onchange=updateTargetCount;
      row.querySelectorAll('[type=number]').forEach(input=>input.oninput=()=>{
        row.querySelector('[data-target-enabled]').checked=Boolean(row.querySelector('[data-target-buy]').value||row.querySelector('[data-target-sell]').value);
        $('target-error').textContent='';updateTargetCount();
      });
    });
    paintTargetQuotes();updateTargetCount();
    if(!$('target-dialog').open){
      targetScrollPosition={left:window.scrollX,top:window.scrollY};
      document.documentElement.classList.add('target-modal-open');
      try{$('target-dialog').showModal();}
      catch(error){document.documentElement.classList.remove('target-modal-open');targetScrollPosition=null;throw error;}
    }
  }catch(error){historyMessage('目标价设置打开失败：'+error.message,true);}
  finally{monitorBusy=false;$('target-settings').disabled=false;}
}
$('target-settings').onclick=openTargetSettings;
window.addEventListener('scroll',()=>{
  if($('target-dialog').open&&targetScrollPosition&&(window.scrollY!==targetScrollPosition.top||window.scrollX!==targetScrollPosition.left))window.scrollTo({...targetScrollPosition,behavior:'instant'});
},{passive:true});
$('target-dialog').addEventListener('close',()=>{
  document.documentElement.classList.remove('target-modal-open');
  const position=targetScrollPosition;targetScrollPosition=null;
  if(position)window.scrollTo({...position,behavior:'instant'});
});
for(const id of ['target-close','target-cancel'])$(id).onclick=()=>{if(!$('target-save').disabled)$('target-dialog').close();};
$('target-dialog').addEventListener('cancel',event=>{if($('target-save').disabled)event.preventDefault();});
$('target-dialog').onclick=event=>{if(event.target===$('target-dialog')&&!$('target-save').disabled){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}};
$('target-form').onsubmit=async event=>{
  event.preventDefault();if($('target-save').disabled)return;
  const targets=[...$('target-rows').querySelectorAll('[data-target-row]')].map(row=>{
    const value=selector=>{const n=row.querySelector(selector).value;return n===''?null:Number(n);};
    return {code:row.dataset.targetRow,buy:value('[data-target-buy]'),sell:value('[data-target-sell]'),enabled:row.querySelector('[data-target-enabled]').checked};
  });
  const invalid=targets.find(target=>target.buy!==null&&target.sell!==null&&target.buy>=target.sell||target.enabled&&target.buy===null&&target.sell===null);
  if(invalid){
    const item=settingsRows.find(item=>item.code===invalid.code);
    $('target-error').textContent=`${item?.name||invalid.code}：${invalid.buy===null&&invalid.sell===null?'至少填写一个目标价':'买入价须低于卖出价'}`;
    $('target-rows').querySelector(`[data-target-row="${invalid.code}"] input[type=number]`)?.focus();return;
  }
  $('target-save').disabled=true;$('target-save').textContent='保存中…';
  try{
    applyMonitorState(await window.finscope.saveMonitor(targets));
    $('target-dialog').close();historyMessage(monitorState.enabled?'目标价已保存，监控已按新配置更新。':'目标价已保存，点击右上角开关即可开始监控。');
  }catch(error){$('target-error').textContent='保存失败：'+error.message;}
  finally{$('target-save').disabled=false;$('target-save').textContent='保存设置';}
};
$('monitor-toggle').onclick=async()=>{
  if(monitorBusy)return;
  monitorBusy=true;$('monitor-toggle').disabled=true;
  try{applyMonitorState(await window.finscope.toggleMonitor(!monitorState.enabled));}
  catch(error){historyMessage('监控切换失败：'+error.message,true);}
  finally{monitorBusy=false;$('monitor-toggle').disabled=false;}
};
const unsubscribeMonitor=window.finscope.onMonitorState(applyMonitorState);
window.addEventListener('beforeunload',()=>unsubscribeMonitor(),{once:true});
window.finscope.monitorState().then(applyMonitorState).catch(error=>historyMessage('目标价配置读取失败：'+error.message,true));
