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
        const cacheDir=path.join(app.getPath('userData'),'reports');await fs.mkdir(cacheDir,{recursive:true});
        for(let n=0;n<15;n++){
          const sample=structuredClone(data);sample.stock={code:String(600100+n),secu:`${600100+n}.SH`};
          sample.b.forEach(r=>r.SECURITY_NAME_ABBR=`分类测试 ${n+1}`);
          sample.i.forEach(r=>r.MINORITY_NETPROFIT=n<7?2e8:n<14?4e8:8e8);
          sample.c.forEach(r=>r.NETCASH_OPERATE=20e8);
          await fs.writeFile(path.join(cacheDir,sample.stock.code+'.json'),JSON.stringify(sample));
        }
        await win.webContents.executeJavaScript('showHistory()');
        const history=await win.webContents.executeJavaScript('window.finscope.history()');
        if(history.length!==15)throw Error('历史查询仍被截断');
        for(const level of [1,2,3])if(!history.some(x=>x.classification.level===level))throw Error('缺少分类：'+level);
        await win.webContents.executeJavaScript('historyExpanded.add(1);showHistory()');
        if(await win.webContents.executeJavaScript('document.querySelectorAll(".history-level-1 [data-code]").length')!==7)throw Error('分类展开数量错误');
        await win.webContents.executeJavaScript(`
          const handle=document.querySelector('[data-drag="600106"]'),target=document.querySelector('[data-record="600100"]');
          handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:new DataTransfer()}));
          target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer(),clientY:target.getBoundingClientRect().top+1}));
          target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer(),clientY:target.getBoundingClientRect().top+1}));
        `);
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>historyMutation?setTimeout(check,20):resolve();check()})');
        if((await win.webContents.executeJavaScript('window.finscope.history()'))[0].code!=='600106')throw Error('拖动排序未保存');
        await win.webContents.executeJavaScript('showHistory()');
        if(await win.webContents.executeJavaScript('document.querySelector(".history-level-1 [data-code]").dataset.code')!=='600106')throw Error('重新读取后顺序丢失');
        await win.webContents.executeJavaScript(`document.querySelector('[data-remove="600106"]').click()`);
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>historyMutation?setTimeout(check,20):resolve();check()})');
        if((await win.webContents.executeJavaScript('window.finscope.history()')).length!==14)throw Error('删除没有更新分类数量');
        if(await win.webContents.executeJavaScript('window.finscope.cached("600106")')!==null)throw Error('删除没有清除缓存');
        if(await win.webContents.executeJavaScript('document.getElementById("search").disabled'))throw Error('删除或拖动误触查询');
        await win.webContents.executeJavaScript('document.querySelector(".history-drag").focus()');
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
      await win.webContents.executeJavaScript('document.getElementById("history").scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await fs.writeFile(path.join(output,'classification.png'),(await win.webContents.capturePage()).toPNG());
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
    }catch(error){console.error(error,errors.join('\n'));app.exit(1)}
  });
});
setTimeout(()=>{console.error('桌面测试超时');app.exit(1)},90000).unref();
require('../electron/main.cjs');
