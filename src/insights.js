'use strict';

// 提示线沿用产品的研究规则；1 倍是等量关系，不是行业合格标准。
const METRICS = {
  minority: {title:'少数股东利润偏离', unit:'倍', refs:[1.5,3], reference:'≤1.5 倍：未触发 · >1.5–3 倍：偏高 · >3 倍：明显偏高', note:'1 倍表示利润份额与权益份额相等。1.5 / 3 倍为本工具经验提示线，并非行业标准。'},
  cash: {title:'利润现金兑现', unit:'倍', refs:[0.8,1], reference:'<0.8 倍：偏弱 · 0.8–<1 倍：尚未覆盖 · ≥1 倍：金额覆盖', note:'0.8 倍是经验提示线，1 倍表示金额相等。合并现金流与归母利润口径不同，高值也需核查来源。'},
  debt: {title:'现金覆盖短债', unit:'倍', refs:[1], reference:'<1 倍：金额不足 · ≥1 倍：金额覆盖', note:'1 倍是等量参照，非偿债安全线；未剔除受限资金，也未包含全部短期偿债义务。'}
};
function metricValue(key,r){
  if(!r)return null;
  if(key==='minority')return minority(r).ratio;
  if(key==='cash')return cash(r).ratio;
  return raw?.financial?null:debt(r).coverage;
}
function metricAssessment(key,n){
  if(n===null||!Number.isFinite(n))return {tone:'neutral',label:'暂不可判断',text:'数据缺失、分母为零或口径不适用；不按零值处理。'};
  if(key==='minority')return {tone:n>3?'bad':n>1.5?'watch':'neutral',label:n>3?'明显偏高':n>1.5?'偏高':'未触发提示线',text:`利润份额是权益份额的 ${fmt(n)} 倍，${n>1.5?'需核查高盈利子公司和利润分配安排。':'仍应结合子公司结构核查。'}`};
  if(key==='cash')return {tone:n<0?'bad':n<1?'watch':'good',label:n<0?'经营现金净流出':n<0.8?'现金兑现偏弱':n<1?'尚未覆盖利润':'现金金额已覆盖',text:n<0?`每 1 元归母利润对应 ${fmt(Math.abs(n))} 元经营现金净流出。`:`每 1 元归母利润对应 ${fmt(n)} 元经营现金净流入。`};
  return {tone:n<1?'watch':'good',label:n<1?'现金金额不足':'现金金额已覆盖',text:`每 1 元选定短债对应 ${fmt(n)} 元账面货币资金。${n>=1?'仍需核查资金受限情况。':''}`};
}
function metricGuide(key,n){
  const rule=METRICS[key],a=metricAssessment(key,n);
  return `<div class="metric-guide"><span class="signal ${a.tone}">${a.label}</span><p class="metric-meaning">${a.text}</p><div class="reference"><b>怎么看这个数</b><p>${rule.reference}</p><small>${rule.note}</small></div></div>`;
}
function chartNumber(n,unit){return !Number.isFinite(n)?'—':fmt(n,Math.abs(n)>=100?0:2)+unit;}

