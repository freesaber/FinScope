const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadMarket,parseMarket,parseTencent}=require('../electron/market.cjs');
const {stockCode}=require('../electron/data.cjs');

test('行情小数不重复缩放，TTM与动态口径区分，保留负估值',()=>{
  const m=parseMarket({data:{f57:'600519',f43:123.45,f170:-1.23,f164:-8.6,f162:9.7,f167:2.3,f116:120e8,f117:100e8,f86:1794382473,f127:'测试行业',f128:'广东板块',f189:19910403}},stockCode('600519'));
  assert.equal(m.price,123.45);assert.equal(m.changePercent,-1.23);
  assert.equal(m.peTTM,-8.6);assert.equal(m.peDynamic,9.7);assert.equal(m.marketCap,120e8);
  assert.equal(m.region,'广东');assert.equal(m.listedAt,'1991-04-03');assert.ok(m.quotedAt);
});
test('行情缺失不填零，未知时间不伪装为实时，拒绝其他公司',()=>{
  const m=parseMarket({data:{f57:'000001',f43:'-',f164:null,f167:'',f86:0}},stockCode('000001'));
  for(const key of ['price','peTTM','pb','quotedAt','listedAt'])assert.equal(m[key],null);
  assert.throws(()=>parseMarket({data:{f57:'000002'}},stockCode('000001')),/不匹配/);
});
test('行情每次联网，显式使用格式化小数并绕过缓存',async()=>{
  let calls=0;
  const request=async(url,options)=>{
    calls++;const params=new URL(url).searchParams;
    assert.equal(params.get('secid'),'0.920001');assert.equal(params.get('fltt'),'2');
    assert.equal(options.cache,'no-store');
    assert.equal(options.redirect,'follow');
    return {ok:true,json:async()=>({data:{f57:'920001',f43:10,f164:12}})};
  };
  await loadMarket('920001',request);await loadMarket('920001',request);assert.equal(calls,2);
  await assert.rejects(()=>loadMarket('000001',async()=>({ok:false,status:503})),/503/);
});

const tencentFixture=()=>{
  const fields=Array(54).fill('');
  for(const [i,v] of [[1,'Example'],[2,'603259'],[3,'100.5'],[30,'20261111161454'],[32,'-1.2'],[39,'17.05'],[44,'3677.77'],[45,'4512.9'],[46,'4.66'],[52,'17.45']])fields[i]=v;
  return `v_sh603259="${fields.join('~')}";`;
};
const tencentResponse=()=>({ok:true,arrayBuffer:async()=>Buffer.from(tencentFixture())});
test('主接口拒绝、超时、空行情与错误公司均自动切换腾讯',async()=>{
  for(const mode of ['http','timeout','empty','wrong-code']){
    const urls=[];
    const m=await loadMarket('603259',async url=>{
      urls.push(url);
      if(url.includes('qt.gtimg.cn'))return tencentResponse();
      if(mode==='http')return {ok:false,status:503};
      if(mode==='timeout')throw Error('timeout');
      return {ok:true,json:async()=>({data:{f57:mode==='wrong-code'?'000001':'603259'}})};
    });
    assert.equal(urls.length,2);assert.equal(m.source,'腾讯行情');assert.equal(m.peTTM,17.05);
    assert.equal(m.peDynamic,17.45);assert.equal(m.floatMarketCap,3677.77e8);
    assert.equal(m.quotedAt,'2026-11-11T08:14:54.000Z');assert.equal(m.industry,null);
  }
});
test('直连全部失败后改用备用网络通道，所有接口失败时明确报错',async()=>{
  const m=await loadMarket('603259',async()=>{throw Error('offline')},async url=>url.includes('qt.gtimg.cn')?tencentResponse():{ok:false,status:503});
  assert.equal(m.source,'腾讯行情');
  await assert.rejects(()=>loadMarket('603259',async()=>{throw Error('offline')}),/多个行情接口/);
  assert.throws(()=>parseTencent(tencentFixture(),stockCode('000001')),/不匹配/);
});
