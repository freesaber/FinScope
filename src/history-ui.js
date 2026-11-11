'use strict';
let historyMutation=false,historyItems=[],historySelection='',historyQuery='',historyFilter=0,historyDrag=null,historyFetch=null;
const mapLabels={1:'未触发提示',2:'需要关注',3:'重点核查'};
function historyMessage(message,error=false){$('status').textContent=message;$('status').classList.toggle('err',error);}
function selectHistoryCompany(code){
  historySelection=code;
  $('history').querySelectorAll('[data-tile]').forEach(tile=>{
    const selected=tile.dataset.tile===code;
    tile.classList.toggle('selected',selected);
    tile.setAttribute('aria-pressed',String(selected));
  });
  drawHistoryDetail();
}
function historyVisible(){
  const query=historyQuery.trim().toLowerCase();
  return historyItems.filter(item=>(!historyFilter||item.classification.level===historyFilter)&&(!query||`${item.name} ${item.code}`.toLowerCase().includes(query)));
}
function renderHistory(list){
  historyItems=[...list];
  if(!list.length){$('history').innerHTML='';historySelection='';return;}
  if(!list.some(item=>item.code===historySelection))historySelection='';
  $('history').innerHTML=`<div class="history-header"><div><div class="map-eyebrow">WATCHLIST / FINANCIAL SIGNALS</div><h3>自选财务地图 <span>${list.length} 家</span></h3><p>点击方块查看线索，拖动调整同类公司的顺序，自动保存。</p></div><label class="map-find"><span>⌕</span><input id="history-find" type="search" placeholder="定位名称 / 代码" aria-label="定位公司名称或代码" value="${E(historyQuery)}"></label></div><div class="map-toolbar"><div class="map-filters" role="group" aria-label="筛选财务信号">${[0,1,2,3].map(level=>`<button data-map-filter="${level}" aria-pressed="${historyFilter===level}">${level?mapLabels[level]:'全部'} <span>${level?list.filter(item=>item.classification.level===level).length:list.length}</span></button>`).join('')}</div><span class="map-key">拖动排序 · Alt + 方向键也可调整</span></div><div id="history-detail" class="map-detail" aria-live="polite"></div><div id="history-map" class="stock-map"></div><div class="map-footnote">地图展示上次联网查询摘要，点击公司会重新获取最新财报；报告期可能不同；黄色也可能表示资料不足或指标不适用。位置与大小不代表收益、估值或排名，筛选结果不构成买卖建议。</div>`;
  $('history-find').oninput=event=>{historyQuery=event.target.value;drawHistoryMap();};
  $('history').querySelectorAll('[data-map-filter]').forEach(button=>button.onclick=()=>{
    historyFilter=Number(button.dataset.mapFilter);
    $('history').querySelectorAll('[data-map-filter]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.mapFilter)===historyFilter)));
    drawHistoryMap();
  });
  drawHistoryMap();
}
function drawHistoryMap(){
  const visible=historyVisible(),levels=historyFilter?[historyFilter]:[1,2,3];
  $('history-map').innerHTML=visible.length?levels.map(level=>{
    const items=visible.filter(item=>item.classification.level===level);
    return `<section class="stock-zone zone-${level}" aria-label="${mapLabels[level]}"><div class="zone-heading"><span class="zone-dot"></span><strong>${mapLabels[level]}</strong><span>${items.length}</span></div><p class="zone-description">${({1:'四组指标可评估，未触发提示线',2:'有关注线索 / 资料不足或不适用',3:'已触发需优先核查的重点线索'})[level]}</p><div class="tile-grid">${items.map(item=>{
      const result=item.classification,count=result.reasons.length;
      const hint=count?`${count} 条线索`:result.missing.length?'资料待核查':'未见提示';
      return `<div class="tile-cell"><button class="stock-tile ${historySelection===item.code?'selected':''}" data-tile="${E(item.code)}" draggable="true" aria-pressed="${historySelection===item.code}" aria-label="${E(item.name)} ${E(item.code)}，${mapLabels[level]}，${hint}" title="${E(item.name)} · ${E([...result.reasons,...result.missing].join('；')||'未触发当前筛选规则')}"><span class="tile-grip" aria-hidden="true">⠿</span><b>${E(item.name)}</b><span>${E(item.code)}</span><small>${hint}</small></button><button class="tile-remove" data-remove-tile="${E(item.code)}" draggable="false" aria-label="删除 ${E(item.name)}" title="删除 ${E(item.name)}">×</button></div>`;
    }).join('')||'<span class="zone-empty">暂无公司</span>'}</div></section>`;
  }).join(''):'<div class="map-no-match">没有匹配的公司，试试其他名称、代码或分类。</div>';
  $('history-map').querySelectorAll('[data-tile]').forEach(button=>button.onclick=async()=>{
    if(historyDrag||historyMutation||$('search').disabled)return;
    selectHistoryCompany(button.dataset.tile);
    $('stock').value=historySelection;await search();
  });
  $('history-map').querySelectorAll('[data-remove-tile]').forEach(button=>{
    button.onclick=event=>{event.preventDefault();event.stopPropagation();removeHistoryCompany(button.dataset.removeTile,button);};
    button.ondragstart=event=>event.preventDefault();
  });
  bindTileDrag();
  drawHistoryDetail();
}
function drawHistoryDetail(){
  if(!$('history-detail'))return;
  const item=historyVisible().find(item=>item.code===historySelection);
  if(!item){$('history-detail').innerHTML='<div class="map-detail-hint"><span>◎</span> 点击任意方块，查看财务线索与操作</div>';return;}
  const result=item.classification,stamp=new Date(item.fetchedAt).toLocaleString('zh-CN',{hour12:false});
  const fetchState=historyFetch?.code===item.code?historyFetch:null;
  $('history-detail').innerHTML=`<div class="map-detail-main"><div class="map-detail-title"><strong>${E(item.name)}</strong><span class="code">${E(item.code)}</span><span class="map-result result-${result.level}">${mapLabels[result.level]}</span></div><div class="map-detail-reasons">${fetchState?.state==='loading'?'<p class="muted">最新线索将在查询完成后显示。</p>':fetchState?.state==='failed'?`<p class="red">本次联网获取失败，请重试：${E(fetchState.error)}</p>`:`${result.reasons.length?`<ul>${result.reasons.map(reason=>`<li>${E(reason)}</li>`).join('')}</ul>`:'<p>未触发当前筛选规则。</p>'}${result.missing.length?`<p class="map-missing">资料边界：${E(result.missing.join('；'))}</p>`:''}`}</div><small>${E(periodName(result.period))} · 上次查询 ${E(stamp)}</small></div><div class="map-actions"><button class="smallbtn map-open" id="history-open" title="使用默认浏览器打开东方财富行情页" aria-label="在东方财富查看 ${E(item.name)} 行情">东方财富 ↗</button><button class="smallbtn map-delete" id="history-remove" aria-label="移除 ${E(item.name)}">移除</button></div>`;
  $('history-open').onclick=async()=>{
    const button=$('history-open');
    if(button.disabled)return;
    button.disabled=true;
    try{await window.finscope.openQuote(item.code);}
    catch(error){historyMessage('打开东方财富失败：'+error.message,true);}
    finally{button.disabled=false;}
  };
  $('history-remove').disabled=historyMutation;
  $('history-remove').onclick=()=>removeHistoryCompany(item.code,$('history-remove'));
}
async function removeHistoryCompany(code,button){
  if(historyMutation||$('search').disabled)return;
  const item=historyItems.find(item=>item.code===code);
  if(!item)return;
  const visible=historyVisible(),index=visible.findIndex(item=>item.code===code);
  const nextCode=(visible[index+1]||visible[index-1])?.code;
  historyMutation=true;button.disabled=true;
  try{
    await window.finscope.removeHistory(code);
    if(raw?.stock.code===code)clearResults();
    if(historySelection===code)historySelection='';
    if(historyFetch?.code===code)historyFetch=null;
    await showHistory();
    historyMessage(`已移除 ${item.name}及其查询记录。重新查询可再次添加。`);
    const next=nextCode?$('history').querySelector(`[data-tile="${nextCode}"]`):null;
    (next||$('history-find')||$('stock')).focus({preventScroll:true});
  }catch(error){button.disabled=false;historyMessage('移除失败：'+error.message,true);}
  finally{historyMutation=false;if($('history-remove'))$('history-remove').disabled=false;}
}

function resetTileDrag(){
  historyDrag=null;
  $('history-map')?.querySelectorAll('.tile-dragging,.drop-before,.drop-after').forEach(el=>el.classList.remove('tile-dragging','drop-before','drop-after'));
}
async function moveHistoryTile(code,target,after){
  if(historyMutation||$('search').disabled||code===target)return;
  historyMutation=true;
  try{
    await window.finscope.moveHistory(code,target,after);
    await showHistory();
    $('history-map').querySelector(`[data-tile="${code}"]`)?.focus({preventScroll:true});
    historyMessage('方块顺序已保存。');
  }catch(error){historyMessage('排序失败：'+error.message,true);}
  finally{historyMutation=false;resetTileDrag();}
}
function bindTileDrag(){
  $('history-map').querySelectorAll('[data-tile]').forEach(tile=>{
    tile.ondragstart=event=>{
      if(historyMutation||$('search').disabled){event.preventDefault();return;}
      historyDrag={code:tile.dataset.tile,level:historyItems.find(item=>item.code===tile.dataset.tile).classification.level};
      event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',historyDrag.code);
      tile.classList.add('tile-dragging');
    };
    tile.ondragend=resetTileDrag;
    tile.ondragover=event=>{
      const level=historyItems.find(item=>item.code===tile.dataset.tile).classification.level;
      if(!historyDrag||historyDrag.code===tile.dataset.tile||historyDrag.level!==level)return;
      event.preventDefault();event.dataTransfer.dropEffect='move';
      $('history-map').querySelectorAll('.drop-before,.drop-after').forEach(el=>el.classList.remove('drop-before','drop-after'));
      tile.classList.add(event.clientX>tile.getBoundingClientRect().left+tile.offsetWidth/2?'drop-after':'drop-before');
      if(event.clientY>window.innerHeight-60)window.scrollBy(0,16);
      else if(event.clientY<60)window.scrollBy(0,-16);
    };
    tile.ondragleave=event=>{if(!tile.contains(event.relatedTarget))tile.classList.remove('drop-before','drop-after');};
    tile.ondrop=event=>{
      if(!historyDrag)return;
      const source=historyDrag,level=historyItems.find(item=>item.code===tile.dataset.tile).classification.level;
      if(source.level!==level)return;
      event.preventDefault();
      const after=event.clientX>tile.getBoundingClientRect().left+tile.offsetWidth/2;
      resetTileDrag();moveHistoryTile(source.code,tile.dataset.tile,after);
    };
    tile.onkeydown=event=>{
      if(!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      const item=historyItems.find(item=>item.code===tile.dataset.tile);
      const items=historyVisible().filter(x=>x.classification.level===item.classification.level);
      const after=['ArrowRight','ArrowDown'].includes(event.key),index=items.findIndex(x=>x.code===item.code),target=items[index+(after?1:-1)];
      if(target)moveHistoryTile(item.code,target.code,after);
    };
  });
}
