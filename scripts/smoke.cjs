const {app,dialog}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
app.setPath('userData',path.join(app.getPath('temp'),'finscope-smoke-'+process.pid));
const errors=[];
app.on('web-contents-created',(_event,contents)=>{
  contents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)});
});
app.on('browser-window-created',(_event,win)=>{
  win.webContents.once('did-finish-load',async()=>{
    try{
      const security=await win.webContents.executeJavaScript('({node:typeof require,bridge:typeof window.finscope?.analyze})');
      if(security.node!=='undefined'||security.bridge!=='function')throw Error('预加载或进程隔离失败');
      if(process.argv.includes('--live')){
        await win.webContents.executeJavaScript('document.getElementById("stock").value="600771"');
        await win.webContents.executeJavaScript('search()');
        if(!await win.webContents.executeJavaScript('Boolean(raw && reports.length)'))throw Error(await win.webContents.executeJavaScript('document.getElementById("status").textContent'));
      }else{
        const data={stock:{code:'600519',secu:'600519.SH'},fetchedAt:new Date().toISOString(),warnings:[],b:[],i:[],c:[]};
        for(const date of ['2026-09-30','2025-12-31','2024-12-31','2023-12-31']){
          data.b.push({REPORT_DATE:date,SECURITY_NAME_ABBR:'自动化测试数据',TOTAL_EQUITY:100e8,MINORITY_EQUITY:10e8,ACCOUNTS_RECE:5e8,INVENTORY:20e8,MONETARYFUNDS:60e8,SHORT_LOAN:10e8,NONCURRENT_LIAB_1YEAR:10e8,TOTAL_ASSETS:150e8,TOTAL_LIABILITIES:50e8});
          data.i.push({REPORT_DATE:date,NETPROFIT:20e8,MINORITY_NETPROFIT:4e8,PARENT_NETPROFIT:16e8,OPERATE_INCOME:80e8});
          data.c.push({REPORT_DATE:date,NETCASH_OPERATE:15e8});
        }
        await win.webContents.executeJavaScript(`showData(${JSON.stringify(data)})`);
      }
      for(const tab of ['overview','minority','cash','working','debt','about']){
        const length=await win.webContents.executeJavaScript(`switchTab('${tab}');document.getElementById('panel-${tab}').innerText.length`);
        if(length<80)throw Error('模块未渲染：'+tab);
        if(tab!=='about'&&!await win.webContents.executeJavaScript(`Boolean(document.querySelector('#panel-${tab} svg'))`))throw Error('缺少图表：'+tab);
      }
      await win.webContents.executeJavaScript("selectedPeriod=latest.date;renderAll();switchTab('overview')");
      const overview=await win.webContents.executeJavaScript('document.getElementById("overview-view").innerText');
      if(!overview.includes('怎么看这个数')||!overview.includes('倍')||overview.includes('×'))throw Error('缺少参考说明或倍数单位不清楚');
      const csvPath=path.join(app.getPath('userData'),'export.csv');
      await fs.mkdir(app.getPath('userData'),{recursive:true});
      dialog.showSaveDialog=async()=>({canceled:false,filePath:csvPath});
      await win.webContents.executeJavaScript("window.finscope.exportCSV(raw.stock.code,csvContent())");
      if(!(await fs.readFile(csvPath,'utf8')).startsWith('\ufeff"报告期"'))throw Error('CSV 文件写入失败');
      if(process.argv.includes('--live')){
        const cached=await win.webContents.executeJavaScript('window.finscope.cached(raw.stock.code)');
        if(cached.stock.code!=='600771')throw Error('本地缓存读取失败');
      }
      if(errors.length)throw Error(errors.join('\n'));
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const output=path.join(__dirname,'../test-results');await fs.mkdir(output,{recursive:true});
      await fs.writeFile(path.join(output,'desktop.png'),(await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('document.querySelector(".ticker").scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await fs.writeFile(path.join(output,'overview.png'),(await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('document.querySelector(".chart-section").scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await fs.writeFile(path.join(output,'charts.png'),(await win.webContents.capturePage()).toPNG());
      if(process.argv.includes('--live')){await fs.mkdir(path.join(__dirname,'../docs'),{recursive:true});await fs.copyFile(path.join(output,'overview.png'),path.join(__dirname,'../docs/desktop.png'));await fs.copyFile(path.join(output,'charts.png'),path.join(__dirname,'../docs/charts.png'));}
      await win.webContents.executeJavaScript("selectedPeriod=annual[0].date;renderAll();renderAll()");
      if(await win.webContents.executeJavaScript('document.querySelectorAll("#overview-view svg").length')!==3)throw Error('切换报告期后图表重复或缺失');
      win.setSize(850,900);
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > window.innerWidth'))throw Error('窄窗口横向溢出');
      console.log('PASS: 隔离与预加载、六个页签、报告期切换、CSV 写入、页面渲染');app.exit(0);
    }catch(error){console.error(error);app.exit(1)}
  });
});
setTimeout(()=>{console.error('桌面测试超时');app.exit(1)},90000).unref();
require('../electron/main.cjs');
