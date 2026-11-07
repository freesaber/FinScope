'use strict';
let historyDrag=null,historyMutation=false,historyItems=[];
function historyMessage(message,error=false){$('status').textContent=message;$('status').classList.toggle('err',error);}
function resetHistoryDrag(){historyDrag=null;document.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(el=>el.classList.remove('dragging','drop-before','drop-after'));}
async function moveHistoryCard(code,target,after){
  if(historyMutation||$('search').disabled)return;
  historyMutation=true;
  try{await window.finscope.moveHistory(code,target,after);await showHistory();historyMessage('卡片顺序已保存。');$('history').querySelector(`[data-drag="${code}"]`)?.focus({preventScroll:true});}
  catch(error){historyMessage('排序失败：'+error.message,true);}
  finally{historyMutation=false;resetHistoryDrag();}
}
function bindHistoryControls(list){
  historyItems=list;
  $('history').querySelectorAll('[data-remove]').forEach(button=>button.onclick=async()=>{
    if(historyMutation||$('search').disabled)return;
    const code=button.dataset.remove;historyMutation=true;button.disabled=true;
    try{await window.finscope.removeHistory(code);if(raw?.stock.code===code)clearResults();await showHistory();historyMessage('已删除查询记录及本地缓存。重新查询可再次添加。');}
    catch(error){button.disabled=false;historyMessage('删除失败：'+error.message,true);}
    finally{historyMutation=false;}
  });
  $('history').querySelectorAll('[data-drag]').forEach(handle=>{
    handle.onclick=event=>event.preventDefault();
    handle.ondragstart=event=>{
      if(historyMutation||$('search').disabled){event.preventDefault();return;}
      const card=handle.closest('.history-card');historyDrag={code:card.dataset.record,level:card.dataset.level};
      event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',historyDrag.code);event.dataTransfer.setDragImage(card,15,15);
      card.classList.add('dragging');
    };
    handle.ondragend=resetHistoryDrag;
    handle.onkeydown=event=>{
      if(!['ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      const card=handle.closest('.history-card'),items=historyItems.filter(item=>String(item.classification.level)===card.dataset.level),index=items.findIndex(item=>item.code===card.dataset.record),down=event.key==='ArrowDown',target=items[index+(down?1:-1)];
      if(target)moveHistoryCard(card.dataset.record,target.code,down);
    };
  });
  $('history').querySelectorAll('.history-card').forEach(card=>{
    card.ondragover=event=>{
      if(!historyDrag||historyDrag.level!==card.dataset.level||historyDrag.code===card.dataset.record)return;
      event.preventDefault();event.dataTransfer.dropEffect='move';
      document.querySelectorAll('.drop-before,.drop-after').forEach(el=>el.classList.remove('drop-before','drop-after'));
      card.classList.add(event.clientY>card.getBoundingClientRect().top+card.offsetHeight/2?'drop-after':'drop-before');
      const region=card.closest('.history-items'),bounds=region.getBoundingClientRect();
      if(event.clientY>bounds.bottom-35)region.scrollTop+=10;
      if(event.clientY<bounds.top+35)region.scrollTop-=10;
    };
    card.ondragleave=event=>{if(!card.contains(event.relatedTarget))card.classList.remove('drop-before','drop-after');};
    card.ondrop=event=>{
      if(!historyDrag||historyDrag.level!==card.dataset.level)return;
      event.preventDefault();const code=historyDrag.code,target=card.dataset.record,after=event.clientY>card.getBoundingClientRect().top+card.offsetHeight/2;
      resetHistoryDrag();if(code!==target)moveHistoryCard(code,target,after);
    };
  });
}
