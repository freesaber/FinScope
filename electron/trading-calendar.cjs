'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const SOURCE='https://www.sse.com.cn/disclosure/dealinstruc/closed/';
// 上交所年度休市公告；调休周末仍按周末休市。
const BUNDLED={2026:[['01-01','01-03'],['02-15','02-23'],['04-04','04-06'],['05-01','05-05'],['06-19','06-21'],['09-25','09-27'],['10-01','10-07']]};
const offset=8*60*60*1000;
function localParts(time){const date=new Date(time+offset);return {date:date.toISOString().slice(0,10),year:date.getUTCFullYear(),weekday:date.getUTCDay(),minute:date.getUTCHours()*60+date.getUTCMinutes()};}
const epoch=(date,minute)=>Date.parse(date+'T00:00:00+08:00')+minute*60000;
function tradingState(time=Date.now(),years=BUNDLED){
  const p=localParts(time),ranges=years[p.year];
  const holiday=date=>years[Number(date.slice(0,4))]?.some(([start,end])=>date.slice(5)>=start&&date.slice(5)<=end);
  const weekend=p.weekday===0||p.weekday===6;
  const known=Array.isArray(ranges),closed=weekend||!known||holiday(p.date);
  const open=!closed&&(p.minute>=570&&p.minute<690||p.minute>=780&&p.minute<900);
  let nextOpen=null;
  if(!closed&&p.minute<570)nextOpen=epoch(p.date,570);
  else if(!closed&&p.minute>=690&&p.minute<780)nextOpen=epoch(p.date,780);
  else if(!open){
    for(let i=1;i<=370;i++){
      const future=localParts(epoch(p.date,0)+i*86400000);
      if(!years[future.year])break;
      if(future.weekday!==0&&future.weekday!==6&&!holiday(future.date)){nextOpen=epoch(future.date,570);break;}
    }
  }
  const reason=open?'交易时段':weekend?'周末休市':!known?'交易日历待确认':holiday(p.date)?'节假日休市':p.minute>=690&&p.minute<780?'午间休市':p.minute<570?'尚未开盘':'已收盘';
  return {isOpen:open,reason,calendarKnown:known,nextOpen:nextOpen?new Date(nextOpen).toISOString():null,sessionEnd:open?new Date(epoch(p.date,p.minute<690?690:900)).toISOString():null};
}
function parseAnnualCalendar(html){
  const plain=String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
  const match=plain.match(/(20\d{2})年休市安排\s*(?:元旦|春节)/);
  if(!match)throw Error('未找到年度休市日历');
  const year=Number(match[1]),section=plain.slice(match.index,match.index+2500).split('相关公告')[0];
  const ranges=[...section.matchAll(/(\d{1,2})月(\d{1,2})日.{0,25}?至(\d{1,2})月(\d{1,2})日.{0,25}?休市/g)].map(m=>[`${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`,`${m[3].padStart(2,'0')}-${m[4].padStart(2,'0')}`]);
  if(ranges.length<6||ranges.length>10||ranges.some(([a,b])=>a>b||!Number.isFinite(Date.parse(`${year}-${a}`))||!Number.isFinite(Date.parse(`${year}-${b}`))))throw Error('年度休市日历不完整');
  return {year,ranges};
}
function createTradingCalendar({root,request=fetch,now=Date.now}){
  let years={...BUNDLED},readyPromise,inflight,lastAttempt='';
  const file=path.join(root,'trading-calendar.json');
  async function ready(){
    if(!readyPromise)readyPromise=(async()=>{
      try{
        const saved=JSON.parse(await fs.readFile(file,'utf8'));
        for(const [year,ranges] of Object.entries(saved)){
          if(/^20\d{2}$/.test(year)&&Array.isArray(ranges)&&ranges.length>=6&&ranges.length<=10&&ranges.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(date=>/^\d{2}-\d{2}$/.test(date))&&pair[0]<=pair[1]))years[year]=ranges;
        }
      }catch{}
    })();
    await readyPromise;
  }
  async function refresh(){
    await ready();
    const today=localParts(now()).date;
    if(inflight)return inflight;
    if(lastAttempt===today)return;
    lastAttempt=today;
    inflight=(async()=>{
      try{
        const response=await request(SOURCE,{cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(6000)});
        if(!response.ok)throw Error('休市日历请求失败');
        const {year,ranges}=parseAnnualCalendar(await response.text());
        years={...years,[year]:ranges};
        await fs.mkdir(root,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(years),'utf8');await fs.rename(file+'.tmp',file);
      }catch{} // 网络不可用时使用已确认的年度日历，未知年份不按普通工作日猜测。
    })().finally(()=>{inflight=null;});
    return inflight;
  }
  return {state:time=>tradingState(time??now(),years),ready,refresh};
}
module.exports={tradingState,createTradingCalendar,parseAnnualCalendar,BUNDLED,SOURCE};
