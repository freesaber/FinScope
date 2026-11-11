const {app,dialog,ipcMain,shell}=require('electron');
const {createHistoryStore}=require('../electron/history.cjs');
const {createPriceMonitor}=require('../electron/price-monitor.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
app.setPath('userData',path.join(app.getPath('temp'),'finscope-smoke-'+process.pid));
const errors=[];
let openedQuote='';
shell.openExternal=async url=>{openedQuote=url;};
app.on('web-contents-created',(_event,contents)=>{
  contents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)});
});
app.on('browser-window-created',(_event,win)=>{
  // 截图等待动画帧；被其他窗口遮挡时也需要继续渲染。
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load',async()=>{
    try{
      let demoMonitor;
      if(!win.isMaximizable())throw Error('窗口未允许最大化');
      if(win.isFullScreenable())throw Error('窗口不应允许全屏');
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
        const store=createHistoryStore(app.getPath('userData')),samples=new Map();
        let requests=0,failRequests=false,holdRequests=false,releaseRequest;
        demoMonitor=createPriceMonitor({root:app.getPath('userData'),listStocks:()=>store.list(),quotePrice:async code=>({price:code==='600100'?9:30,source:'模拟行情',quotedAt:new Date().toISOString()}),onChange:state=>win.webContents.send('monitor:state',state)});
        for(const channel of ['monitor:get','monitor:save','monitor:toggle'])ipcMain.removeHandler(channel);
        ipcMain.handle('monitor:get',()=>demoMonitor.getState());
        ipcMain.handle('monitor:save',(_event,targets)=>demoMonitor.save(targets));
        ipcMain.handle('monitor:toggle',(_event,value)=>demoMonitor.setEnabled(value));

        ipcMain.removeHandler('reports:load');
        ipcMain.handle('reports:load',async(_event,code)=>{requests++;if(holdRequests)await new Promise(resolve=>releaseRequest=resolve);if(failRequests)throw Error('模拟联网失败');const sample=structuredClone(samples.get(code.slice(0,6)));sample.fetchedAt=new Date().toISOString();await store.record(sample);return sample;});
        for(let n=0;n<67;n++){
          const sample=structuredClone(data);sample.stock={code:String(600100+n),secu:`${600100+n}.SH`};
          sample.b.forEach(r=>r.SECURITY_NAME_ABBR=`分类测试 ${n+1}`);
          sample.i.forEach(r=>r.MINORITY_NETPROFIT=n<45?2e8:n<66?4e8:8e8);
          sample.c.forEach(r=>r.NETCASH_OPERATE=20e8);
          samples.set(sample.stock.code,sample);await store.record(sample);
        }
        await win.webContents.executeJavaScript('showHistory()');
        holdRequests=true;
        await win.webContents.executeJavaScript('document.getElementById("stock").value="600100";globalThis.loadingRequest=search();void 0');
        if(!await win.webContents.executeJavaScript('!document.getElementById("query-loading").classList.contains("hidden") && !document.querySelector("#history .spinner,#search .spinner,.analysis-loading,.stock-tile.loading") && document.querySelector(\'[data-tile="600100"]\').getAttribute("aria-busy")==="true"'))throw Error('等待请求时未显示加载状态');
        await fs.mkdir(path.join(__dirname,'../test-results'),{recursive:true});
        await win.webContents.executeJavaScript('document.getElementById("overview-view").scrollIntoView();new Promise(resolve=>requestAnimationFrame(resolve))');
        await fs.writeFile(path.join(__dirname,'../test-results/query-loading.png'),(await win.webContents.capturePage()).toPNG());
        await new Promise(resolve=>{const check=()=>releaseRequest?resolve():setTimeout(check,10);check()});
        holdRequests=false;releaseRequest();
        await win.webContents.executeJavaScript('globalThis.loadingRequest');
        if(!await win.webContents.executeJavaScript('document.getElementById("query-loading").classList.contains("hidden") && !document.querySelector(".stock-tile.loading")'))throw Error('查询结束后加载状态未清理');
        const history=await win.webContents.executeJavaScript('window.finscope.history()');
        if(history.length!==67)throw Error('历史查询仍被截断');
        for(const level of [1,2,3])if(!history.some(x=>x.classification.level===level))throw Error('缺少分类：'+level);
        if(await win.webContents.executeJavaScript('document.querySelectorAll("[data-tile]").length')!==67)throw Error('方块没有一次显示全部公司');
        if(await win.webContents.executeJavaScript('Boolean(document.querySelector(".history-items"))'))throw Error('仍存在旧列表');
        await win.webContents.executeJavaScript(`
          const tile=document.querySelector('[data-tile="600101"]'),target=document.querySelector('[data-tile="600100"]');
          tile.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:new DataTransfer()}));
          target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer(),clientX:target.getBoundingClientRect().left+1}));
          target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer(),clientX:target.getBoundingClientRect().left+1}));
        `);
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>historyMutation?setTimeout(check,20):resolve();check()})');
        if((await win.webContents.executeJavaScript('window.finscope.history()'))[0].code!=='600101')throw Error('拖动顺序未保存');
        await win.webContents.executeJavaScript('showHistory()');
        if(await win.webContents.executeJavaScript('document.querySelector("[data-tile]").dataset.tile')!=='600101')throw Error('重载后拖动顺序丢失');
        await win.webContents.executeJavaScript(`document.querySelector('[data-tile="600101"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true,cancelable:true}))`);
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>historyMutation?setTimeout(check,20):resolve();check()})');
        if(await win.webContents.executeJavaScript('document.querySelector("[data-tile]").dataset.tile')!=='600100')throw Error('键盘排序失败');
        await win.webContents.executeJavaScript('document.querySelector(\'[data-map-filter="2"]\').click()');
        if(await win.webContents.executeJavaScript('document.querySelectorAll("[data-tile]").length')!==21)throw Error('分类筛选失败');
        await win.webContents.executeJavaScript('document.querySelector(\'[data-map-filter="0"]\').click();document.getElementById("history-find").value="600144";document.getElementById("history-find").dispatchEvent(new Event("input"))');
        if(await win.webContents.executeJavaScript('document.querySelectorAll("[data-tile]").length')!==1)throw Error('代码定位失败');
        await win.webContents.executeJavaScript('(async()=>{await document.querySelector("[data-tile]").onclick()})()');
        if(!await win.webContents.executeJavaScript('document.getElementById("history-detail").textContent.includes("分类测试 45")'))throw Error('点击未显示公司详情');
        await win.webContents.executeJavaScript('document.getElementById("history-find").value="不存在";document.getElementById("history-find").dispatchEvent(new Event("input"))');
        if(!await win.webContents.executeJavaScript('Boolean(document.querySelector(".map-no-match")) && !document.getElementById("history-remove")'))throw Error('空搜索仍展示过期操作');
        await win.webContents.executeJavaScript('(async()=>{document.getElementById("history-find").value="";document.getElementById("history-find").dispatchEvent(new Event("input"));await document.querySelector(\'[data-tile="600144"]\').onclick();document.getElementById("history-remove").click()})()');
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>historyMutation?setTimeout(check,20):resolve();check()})');
        if((await win.webContents.executeJavaScript('window.finscope.history()')).length!==66)throw Error('移除没有更新数量');
        if(await win.webContents.executeJavaScript('typeof window.finscope.cached')!=='undefined')throw Error('仍暴露旧缓存接口');
        if(await win.webContents.executeJavaScript('document.querySelectorAll("[data-tile]").length')!==66)throw Error('移除未更新地图');
        if(await win.webContents.executeJavaScript('document.getElementById("search").disabled'))throw Error('方块操作误触查询');
        await win.webContents.executeJavaScript('document.getElementById("history-find").value="分类测试 6";document.getElementById("history-find").dispatchEvent(new Event("input"))');
        if(await win.webContents.executeJavaScript('document.querySelectorAll("[data-tile]").length')!==9)throw Error('名称定位失败');
        await win.webContents.executeJavaScript('document.getElementById("history-find").value="";document.getElementById("history-find").dispatchEvent(new Event("input"))');

        const beforeRequests=requests;
        await win.webContents.executeJavaScript('(async()=>{await document.querySelector("[data-tile]").onclick();await document.getElementById("history-open").onclick()})()');
        if(requests-beforeRequests!==1)throw Error('东方财富按钮重复查询了财报');
        if(openedQuote!=='https://quote.eastmoney.com/sh600100.html')throw Error('东方财富地址或浏览器调用错误');
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>historyMutation?setTimeout(check,20):resolve();check()})');
        if(await win.webContents.executeJavaScript('raw.stock.code')!=='600100')throw Error('打开财报未联网获取所选公司');
        if(!await win.webContents.executeJavaScript('historySelection===raw.stock.code && document.querySelector(".stock-tile.selected").dataset.tile===raw.stock.code'))throw Error('查询公司与地图选中状态不一致');

        if(!await win.webContents.executeJavaScript('document.getElementById("status").textContent.includes("联网查询成功")'))throw Error('没有标注联网来源');
        await win.webContents.executeJavaScript('document.getElementById("stock").value="600101";search()');
        if(!await win.webContents.executeJavaScript('document.querySelectorAll(".stock-tile.selected").length===1 && document.querySelector(".stock-tile.selected").dataset.tile==="600101" && historySelection===raw.stock.code'))throw Error('输入框查询未统一卡片勾选');
        await win.webContents.executeJavaScript('document.getElementById("stock").value="600100";search()');
        failRequests=true;
        await win.webContents.executeJavaScript('search()');
        if(!await win.webContents.executeJavaScript('raw===null && document.getElementById("status").textContent.includes("获取失败")'))throw Error('联网失败仍显示旧财报');
        failRequests=false;
        await win.webContents.executeJavaScript('search()');


      }

      if(demoMonitor){
        await win.webContents.executeJavaScript('openTargetSettings()');
        if(await win.webContents.executeJavaScript('document.querySelectorAll("[data-target-row]").length')!==66)throw Error('设置表未包含全部自选股');
        await win.webContents.executeJavaScript(`
          for(const code of ['600100','600101']){
            const row=document.querySelector('[data-target-row="'+code+'"]');
            const buy=row.querySelector('[data-target-buy]'),sell=row.querySelector('[data-target-sell]');
            buy.value='10';buy.dispatchEvent(new Event('input'));sell.value='20';sell.dispatchEvent(new Event('input'));
          }
          document.getElementById('target-form').onsubmit({preventDefault(){}});
        `);
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>document.getElementById("target-save").disabled?setTimeout(check,10):resolve();check()})');
        if(await win.webContents.executeJavaScript('document.getElementById("target-dialog").open'))throw Error('目标价保存未关闭弹框');
        await win.webContents.executeJavaScript('document.getElementById("monitor-toggle").onclick()');
        await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>monitorState.running||!monitorState.prices["600101"]?setTimeout(check,10):resolve();check()})');
        if(!await win.webContents.executeJavaScript('Boolean(document.querySelector(\'[data-tile="600100"]\').parentElement.querySelector(".price-alert")) && document.querySelector(\'[data-tile="600101"]\').parentElement.classList.contains("price-sell")'))throw Error('目标价买卖提示未显示');
        await win.webContents.executeJavaScript('document.getElementById("monitor-toggle").onclick()');
        if(await win.webContents.executeJavaScript('Boolean(document.querySelector(".price-alert"))'))throw Error('关闭监控未清除提示');
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
      await win.webContents.executeJavaScript(`
        raw.i.forEach(r=>{r.MINORITY_INTEREST=-260356103.45;r.MINORITY_NETPROFIT=-260356103.45;r.NETPROFIT=138194736.58;});
        raw.b.forEach(r=>{r.MINORITY_EQUITY=852490976.62;r.TOTAL_EQUITY=12821134446.31;});
        merge();selectedPeriod=annual[0].date;renderAll();switchTab('overview');
      `);
      for(const id of ['overview','minority']){
        const content=await win.webContents.executeJavaScript(`document.getElementById('${id}-view').innerText`);
        if(!content.includes('-2.60亿')||!content.includes('少数股东应占亏损')||!content.includes('不参与偏离倍数评级'))throw Error('亏损金额或解释未展示：'+id);
      }
      await win.webContents.executeJavaScript('document.querySelector(".ticker").scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await fs.writeFile(path.join(output,'minority-loss.png'),(await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('selectedPeriod=latest.date;renderAll();switchTab("minority")');
      if(!await win.webContents.executeJavaScript('document.getElementById("minority-view").innerText.includes("-2.60亿")'))throw Error('季报切换后亏损金额丢失');
      win.setSize(960,720);
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > window.innerWidth'))throw Error('窄窗口横向溢出');

      if(!process.argv.includes('--live')){
        await win.webContents.executeJavaScript(`(async()=>{
          historyFilter=0;historyQuery='';
          const all=await window.finscope.history();
          const preview=[...all.filter(x=>x.classification.level===1).slice(0,6),...all.filter(x=>x.classification.level===2).slice(0,13),...all.filter(x=>x.classification.level===3)];
          historySelection=preview[0].code;renderHistory(preview);
          document.getElementById('history').scrollIntoView();
        })()`);
        await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await fs.writeFile(path.join(output,'tiles-narrow.png'),(await win.webContents.capturePage()).toPNG());
        if(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > window.innerWidth'))throw Error('地图窄窗口横向溢出');
        win.setSize(1224,900);
        await win.webContents.executeJavaScript('document.getElementById("history").scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await fs.writeFile(path.join(output,'tiles-preview.png'),(await win.webContents.capturePage()).toPNG());
        if(demoMonitor){
          await demoMonitor.setEnabled(true);
          await win.webContents.executeJavaScript('new Promise(resolve=>{const check=()=>monitorState.running||!monitorState.prices["600101"]?setTimeout(check,10):resolve();check()})');
          await fs.writeFile(path.join(output,'monitor-cards.png'),(await win.webContents.capturePage()).toPNG());
          await win.webContents.executeJavaScript('openTargetSettings()');
          await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
          await fs.writeFile(path.join(output,'monitor-settings.png'),(await win.webContents.capturePage()).toPNG());
          await demoMonitor.setEnabled(false);
        }


      }
      console.log('PASS: 自选卡片与拖动、目标价表格保存、监控开关与买卖提示、查询与导出、六个页签');app.exit(0);
    }catch(error){console.error(error,errors.join('\n'));app.exit(1)}
  });
});
setTimeout(()=>{console.error('桌面测试超时');app.exit(1)},90000).unref();
require('../electron/main.cjs');
