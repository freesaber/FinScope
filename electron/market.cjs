'use strict';
const {stockCode}=require('./data.cjs');
const numeric=value=>value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim())?null:Number.isFinite(Number(value))?Number(value):null;
const text=value=>typeof value==='string'&&value.trim()&&value!=='-'?value.trim():null;
function parseMarket(body,stock){
  const d=body?.data;
  if(!d||d.f57!==stock.code)throw Error('行情数据缺失或公司代码不匹配');
  const listed=String(d.f189??''),seconds=numeric(d.f86);
  return {
    code:stock.code,name:text(d.f58),price:numeric(d.f43),changePercent:numeric(d.f170),
    peTTM:numeric(d.f164),peDynamic:numeric(d.f162),pb:numeric(d.f167),
    marketCap:numeric(d.f116),floatMarketCap:numeric(d.f117),
    industry:text(d.f127),region:text(d.f128)?.replace(/板块$/,'')||null,
    listedAt:/^\d{8}$/.test(listed)?`${listed.slice(0,4)}-${listed.slice(4,6)}-${listed.slice(6)}`:null,
    quotedAt:seconds>946684800&&seconds<4102444800?new Date(seconds*1000).toISOString():null,
    fetchedAt:new Date().toISOString(),source:'东方财富行情'
  };
}
function parseTencent(body,stock){
  const symbol=stock.secu.split('.')[1].toLowerCase()+stock.code;
  const payload=String(body).match(new RegExp(`v_${symbol}="([^"\\r\\n]*)"`))?.[1];
  const f=payload?.split('~');
  if(!f||f.length<47||f[2]!==stock.code)throw Error('腾讯行情数据缺失或公司代码不匹配');
  const time=f[30],date=/^\d{14}$/.test(time)?`${time.slice(0,4)}-${time.slice(4,6)}-${time.slice(6,8)}T${time.slice(8,10)}:${time.slice(10,12)}:${time.slice(12,14)}+08:00`:null;
  const cap=index=>{const n=numeric(f[index]);return n===null?null:n*1e8;};
  return {code:stock.code,name:text(f[1]),price:numeric(f[3]),changePercent:numeric(f[32]),peTTM:numeric(f[39]),peDynamic:numeric(f[52]),pb:numeric(f[46]),marketCap:cap(45),floatMarketCap:cap(44),industry:null,region:null,listedAt:null,quotedAt:date&&Number.isFinite(Date.parse(date))?new Date(date).toISOString():null,fetchedAt:new Date().toISOString(),source:'腾讯行情'};
}
async function loadMarket(input,request=fetch,alternateRequest=request,{priceOnly=false}={}){
  const stock=stockCode(input);
  const params=new URLSearchParams({secid:`${stock.secu.endsWith('.SH')?'1':'0'}.${stock.code}`,fltt:'2',invt:'2',fields:'f43,f57,f58,f86,f116,f117,f127,f128,f162,f164,f167,f170,f189'});
  const eastmoney=`https://push2.eastmoney.com/api/qt/stock/get?${params}`;
  const symbol=stock.secu.split('.')[1].toLowerCase()+stock.code;
  const tencent=`https://qt.gtimg.cn/q=${symbol}`;
  const routes=[{url:eastmoney,request,parse:parseMarket},{url:tencent,request,parse:parseTencent}];
  if(alternateRequest!==request)routes.push({url:eastmoney,request:alternateRequest,parse:parseMarket},{url:tencent,request:alternateRequest,parse:parseTencent});
  let partial=null,lastError;
  for(const route of routes){
    try{
      const response=await route.request(route.url,{cache:'no-store',signal:AbortSignal.timeout(4500),redirect:'follow'});
      if(!response.ok)throw Error(`行情获取失败：HTTP ${response.status}`);
      const body=route.parse===parseMarket?await response.json():new TextDecoder('gb18030').decode(await response.arrayBuffer());
      const result=route.parse(body,stock);
      if(!(result.price>0)&&!(result.marketCap>0))throw Error('行情返回空数据');
      if(!partial)partial=result;
      if(priceOnly&&result.price>0||result.peTTM!==null&&result.peTTM!==0)return result;
    }catch(error){lastError=error;}
  }
  if(partial)return partial;
  throw Error('多个行情接口均暂不可用：'+(lastError?.message||'未获取到有效数据'));
}
module.exports={loadMarket,parseMarket,parseTencent};