/** 缺失值断线；季度为独立点，不连接到完整年度。所有图均从零开始覆盖正负值。 */
function trendChart(title,series,{unit='倍',refs=[],quarter=true,bars=false,subtitle=''}={}){
  const periods=[...annual].reverse().concat(quarter&&latest?[latest]:[]);
  const values=series.map(s=>periods.map(s.value));
  const valid=values.flat().filter(n=>n!==null&&Number.isFinite(n));
  if(!valid.length)return `<div class="chart-card"><h3>${E(title)}</h3><div class="chart-empty">暂无可绘制的数据，不将缺失值画成 0。</div></div>`;
  const W=600,H=260,left=58,right=22,top=24,bottom=52;
  const minimum=Math.min(0,...valid,...refs),maximum=Math.max(0,...valid,...refs);
  const span=maximum-minimum||1,lo=minimum<0?minimum-span*.12:0,hi=maximum+span*.18;
  const y=n=>top+(hi-n)/(hi-lo)*(H-top-bottom);
  const x=i=>left+(i+.5)*(W-left-right)/Math.max(periods.length,1);
  const colors=['#236c60','#4879c7','#be842d'];
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${E(title)}，单位${E(unit)}"><title>${E(title)}。${E(subtitle)}</title>`;
  for(let i=0;i<=4;i++){const n=lo+(hi-lo)*i/4;svg+=`<line x1="${left}" y1="${y(n)}" x2="${W-right}" y2="${y(n)}" class="chart-grid"/><text x="${left-8}" y="${y(n)+4}" text-anchor="end" class="axis">${fmt(n,Math.abs(n)>=100?0:1)}</text>`;}
  if(minimum<0)svg+=`<line x1="${left}" y1="${y(0)}" x2="${W-right}" y2="${y(0)}" stroke="#88999a"/>`;
  refs.forEach(n=>{svg+=`<line x1="${left}" y1="${y(n)}" x2="${W-right}" y2="${y(n)}" class="reference-line"><title>参照线 ${n}${unit}</title></line>`;});
  if(quarter&&latest){const q=periods.length-1;svg+=`<rect x="${x(q)-(W-left-right)/periods.length*.45}" y="${top}" width="${(W-left-right)/periods.length*.9}" height="${H-top-bottom}" fill="#eaf0f6" opacity=".55"/>`;}
  values.forEach((nums,s)=>{
    const color=colors[s%colors.length];
    nums.forEach((n,i)=>{
      if(n===null||!Number.isFinite(n))return;
      const tooltip=`${periodName(periods[i].date)} · ${series[s].name} ${chartNumber(n,unit)}`;
      if(bars){const width=Math.min(26,(W-left-right)/periods.length/(series.length+2));svg+=`<rect tabindex="0" aria-label="${E(tooltip)}" x="${x(i)+(s-series.length/2)*width}" y="${Math.min(y(n),y(0))}" width="${width-3}" height="${Math.max(1,Math.abs(y(n)-y(0)))}" rx="2" fill="${color}"><title>${E(tooltip)}</title></rect>`;}
      else{
        const prev=nums[i-1];
        if(i>0&&prev!==null&&Number.isFinite(prev)&&periods[i].date.endsWith('-12-31'))svg+=`<line x1="${x(i-1)}" y1="${y(prev)}" x2="${x(i)}" y2="${y(n)}" stroke="${color}" stroke-width="2.5"/>`;
        svg+=`<circle tabindex="0" aria-label="${E(tooltip)}" cx="${x(i)}" cy="${y(n)}" r="5" fill="${color}" stroke="white" stroke-width="2"><title>${E(tooltip)}</title></circle>`;
        if(series.length===1)svg+=`<text x="${x(i)}" y="${y(n)-12}" text-anchor="middle" class="point-label">${chartNumber(n,unit)}</text>`;
      }
    });
  });
  periods.forEach((r,i)=>{svg+=`<text x="${x(i)}" y="${H-27}" text-anchor="middle" class="axis ${r.date===selectedPeriod?'selected-axis':''}">${r.date.slice(0,4)}${r.date.endsWith('-12-31')?'年报':({'03-31':'一季','06-30':'中报','09-30':'三季'}[r.date.slice(5)]||'季报')}</text>`;});
  svg+='</svg>';
  return `<div class="chart-card"><div class="chart-heading"><h3>${E(title)}</h3><span>单位：${unit}</span></div>${subtitle?`<p class="micro">${E(subtitle)}</p>`:''}${svg}<div class="chart-legend">${series.map((s,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${E(s.name)}</span>`).join('')}${refs.length?`<span>┄ 参照线 ${refs.join(' / ')} ${unit}</span>`:''}</div>${quarter&&latest?'<p class="micro">浅色区域为最新季报，单独展示，不与年报连线比较。</p>':''}</div>`;
}
function ratioChart(key){const m=METRICS[key];return trendChart(m.title,[{name:m.title,value:r=>metricValue(key,r)}],{refs:m.refs,subtitle:key==='minority'?'1.5 / 3 倍为经验提示线':key==='cash'?'0.8 倍为经验提示线；1 倍为金额相等':'1 倍为现金与选定短债金额相等'});}
function insertCharts(id,html){const first=$(id+'-view').firstElementChild;if(first)first.insertAdjacentHTML('afterend',html);}
function enhanceCharts(){
  insertCharts('overview',`<div class="chart-section"><div class="subhead"><div><h2>把当前值放回历史里看</h2><p>完整年度看趋势；最新季报单列。悬停或聚焦数据点查看数值。</p></div></div><div class="trend-grid">${ratioChart('minority')}${ratioChart('cash')}${raw.financial?'':ratioChart('debt')}</div></div>`);
  insertCharts('minority',ratioChart('minority'));
  insertCharts('cash',trendChart('利润与现金金额对照',[{name:'归母净利润',value:r=>{const v=cash(r).p;return v===null?null:v/1e8;}},{name:'经营现金净额',value:r=>{const v=cash(r).o;return v===null?null:v/1e8;}}],{unit:'亿元',quarter:false,bars:true,subtitle:'同一完整年度并排比较；两者合并范围存在差异。'})+ratioChart('cash'));
  if(!raw.financial){
    const growth=k=>r=>{const prev=annual.find(p=>Number(p.date.slice(0,4))===Number(r.date.slice(0,4))-1);const v=prev?change(val(r,k),val(prev,k)):null;return v===null?null:v*100;};
    insertCharts('working',trendChart('收入、应收与存货增速',[{name:'营业收入',value:growth('revenue')},{name:'应收账款',value:growth('receivable')},{name:'存货',value:growth('inventory')}],{unit:'%',quarter:false,bars:true,subtitle:'应收或存货增速超过收入增速 20 个百分点，是本工具经验提示线。缺少上年数据或基数不为正时不计算。'}));
    insertCharts('debt',ratioChart('debt')+trendChart('账面现金与选定短债',[{name:'货币资金',value:r=>{const v=debt(r).m;return v===null?null:v/1e8;}},{name:'选定短债',value:r=>{const v=debt(r).sum;return v===null?null:v/1e8;}}],{unit:'亿元',quarter:false,bars:true}));
  }
}
