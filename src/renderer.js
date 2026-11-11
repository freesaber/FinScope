
'use strict';
const $=id=>document.getElementById(id), E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let raw=null, reports=[], latest=null, annual=[], chosen={}, selectedPeriod='', activeTab='overview';

function number(v){if(v===null||v===undefined||v==='--'||(typeof v==='string'&&!v.trim())||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function field(r,k){const d=F[k],source=r?.[d.sheet];if(!source)return null;const keys=Object.keys(source);return (chosen[k]&&keys.includes(chosen[k])?chosen[k]:d.names.find(n=>keys.includes(n)))||null}
function val(r,k){const key=field(r,k);return key?number(r[F[k].sheet]?.[key]):null}
function div(a,b){return a!==null&&b!==null&&b!==0? a/b :null}
function fmt(n,d=2){return n===null||!Number.isFinite(n)?'—':n.toFixed(d)}
function billion(n){return n===null?'—':fmt(n/1e8)+'亿'}
function pct(n){return n===null?'—':fmt(n*100)+'%'}
function times(n){return n===null?'—':fmt(n)+' 倍'}
function change(n,base){return base>0&&n!==null?div(n-base,base):null}
function periodName(d){return !d?'—':d.slice(0,4)+({'12-31':' 年报','09-30':' 三季报','06-30':' 中报','03-31':' 一季报'}[d.slice(5)]||' 报告')}
function codeOf(str){const match=String(str).trim().toUpperCase().match(/^(\d{6})(?:\.(SH|SZ|BJ))?$/);if(!match)return null;return {code:match[1],secu:match[1]+'.'+(match[2]||(/^[56]/.test(match[1])?'SH':/^(?:[48]|92)/.test(match[1])?'BJ':'SZ'))}}
function buildMap(rows){const m=new Map();for(const r of rows||[]){let date=String(r.REPORT_DATE||r.REPORTDATE||'').slice(0,10).replaceAll('/','-');if(!/^\d{4}-\d\d-\d\d$/.test(date))continue;let old=m.get(date);if(!old||String(r.NOTICE_DATE||r.UPDATE_DATE||'')>String(old.NOTICE_DATE||old.UPDATE_DATE||''))m.set(date,r)}return m}
function merge(){const bm=buildMap(raw.b),im=buildMap(raw.i),cm=buildMap(raw.c),dates=[...new Set([...bm.keys(),...im.keys(),...cm.keys()])].sort().reverse();reports=dates.filter(d=>bm.has(d)&&im.has(d)).map(d=>({date:d,b:bm.get(d),i:im.get(d),c:cm.get(d)||null}));annual=reports.filter(r=>r.date.endsWith('-12-31')).slice(0,3);latest=reports.find(r=>!r.date.endsWith('-12-31')&&Number(r.date.slice(0,4))>Number(annual[0]?.date.slice(0,4)||0))||null;selectedPeriod=latest?.date||annual[0]?.date||''}
function minority(r){const e=val(r,'minorityEquity'),t=val(r,'equity'),mp=val(r,'minorityProfit'),p=val(r,'profit');const er=e!==null&&e>=0&&t>0?div(e,t):null,pr=mp!==null&&mp>=0&&p>0?div(mp,p):null;return {er,pr,ratio:er>0&&pr!==null?pr/er:null}}
function minorityUnavailable(r){
  const keys=['minorityEquity','equity','minorityProfit','profit'];
  const missing=keys.filter(k=>val(r,k)===null);
  if(missing.length)return {label:'数据缺失',text:`缺少：${missing.map(k=>F[k].label).join('、')}。已有金额仍展示；不参与偏离倍数评级。`};
  const mp=val(r,'minorityProfit'),p=val(r,'profit');
  const reasons=[];
  if(p<0)reasons.push(mp>0?'合并亏损，少数股东应占盈利':mp<0?'合并亏损，少数股东应占亏损':'合并亏损，少数股东损益为零');
  else if(mp<0)reasons.push(p>0?'合并盈利，少数股东应占亏损':'少数股东应占亏损');
  if(p===0)reasons.push('合并净利润为零');
  if(val(r,'minorityEquity')<=0)reasons.push('少数股东权益不大于零');
  if(val(r,'equity')<=0)reasons.push('所有者权益合计不大于零');
  return {label:mp<0?'少数股东应占亏损':'偏离倍数不适用',text:`${reasons.join('；')}。保留原始损益金额，不参与偏离倍数评级。负值表示会计上归属于少数股东的亏损，不代表实际现金支付。`};
}
function minorityKpi(name,r){
  const m=minority(r);
  if(m.ratio!==null)return kpi(name,times(m.ratio),'利润份额 ÷ 权益份额');
  const a=minorityUnavailable(r);
  return kpi('少数股东损益',billion(val(r,'minorityProfit')),'原始损益金额 · 负值为应占亏损',`<div class="metric-guide"><span class="signal neutral">${E(a.label)}</span><p class="metric-meaning">${E(a.text)}</p></div>`);
}
function cash(r){const p=val(r,'parentProfit'),o=val(r,'ocf');return {o,p,ratio:p>0&&o!==null?o/p:null}}
function working(r){const ar=val(r,'receivable'),iv=val(r,'inventory'),rev=val(r,'revenue');return {ar,iv,rev,arRatio:rev>0&&ar!==null?ar/rev:null,invRatio:rev>0&&iv!==null?iv/rev:null}}
function debt(r){const m=val(r,'monetary'),s=val(r,'shortDebt'),due=val(r,'currentLongDebt');const sum=s!==null&&due!==null?s+due:null;return {m,s,due,sum,coverage:m!==null&&sum>0?m/sum:null}}
function currently(){return reports.find(r=>r.date===selectedPeriod)||latest||annual[0]||null}
function periodOptions(){return [...(latest?[latest]:[]),...annual].map(r=>`<option value="${r.date}" ${selectedPeriod===r.date?'selected':''}>${periodName(r.date)}</option>`).join('')}
function selectPeriod(){return `<select class="yearselect" data-period aria-label="报告期">${periodOptions()}</select>`}
function card(title,subtitle,content,extra=''){return `<div class="card"><div class="subhead"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${extra}</div>${content}</div>`}
function kpi(name,value,desc,guideOverride){const key=({'少数股东利润偏离':'minority','份额偏离倍数':'minority','利润现金兑现':'cash','现金兑现比':'cash','现金覆盖短债':'debt','现金覆盖倍数':'debt'})[name];const guide=guideOverride??(key?metricGuide(key,metricValue(key,currently())):'');return `<div class="kpi"><label>${name}</label><div class="value">${value}</div><small>${desc||' '}</small>${guide}</div>`}
function statusClass(s){return s==='bad'?'bad':s==='watch'?'warning':''}
function insight(title,detail,level=''){return `<div class="insight ${statusClass(level)}"><strong>${title}</strong><p>${detail}</p></div>`}
function table(head,rows){return `<div class="tablebox"><table><thead><tr>${head.map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<td>${i===0?`<b>${v}</b>`:v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function empty(reason){return `<div class="alert">${reason}。该项不作风险判断，请核对字段与财报原文。</div>`}
function dataNote(r){return `<div class="micro" style="margin-top:13px">${periodName(r.date)} · ${r.date.endsWith('-12-31')?'12个月累计利润/现金流，年末资产负债':'年初至报告期累计利润/现金流，期末资产负债'} · 原始金额按“元”读取</div>`}
function reportLabel(){return `<span class="chip">近3份年报 + 最新季报</span>`}
function overview(){if(!reports.length){$('overview-view').innerHTML=empty('没有找到完整的年报日期');return}const r=currently(),m=minority(r),c=cash(r),w=working(r),d=raw.financial?{coverage:null}:debt(r);let flags=[];if(m.ratio!==null&&m.ratio>1.5)flags.push({label:'少数股东利润归属偏高',level:m.ratio>3?'bad':'watch',why:`利润份额/权益份额 ${times(m.ratio)}，应检查子公司盈利集中度与少数股东分配安排。`,tab:'minority'});if(c.ratio!==null&&c.ratio<0.8)flags.push({label:'经营现金低于归母利润',level:c.ratio<0?'bad':'watch',why:`经营现金/归母净利润 ${fmt(c.ratio)}，需要追查回款、备货及应计项目。`,tab:'cash'});const prev=annual.find(x=>x.date!==r.date&&Number(x.date.slice(0,4))===Number(r.date.slice(0,4))-1);if(!raw.financial&&prev&&r.date.endsWith('-12-31')){const old=working(prev);const arGrowth=change(w.ar,old.ar),revGrowth=change(w.rev,old.rev),invGrowth=change(w.iv,old.iv);if(arGrowth!==null&&revGrowth!==null&&arGrowth-revGrowth>0.2)flags.push({label:'应收增长显著快于收入',level:'watch',why:`应收同比 ${pct(arGrowth)}，收入同比 ${pct(revGrowth)}。`,tab:'working'});if(invGrowth!==null&&revGrowth!==null&&invGrowth-revGrowth>0.2)flags.push({label:'存货增长显著快于收入',level:'watch',why:`存货同比 ${pct(invGrowth)}，收入同比 ${pct(revGrowth)}。`,tab:'working'})}if(!raw.financial&&d.coverage!==null&&d.coverage<1)flags.push({label:'货币资金对短期债务覆盖不足',level:'watch',why:`货币资金/所选短债 ${times(d.coverage)}，需看受限资金和债务结构。`,tab:'debt'});let summary=flags.length?`${flags.length} 项线索值得进一步核对`:([m.ratio,c.ratio,d.coverage].some(v=>v===null)?'可计算指标未触发初筛线索；部分指标不适用或缺失':'本期没有触发已启用的初筛线索');let out=`<div class="card"><div class="subhead"><div><div class="sectionlabel">RESEARCH BRIEF</div><h2>${summary}</h2><p>只标出需要查证的方向，不提供“安全/造假”的结论。</p></div>${selectPeriod()}</div><div class="kpis">${minorityKpi('少数股东利润偏离',r)}${kpi('利润现金兑现',c.ratio===null?'—':times(c.ratio),'经营现金 ÷ 归母净利润')}${kpi('现金覆盖短债',times(d.coverage),'货币资金 ÷ 选定短债')}</div>${dataNote(r)}</div>`;
out+=card('本期需要留意的地方','根据本期可计算指标自动生成；未触发并不表示没有风险。',flags.length?flags.map(f=>`<div class="insight ${statusClass(f.level)}"><strong>${f.label}</strong><p>${f.why}</p><button class="smallbtn" data-jump="${f.tab}">查看证据 →</button></div>`).join(''):insight('暂无触发的线索','请继续查看四个分析页的原始数据和历史变化；缺失数据不会被视为正常。'));
out+=card('三年趋势速览','仅完整年报之间直接比较；当年季报另列。',table(['报告期','少数股东损益','少数股东偏离','经营现金/归母净利','货币资金/选定短债'],[...annual].reverse().map(x=>[periodName(x.date),billion(val(x,'minorityProfit')),times(minority(x).ratio),times(cash(x).ratio),times(raw.financial?null:debt(x).coverage)])));$('overview-view').innerHTML=out}
function minorityPage(){const r=currently();if(!r)return;const m=minority(r);let review;if(m.ratio===null){const a=minorityUnavailable(r);review=insight(a.label,a.text);}else if(m.ratio>3)review=insight('利润归属与净资产份额差距很大','请先确认是否由少数股东持股的高盈利子公司驱动，再查重大子公司名单、股权协议、利润分配和回购安排；不能直接推定明股实债。','bad');else if(m.ratio>1.5)review=insight('少数股东利润份额高于权益份额','这可能是部分子公司盈利能力更高，也可能是权益结构或分配安排差异。优先看连续三年是否都存在。','watch');else review=insight('当前偏离倍数不高','这只能说明此筛查项未出现明显偏离，不表示不存在其他财务问题。');const metrics=[['少数股东权益',val(r,'minorityEquity')],['所有者权益合计',val(r,'equity')],['少数股东损益',val(r,'minorityProfit')],['合并净利润',val(r,'profit')]];let out=card('少数股东：谁真正分享了利润？','比起直接看“少数股东损益”金额，更值得看其利润份额是否长期大于权益份额。',`<div class="kpis">${kpi('权益份额',pct(m.er),'少数股东权益 / 总权益')}${kpi('利润份额',pct(m.pr),'少数股东损益 / 净利润')}${minorityKpi('份额偏离倍数',r)}</div>${review}${dataNote(r)}`,selectPeriod());
out+=card('历史趋势 · 完整年报','看看是偶发偏离，还是持续结构性现象。',table(['报告期','少数股东损益','权益份额','利润份额','偏离倍数'],[...annual].reverse().map(x=>{const v=minority(x);return [periodName(x.date),billion(val(x,'minorityProfit')),pct(v.er),pct(v.pr),times(v.ratio)]}).concat(latest?[[periodName(latest.date)+'*',billion(val(latest,'minorityProfit')),pct(minority(latest).er),pct(minority(latest).pr),times(minority(latest).ratio)]]:[]))+'<p class="micro">* 季报为年内累计利润，不参与完整年度趋势判断。</p>');
out+=`<div class="grid2">${card('公式为什么这样设计？','两个比例的比较，不是“少数股东收益率”。',`<div class="formula"><code>权益份额</code> = 少数股东权益 ÷ 所有者权益合计<br><code>利润份额</code> = 少数股东损益 ÷ 合并净利润<br><code>偏离倍数</code> = 利润份额 ÷ 权益份额</div><p class="micro">1.5 倍 / 3 倍是本工具沿用的经验提示阈值，并非会计或监管认定标准。少数股东损益＜0、合并净利润≤0或权益份额≤0时不使用这个倍数判断，改为展示损益金额。</p>`)}${card('先核查这三个问题','这是线索，不是结论。',`<div class="faq"><details open><summary>高利润子公司股权是不是较分散？</summary><p>高盈利子公司有更多非控股股东，本来就会拉高少数股东利润份额。</p></details><details><summary>少数股东是否有约定回购/保底收益？</summary><p>若要判断明股实债，应进一步查看融资协议、优先分配权、回购承诺与债务披露。</p></details><details><summary>连续三年是否偏高且逐年加重？</summary><p>持续趋势比某一个季度的数值更有研究价值。</p></details></div>` )}</div>`;
out+=card('本期原始数据','资产负债表与利润表的四个关键数，单位亿元。',table(['字段','金额'],metrics.map(v=>[v[0],billion(v[1])])));$('minority-view').innerHTML=out}
function cashPage(){const r=currently();if(!r)return;const c=cash(r);let finding=c.ratio===null?empty('归母净利润不大于零，或经营现金流字段缺失'):c.ratio<0?insight('有利润，但经营现金净流出','优先检查应收增长、营运资本变化和经营性支付。还要排除扩张期与行业季节性影响。','bad'):c.ratio<0.8?insight('利润兑现为现金的能力偏弱','这个口径比较粗略，不能只凭一期数据判断；连续三年偏弱更值得深入研究。','watch'):c.ratio<1?insight('经营现金尚未完全覆盖归母利润','高于0.8倍经验提示线，但仍低于1倍金额相等参照。应结合全年及历史趋势核查。','watch'):insight('本期经营现金覆盖归母利润','现金流较强是积极信号，但也可能受预收款或供应商付款节奏影响。');let rows=[...annual].reverse().map(x=>{const v=cash(x);return [periodName(x.date),billion(v.p),billion(v.o),times(v.ratio)]});if(latest)rows.push([periodName(latest.date)+'*',billion(cash(latest).p),billion(cash(latest).o),times(cash(latest).ratio)]);let out=card('利润到账了吗？','净利润可以先确认收入，现金不一定同步到账。',`<div class="kpis">${kpi('经营现金流净额',billion(c.o),'公司经营活动产生的现金')}${kpi('归母净利润',billion(c.p),'归属于母公司的利润')}${kpi('现金兑现比',times(c.ratio),'经营现金 / 归母净利润')}</div>${finding}${dataNote(r)}`,selectPeriod());out+=card('连续三年是否“赚利润不赚钱”？','应优先观察完整年度，季报现金流的季节性可能较大。',table(['报告期','归母净利润','经营现金','兑现比'],rows)+'<p class="micro">* 最新季报单列，不能将9个月金额与12个月金额直接比较。</p>');out+=`<div class="grid2">${card('怎么算？','可理解为利润的现金兑现程度。',`<div class="formula"><code>现金兑现比</code> = 经营活动现金流量净额 ÷ 归母净利润</div><p class="micro">经营现金是全集团合并口径，而归母净利润剔除了少数股东损益，因此这里是一个筛查代理指标，不是严格同口径的收益质量比率。可以同时结合合并净利润核对。</p>`)}${card('看到偏低，先查什么？','这比直接打分更实用。',`<div class="faq"><details open><summary>应收账款是不是涨得比收入快？</summary><p>可能反映销售回款滞后，跳转“经营占款”继续看。</p></details><details><summary>是否大幅增加存货？</summary><p>备货会占用现金，但需区分主动扩产与滞销积压。</p></details><details><summary>是否靠预收款改善现金流？</summary><p>经营现金强也可能来自提前收款，不代表所有当期收入已经兑现。</p></details></div>` )}</div>`;$('cash-view').innerHTML=out}
function workingPage(){if(raw?.financial){$('working-view').innerHTML=card('金融企业不适用此初筛','银行、证券、保险公司的经营资产结构不同。',empty('请直接核对金融行业财报附注，不套用工业企业应收与存货指标'));return;}const r=currently();if(!r)return;const w=working(r),prev=annual.find(x=>Number(x.date.slice(0,4))===Number(r.date.slice(0,4))-1&&r.date.endsWith('-12-31'));const w0=prev?working(prev):null;let rows=[...annual].reverse().map(x=>{const v=working(x);return [periodName(x.date),billion(v.rev),billion(v.ar),billion(v.iv),pct(v.arRatio)]});if(latest)rows.push([periodName(latest.date)+'*',billion(working(latest).rev),billion(working(latest).ar),billion(working(latest).iv),'不横比']);const ag=w0?change(w.ar,w0.ar):null,rg=w0?change(w.rev,w0.rev):null,ig=w0?change(w.iv,w0.iv):null;let comment=!r.date.endsWith('-12-31')?insight('季报中的收入是累计值，资产是期末值','本期只展示原始数，避免把期末应收直接除以9个月营收后与年报比。请切换完整年报看同比分化。'):ag!==null&&rg!==null&&ag-rg>0.2?insight('应收增长比收入快得多','关注客户信用政策、应收账龄、坏账准备和前五大客户变化。','watch'):insight('可先观察收入、应收与存货三条线','单一余额高低无法直接判定问题，主要看增长是否持续背离。');let out=card('增长是销售，还是占款？','这里不盲目强调周转率，只比较趋势与增长背离。',`<div class="kpis">${kpi('营业收入',billion(w.rev),'年初至报告期累计')}${kpi('应收账款',billion(w.ar),'报告期末余额')}${kpi('存货',billion(w.iv),'报告期末余额')}</div>${comment}${dataNote(r)}`,selectPeriod());if(prev)out+=card('与上年同期年报比较','增长差异比单独看应收金额更有解释力。',`<div class="kpis">${kpi('收入同比',pct(rg),'完整年度')}${kpi('应收同比',pct(ag),'期末对期末')}${kpi('存货同比',pct(ig),'期末对期末')}</div>`);out+=card('完整年报趋势','应收、存货是时点余额；营收为全年累计额。',table(['报告期','营业收入','应收账款','存货','应收/年收入'],rows)+'<p class="micro">* 季报不计算应收/收入比，避免期间长度导致的误读。</p>');out+=`<div class="grid2">${card('为什么看增长背离？','当营收增长没有转化为回款，资产负债表可能先暴露变化。',`<div class="formula"><code>应收增速</code> = 本年末应收 ÷ 上年末应收 − 1<br><code>收入增速</code> = 本年营收 ÷ 上年营收 − 1<br><code>存货增速</code> = 本年末存货 ÷ 上年末存货 − 1</div><p class="micro">本工具将增速差超过20个百分点仅作为研究提示，而不是行业通用警戒线。</p>`)}${card('别忽略这些“藏起来”的占款','这个模块不假装把所有应收都覆盖了。',`<p>一些行业大量使用应收票据、合同资产或应收款项融资。只看“应收账款”会漏掉这些项目；工程、地产、金融企业尤其需要行业定制。</p><p>出现异常时优先翻财报附注中的账龄、减值比例、存货跌价准备和销售回款条款。</p>` )}</div>`;$('working-view').innerHTML=out}
function debtPage(){if(raw?.financial){$('debt-view').innerHTML=card('金融企业不适用此初筛','存款与同业融资不能套用普通企业短债指标。',empty('请结合资本充足率、流动性覆盖率等行业指标研究'));return;}const r=currently();if(!r)return;const d=debt(r),assets=val(r,'assets'),liab=val(r,'liabilities'),lev=assets>0&&liab!==null?liab/assets:null;let finding=d.coverage===null?empty('短期债务字段缺失或本期选定短债为零'):d.coverage<1?insight('货币资金小于选定短期债务','属于需要核查的偿债缓冲信号，但企业可以续贷、发行债券或靠经营现金流偿付，不能据此判断即将违约。','watch'):insight('货币资金对选定短债覆盖较充足','仍需关注现金是否受限、短债披露是否完整和经营现金流变化。');let rows=[...annual].reverse().map(x=>{const v=debt(x);return [periodName(x.date),billion(v.m),billion(v.sum),times(v.coverage)]});if(latest)rows.push([periodName(latest.date)+'*',billion(debt(latest).m),billion(debt(latest).sum),times(debt(latest).coverage)]);let out=card('账上现金，能覆盖近债吗？','只做一个可核查的初筛，不把所有负债混成“有息债务”。',`<div class="kpis">${kpi('货币资金',billion(d.m),'可能存在受限现金')}${kpi('选定短债',billion(d.sum),'短期借款 + 一年内到期非流动负债')}${kpi('现金覆盖倍数',times(d.coverage),'货币资金 / 选定短债')}</div>${finding}${dataNote(r)}`,selectPeriod());out+=card('资产负债与短债趋势','不同企业融资结构差异很大，优先看近三年的变化。',table(['报告期','货币资金','选定短债','覆盖倍数'],rows)+`<div class="micro" style="margin-top:10px">本期资产负债率（简化）：${pct(lev)}。未把应付票据、租赁负债等自动纳入短债，可能低估真实短期偿债义务。</div>`);out+=`<div class="grid2">${card('为什么这样算？','不把高资产负债率直接等同于高偿债风险。',`<div class="formula"><code>选定短债</code> = 短期借款 + 一年内到期的非流动负债<br><code>覆盖倍数</code> = 货币资金 ÷ 选定短债</div><p class="micro">这是狭义、保守程度有限的初筛比值。受限资金、有息票据、永续债、银行授信等都可能改变实际判断。</p>`)}${card('真正值得查的债务信号','以下通常比一个负债率更有意义。',`<div class="faq"><details open><summary>货币资金多，但利息费用也很高？</summary><p>需要核查资金受限、存贷双高、银行存款真实性与利息收支匹配。</p></details><details><summary>短债比上一年快速增加？</summary><p>检查到期结构、抵押担保、债务续期与信用评级。</p></details><details><summary>企业现金流长期为负？</summary><p>融资依赖度更高，应该结合“利润与现金”模块查看。</p></details></div>` )}</div>`;$('debt-view').innerHTML=out}
function debugPage(){if(!raw){$('debug-view').innerHTML='<p class="muted">获取财报后可查看字段映射和数据核验。</p>';return}const r=currently(),keys=['b','i','c'];let mapping='<div class="mapping">';for(const [k,info] of Object.entries(F)){const source=r?.[info.sheet]||{};let fields=Object.keys(source).filter(x=>source[x]===null||typeof source[x]==='number');let current=field(r,k);mapping+=`<label>${info.label}<select data-map="${k}"><option value="">自动匹配${current?' · '+E(current):' · 未找到'}</option>${fields.map(f=>`<option ${chosen[k]===f?'selected':''} value="${E(f)}">${E(f)}</option>`).join('')}</select></label>`}mapping+='</div>';const missing=Object.keys(F).filter(k=>!field(r,k));$('debug-view').innerHTML=`<div class="flex" style="justify-content:space-between;margin-bottom:12px"><strong>字段校验 · ${periodName(r?.date)}</strong><button class="smallbtn" id="apply-map">应用字段映射</button></div><p class="micro">字段未识别时不计算；如接口字段调整，可手动选择对应字段。确认字段的语义后再应用，避免错误结论。</p>${missing.length?`<div class="alert" style="margin-bottom:10px">未自动找到：${missing.map(x=>F[x].label).join('、')}。相关指标将显示“—”。</div>`:''}${mapping}<details style="margin-top:15px"><summary>查看接口原始字段和样例 JSON</summary><pre class="debug">${E(JSON.stringify({b:r?.b,i:r?.i,c:r?.c},null,2))}</pre></details>`;document.getElementById('apply-map').onclick=()=>{document.querySelectorAll('[data-map]').forEach(el=>chosen[el.dataset.map]=el.value||'');renderAll()}}
function renderAll(){if(!raw)return;overview();minorityPage();cashPage();workingPage();debtPage();debugPage();enhanceCharts();document.querySelectorAll('[data-period]').forEach(el=>el.onchange=e=>{selectedPeriod=e.target.value;renderAll()});document.querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>switchTab(el.dataset.jump))}
function switchTab(tab){activeTab=tab;document.querySelectorAll('.tab').forEach(x=>{x.classList.toggle('active',x.dataset.tab===tab);x.setAttribute('aria-selected',x.dataset.tab===tab?'true':'false')});document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id==='panel-'+tab))}
document.querySelectorAll('.tab').forEach(el=>el.onclick=()=>switchTab(el.dataset.tab));

function csvContent(){
  const keys=Object.keys(F),head=['报告期',...keys.map(k=>F[k].label),'少数股东权益份额','少数股东利润份额','份额偏离倍数','经营现金/归母净利','现金/选定短债'];
  const rows=reports.map(r=>{const m=minority(r);return [r.date,...keys.map(k=>val(r,k)),m.er,m.pr,m.ratio,cash(r).ratio,raw.financial?null:debt(r).coverage].map(v=>v??'')});
  return '\ufeff'+[head,...rows].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
$('export').onclick=async()=>{
  if(!raw)return;
  try {if(await window.finscope.exportCSV(raw.stock.code,csvContent())) $('status').textContent='CSV 已保存。金额单位为元，比值为小数，缺失字段留空。';}
  catch(error){$('status').textContent='导出失败：'+error.message;}
};
function clearResults(){
  raw=null;reports=[];annual=[];latest=null;chosen={};
  $('ticker').classList.add('hidden');
  $('company-profile').classList.add('hidden');
  $('company-profile').innerHTML='';
  for(const id of ['overview','minority','cash','working','debt']) $(id+'-view').innerHTML='<div class="empty">暂无本次查询结果，请联网重新获取。</div>';
  debugPage();
}
function renderCompanyProfile(){
  const view=$('company-profile'),m=raw?.market;
  view.classList.remove('hidden');
  const amount=n=>n===null||n===undefined?'—':n>=1e12?fmt(n/1e12)+' 万亿':fmt(n/1e8)+' 亿';
  const multiple=n=>n===null||n===undefined||n===0?'—':fmt(n)+' 倍';
  const metric=(label,value,note='',tone='')=>`<div class="profile-metric"><span>${label}</span><strong class="${tone}">${E(value)}</strong><small>${E(note)}</small></div>`;
  const pe=m?.peTTM,pb=m?.pb,change=m?.changePercent;
  const stamp=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  const timestamp=m?(m.quotedAt?`行情时间 ${stamp(m.quotedAt)}`:`行情时间未提供 · 获取于 ${stamp(m.fetchedAt)}`):'';
  view.innerHTML=`<div class="profile-top"><strong>行情与估值</strong><span>${E(timestamp)}</span></div><div class="profile-metrics">${metric('最新价（元）',m?.price>0?fmt(m.price):'—','查询时的最新报价')}${metric('涨跌幅',change===null||change===undefined?'—':`${change>0?'+':''}${fmt(change)}%`,'相对上一交易日收盘',change>0?'red':change<0?'green':'')}${metric('市盈率（TTM）',multiple(pe),pe<0?'亏损，估值比较不适用':'最近四个季度盈利口径')}${metric('市净率（PB）',multiple(pb),pb<0?'净资产为负，比较不适用':'股价 / 每股净资产')}${metric('总市值',amount(m?.marketCap),'人民币')}${metric('流通市值',amount(m?.floatMarketCap),'人民币')}</div><div class="profile-basics"><span>行业 <b>${E(m?.industry||'—')}</b></span><span>地区 <b>${E(m?.region||'—')}</b></span><span>上市日期 <b>${E(m?.listedAt||'—')}</b></span><span>交易所 <b>${E(raw.stock.secu.endsWith('.SH')?'上交所':raw.stock.secu.endsWith('.SZ')?'深交所':'北交所')}</b></span></div><div class="profile-note">${m?`来源：${E(m.source||'行情接口')} · 随查询更新，可能存在行情延迟；非交易时段通常为最近交易报价。`:'行情与基本信息暂不可用，财报分析仍可正常使用。'}${m?' 市盈率仅供估值参考，不参与上方财务分类。':''}${m&&!m.industry?' 当前数据源未提供行业、地区或上市日期。':''}</div>`;
}
function showData(data){
  raw=data;chosen={};merge();
  if(!reports.length)throw Error('资产负债表和利润表无法按报告日期匹配');
  $('ticker').classList.remove('hidden');
  $('symbol').textContent=data.stock.secu;
  $('company').textContent=data.b[0]?.SECURITY_NAME_ABBR||data.i[0]?.SECURITY_NAME_ABBR||'上市公司';
  $('coverage').textContent=`${annual.length} 份年报${latest?' · 最新'+periodName(latest.date):''}`;
  const stamp=new Date(data.fetchedAt).toLocaleString('zh-CN',{hour12:false});
  $('status').textContent=`联网查询成功 · 获取于 ${stamp} · ${reports.length} 期配对财报。${(data.warnings||[]).join('')}`;
  $('status').classList.remove('err');
  renderCompanyProfile();renderAll();
}
async function showHistory(revealCode=''){
  try {
    const list=await window.finscope.history();
    const item=list.find(item=>item.code===revealCode);
    if(item){
      historySelection=item.code;
      if(historyFilter&&historyFilter!==item.classification.level)historyFilter=0;
      const query=historyQuery.trim().toLowerCase();
      if(query&&!`${item.name} ${item.code}`.toLowerCase().includes(query))historyQuery='';
    }
    renderHistory(list);
    if(item)selectHistoryCompany(item.code);
    if(item)$('history-map').querySelector(`[data-tile="${item.code}"]`)?.scrollIntoView({block:'nearest'});
  }
  catch{ $('history').textContent='财务地图暂不可用'; }
}
function setQueryLoading(active,code){
  $('query-loading').classList.toggle('hidden',!active);
  if(active)$('query-loading-text').textContent=`正在查询 ${code} · 获取最新财报与行情…`;
  $('history').querySelectorAll('[data-tile]').forEach(tile=>tile.setAttribute('aria-busy',String(active&&tile.dataset.tile===code)));
  for(const id of ['overview','minority','cash','working','debt']){
    const view=$(id+'-view');view.setAttribute('aria-busy',String(active));
    if(active)view.innerHTML='<div class="query-placeholder" aria-hidden="true"></div>';
  }
}
async function search(options={}){
  const stock=codeOf($('stock').value),status=$('status');
  if(!stock){status.textContent='请输入合法的六位A股代码，例如 600519、300750 或 000001。';status.classList.add('err');return}
  if($('search').disabled)return;
  clearResults();status.classList.remove('err');
  $('search').disabled=true;$('stock').disabled=true;$('search').textContent='分析财报';
  status.textContent='正在获取资产负债表、利润表与现金流量表…';
  historyFetch={code:stock.code,state:'loading'};selectHistoryCompany(stock.code);
  setQueryLoading(true,stock.code);
  try {showData(await window.finscope.analyze(stock.secu));historyFetch={code:stock.code,state:'success'};await showHistory(stock.code);if(options.scroll){switchTab('overview');$('ticker').scrollIntoView({block:'start'});}return true;}
  catch(error){
    clearResults();status.classList.add('err');
    historyFetch={code:stock.code,state:'failed',error:error.message};
    status.textContent='获取失败：'+error.message+'。请检查股票代码、网络连接或稍后重试。';
    return false;
  }finally{setQueryLoading(false,stock.code);$('search').disabled=false;$('stock').disabled=false;$('search').textContent='分析财报';drawHistoryDetail();}
}
$('search').onclick=search;
$('stock').onkeydown=e=>{if(e.key==='Enter')search()};
for(const id of ['minority','cash','working','debt']) $(id+'-view').innerHTML='<div class="empty">输入股票代码后，查看该模块的分析、公式与核查线索。</div>';
switchTab('overview');debugPage();showHistory();
