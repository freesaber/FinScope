'use strict';
document.getElementById('close').onclick=()=>window.priceToast.close();
window.priceToast.onData(data=>{
  const buy=data.signal==='buy';document.body.classList.toggle('sell',!buy);
  document.getElementById('badge').textContent=buy?'买':'卖';
  document.getElementById('name').textContent=data.name||data.code;
  document.getElementById('condition').textContent=buy?'已达到设定买入价':'已达到设定卖出价';
  document.getElementById('price').textContent=data.price.toFixed(2)+' 元';
  document.getElementById('target').textContent=data.target.toFixed(2)+' 元';
});
