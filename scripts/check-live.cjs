const {loadReports} = require('../electron/data.cjs');
loadReports(process.argv[2] || '600519').then(data => {
  console.log(JSON.stringify({stock: data.stock, company: data.b[0].SECURITY_NAME_ABBR, latest: data.b[0].REPORT_DATE, rows: {balance: data.b.length, income: data.i.length, cash: data.c.length}, fields: {equity: data.b[0].TOTAL_EQUITY, minority: data.b[0].MINORITY_EQUITY, minorityProfit:data.i[0].MINORITY_INTEREST, profit: data.i[0].NETPROFIT}, warnings: data.warnings}, null, 2));
}).catch(error => {console.error(error.message); process.exitCode = 1;});
