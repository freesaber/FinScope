const {test} = require('node:test');
const assert = require('node:assert/strict');
const {stockCode, loadReports, fetchSheet, REPORTS} = require('../electron/data.cjs');
test('解析沪深北股票与显式交易所，拒绝不匹配代码', () => {
  assert.equal(stockCode('600519').secu, '600519.SH');
  assert.equal(stockCode('000001.sz').secu, '000001.SZ');
  assert.equal(stockCode('920001').secu, '920001.BJ');
  assert.equal(stockCode('830799').secu, '830799.BJ');
  assert.throws(()=>stockCode('600519.SZ'));
  assert.throws(()=>stockCode('600519")'));
});
test('现金流失败允许部分结果，资产负债表失败则中止', async () => {
  const request = async url => {
    if(url.includes('Index?'))return {ok:true,text:async()=>'<input id="hidctype" type="hidden" value="4" />'};
    if(url.includes('xjllbAjaxNew'))throw Error('暂不可用');
    return {ok:true,json:async()=>url.includes('datacenter-web')?{result:{data:[{SECURITY_CODE:'600519',REPORT_DATE:'2025-12-31'}]}}:{data:[{SECURITY_CODE:'600519',REPORT_DATE:'2025-12-31'}]}};
  };
  const data=await loadReports('600519', request);
  assert.deepEqual(data.c,[]);assert.equal(data.warnings.length,1);
  await assert.rejects(()=>loadReports('600519', async()=>{throw Error('offline')}), /offline/);
});
test('拒绝其他公司数据、空数据与未知报表', async () => {
  await assert.rejects(()=>fetchSheet(REPORTS.b,stockCode('600519'),async()=>({ok:true,json:async()=>({result:{data:[{SECURITY_CODE:'000001'}]}})})),/其他公司/);
  await assert.rejects(()=>fetchSheet(REPORTS.b,stockCode('600519'),async()=>({ok:true,json:async()=>({result:{data:[]}})})),/暂无/);
  await assert.rejects(()=>fetchSheet('INVALID',stockCode('600519')),/未知/);
});
