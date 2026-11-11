'use strict';
let monitorState={enabled:false,running:false,targets:[],prices:{}},monitorBusy=false,settingsRows=[];
function monitorRowState(code){
  const target=monitorState.targets.find(target=>target.code===code),quote=monitorState.prices[code];
  if(!target?.enabled)return {text:'未监控',tone:''};
  if(!monitorState.enabled)return {text:'已配置 · 未开启',tone:''};
  if(quote?.error)return {text:'报价失败 · 将重试',tone:'error'};
  if(quote?.signal==='buy')return {text:'已到买入价',tone:'buy'};
  if(quote?.signal==='sell')return {text:'已到卖出价',tone:'sell'};
  return {text:quote?'监控中':'等待报价',tone:'active'};
}
function paintMonitorCards(){
  const configured=new Map(monitorState.targets.map(target=>[target.code,target]));
  document.querySelectorAll('.tile-cell').forEach(cell=>{
    const tile=cell.querySelector('[data-tile]');if(!tile)return;
    const code=tile.dataset.tile,target=configured.get(code),quote=monitorState.prices[code];
    const signal=monitorState.enabled&&target?.enabled&&!quote?.error?quote?.signal:null;
    cell.classList.toggle('price-buy',signal==='buy');cell.classList.toggle('price-sell',signal==='sell');
    let badge=cell.querySelector('.price-alert');
    if(signal){
      if(!badge){badge=document.createElement('span');badge.className='price-alert';cell.append(badge);}
      badge.textContent=signal==='buy'?'买':'卖';
      badge.setAttribute('aria-label',signal==='buy'?'当前价已达到买入目标':'当前价已达到卖出目标');
      badge.title=`最近价 ${quote.price.toFixed(2)} 元 · ${quote.source||'行情'}${quote.quotedAt?' · '+new Date(quote.quotedAt).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):''}`;
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
  $('monitor-toggle-label').textContent=state.enabled?`监控中 · ${count} 只`:'监控关闭';
  const checked=state.lastCheckedAt?new Date(state.lastCheckedAt).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):'尚未完成';
  button.title=state.enabled?`每 60 秒更新 · 上轮完成 ${checked}${state.running?' · 正在刷新报价':''}`:'开启后立即查询，之后每 60 秒更新价格';
  paintMonitorCards();
  if($('target-dialog').open)paintTargetQuotes();
}
function paintTargetQuotes(){
  $('target-rows').querySelectorAll('[data-target-row]').forEach(row=>{
    const code=row.dataset.targetRow,quote=monitorState.prices[code],state=monitorRowState(code);
    const current=quote?.price??(raw?.stock.code===code?raw.market?.price:null);
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
    if(!$('target-dialog').open)$('target-dialog').showModal();
  }catch(error){historyMessage('目标价设置打开失败：'+error.message,true);}
  finally{monitorBusy=false;$('target-settings').disabled=false;}
}
$('target-settings').onclick=openTargetSettings;
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
  if(!monitorState.enabled&&!monitorState.targets.some(target=>target.enabled)){await openTargetSettings();return;}
  monitorBusy=true;$('monitor-toggle').disabled=true;
  try{applyMonitorState(await window.finscope.toggleMonitor(!monitorState.enabled));}
  catch(error){historyMessage('监控切换失败：'+error.message,true);}
  finally{monitorBusy=false;$('monitor-toggle').disabled=false;}
};
const unsubscribeMonitor=window.finscope.onMonitorState(applyMonitorState);
window.addEventListener('beforeunload',()=>unsubscribeMonitor(),{once:true});
window.finscope.monitorState().then(applyMonitorState).catch(error=>historyMessage('目标价配置读取失败：'+error.message,true));
