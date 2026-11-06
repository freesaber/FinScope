const F={
 minorityEquity:{sheet:'b',label:'少数股东权益',names:['MINORITY_EQUITY','MINORITY_INTEREST','MINORITY_SHAREHOLDERS_EQUITY','MINORITY_SHAREHOLDER_EQUITY']},
 equity:{sheet:'b',label:'所有者权益合计',names:['TOTAL_EQUITY','TOTAL_OWNERS_EQUITY','TOTAL_SHAREHOLDERS_EQUITY']},
 minorityProfit:{sheet:'i',label:'少数股东损益',names:['MINORITY_INTEREST','MINORITY_NETPROFIT','MINORITY_PROFIT','MINORITY_GAIN','MINORITY_NET_PROFIT']},
 profit:{sheet:'i',label:'合并净利润',names:['NETPROFIT','NET_PROFIT','NET_INCOME','TOTAL_NETPROFIT']},
 parentProfit:{sheet:'i',label:'归母净利润',names:['PARENT_NETPROFIT','PARENT_NET_PROFIT']},
 revenue:{sheet:'i',label:'营业收入',names:['OPERATE_INCOME','TOTAL_OPERATE_INCOME','OPERATING_REVENUE']},
 ocf:{sheet:'c',label:'经营活动现金流净额',names:['NETCASH_OPERATE','NET_CASH_OPERATE','NET_OPERATE_CASHFLOW']},
 receivable:{sheet:'b',label:'应收账款',names:['ACCOUNTS_RECE','ACCOUNTS_RECEIVABLE']},
 inventory:{sheet:'b',label:'存货',names:['INVENTORY']},
 monetary:{sheet:'b',label:'货币资金',names:['MONETARYFUNDS','MONETARY_FUNDS']},
 shortDebt:{sheet:'b',label:'短期借款',names:['SHORT_LOAN','SHORT_TERM_LOAN','SHORT_BORROWINGS']},
 currentLongDebt:{sheet:'b',label:'一年内到期非流动负债',names:['NONCURRENT_LIAB_1YEAR','NONCURRENT_LIABILITY_1YEAR','NONCURRENT_LIAB_DUE_1YEAR']},
 assets:{sheet:'b',label:'资产总计',names:['TOTAL_ASSETS']},
 liabilities:{sheet:'b',label:'负债合计',names:['TOTAL_LIABILITIES']},
};
if(typeof module!=='undefined')module.exports=F;
