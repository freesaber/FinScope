'use strict';
const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
const REPORTS = {b: 'RPT_DMSK_FN_BALANCE', i: 'RPT_DMSK_FN_INCOME', c: 'RPT_DMSK_FN_CASHFLOW'};

function stockCode(input) {
  const match = String(input).trim().toUpperCase().match(/^(\d{6})(?:\.(SH|SZ|BJ))?$/);
  if (!match) throw new Error('请输入六位 A 股代码，可附 .SH / .SZ / .BJ');
  const code = match[1];
  const exchange = /^[56]/.test(code) ? 'SH' : /^(?:[48]|92)/.test(code) ? 'BJ' : 'SZ';
  if (match[2] && match[2] !== exchange) throw new Error('代码与交易所后缀不匹配');
  return {code, secu: `${code}.${exchange}`};
}

async function fetchSheet(report, stock, request = fetch) {
  if (!Object.values(REPORTS).includes(report)) throw new Error('未知报表类型');
  const params = new URLSearchParams({reportName: report, columns: 'ALL', filter: `(SECUCODE="${stock.secu}")`, pageNumber: '1', pageSize: '80', sortColumns: 'REPORT_DATE,NOTICE_DATE', sortTypes: '-1,-1', source: 'WEB', client: 'WEB'});
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await request(`${API}?${params}`, {signal: AbortSignal.timeout(15000), redirect: 'error'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body.success === false) throw new Error(body.message || '数据服务拒绝请求');
      const rows = body.result?.data;
      if (!Array.isArray(rows) || !rows.length) throw new Error('该代码暂无此报表数据');
      if (rows.some(row => row.SECURITY_CODE && row.SECURITY_CODE !== stock.code)) throw new Error('数据服务返回了其他公司的报表');
      return rows;
    } catch (error) { lastError = error; }
  }
  throw new Error(`${report}：${lastError.message}`);
}

async function loadReports(input, request = fetch) {
  const stock = stockCode(input);
  // 摘要接口缺少少数股东字段，只用它发现已披露日期；计算使用 F10 合并完整报表。
  const index = await fetchSheet(REPORTS.b, stock, request);
  const dates = [...new Set(index.map(row => String(row.REPORT_DATE).slice(0,10)))].filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort().reverse();
  const annual = dates.filter(date => date.endsWith('-12-31')).slice(0,3);
  const latest = dates.find(date => !date.endsWith('-12-31') && date > (annual[0] || ''));
  const selected = [...(latest ? [latest] : []), ...annual];
  if (!selected.length) throw new Error('没有可用的报告期');
  const code = stock.secu.split('.')[1] + stock.code;
  const base = 'https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/';
  const page = await request(`${base}Index?type=web&code=${code}`, {signal: AbortSignal.timeout(15000), redirect:'error'});
  if (!page.ok) throw new Error(`公司报表类型识别失败：HTTP ${page.status}`);
  const html = await page.text();
  const companyType = html.match(/id="hidctype"[^>]*value="([1-4])"/)?.[1];
  if (!companyType) throw new Error('无法识别公司报表类型，数据服务页面可能已调整');
  const full = async endpoint => {
    const params = new URLSearchParams({companyType, reportDateType:'0', reportType:'1', dates:selected.join(','), code});
    const response = await request(`${base}${endpoint}?${params}`, {signal:AbortSignal.timeout(20000), redirect:'error'});
    if (!response.ok) throw new Error(`完整报表请求失败：HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.data) || !body.data.length) throw new Error('完整报表暂无数据');
    if (body.data.some(row => row.SECURITY_CODE !== stock.code)) throw new Error('完整报表返回公司不匹配');
    return body.data;
  };
  const results = await Promise.allSettled(['zcfzbAjaxNew','lrbAjaxNew','xjllbAjaxNew'].map(full));
  if (results[0].status === 'rejected') throw results[0].reason;
  if (results[1].status === 'rejected') throw results[1].reason;
  const warnings = results[2].status === 'rejected' ? ['现金流量表获取失败，相关指标留空。'] : [];
  if(companyType !== '4') warnings.push('金融企业报表：经营占款和债务初筛不适用，相关模块暂停判断。');
  return {stock, financial:companyType !== '4', source:'东方财富 F10 合并完整报表', b: results[0].value, i: results[1].value, c: results[2].status === 'fulfilled' ? results[2].value : [], fetchedAt: new Date().toISOString(), warnings};
}
module.exports = {stockCode, fetchSheet, loadReports, REPORTS};
