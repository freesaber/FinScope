'use strict';
const {app, BrowserWindow, ipcMain, dialog, Menu, net, shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {loadReports, stockCode} = require('./data.cjs');
const {createHistoryStore} = require('./history.cjs');
const {loadMarket} = require('./market.cjs');
const {createPriceMonitor}=require('./price-monitor.cjs');
const page = path.join(__dirname, '../src/index.html');
let window,priceMonitor;
function trusted(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pathToFileURL(page).href) throw new Error('请求来源无效');
}
function registerHandlers() {
  const history=createHistoryStore(app.getPath('userData'));
  priceMonitor=createPriceMonitor({root:app.getPath('userData'),listStocks:()=>history.list(),quotePrice:code=>loadMarket(code,fetch,net.fetch,{priceOnly:true}),onChange:state=>{
    if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('monitor:state',state);
  }});
  ipcMain.handle('monitor:get',event=>{trusted(event);return priceMonitor.getState();});
  ipcMain.handle('monitor:save',(event,targets)=>{trusted(event);return priceMonitor.save(targets);});
  ipcMain.handle('monitor:toggle',(event,value)=>{trusted(event);return priceMonitor.setEnabled(value);});
  ipcMain.handle('reports:load', async (event, code) => {
    trusted(event);
    const [reports,market]=await Promise.allSettled([loadReports(code,net.fetch),loadMarket(code,fetch,net.fetch)]);
    if(reports.status==='rejected')throw reports.reason;
    const data=reports.value;
    data.market=market.status==='fulfilled'?market.value:null;
    data.marketError=market.status==='rejected'?'行情与基本信息暂时获取失败，请重新查询。':null;
    try {
      await history.record(data);
    } catch { data.warnings.push('本次查询成功，但自选名单保存失败。'); }
    return data;
  });
  ipcMain.handle('reports:history', async event => {
    trusted(event);
    return history.list();
  });
  ipcMain.handle('reports:openQuote',async(event,code)=>{
    trusted(event);
    const stock=stockCode(code),exchange=stock.secu.split('.')[1].toLowerCase();
    await shell.openExternal(`https://quote.eastmoney.com/${exchange}${stock.code}.html`);
  });
  ipcMain.handle('reports:remove', async(event, code) => {trusted(event);await history.remove(code);await priceMonitor.remove(stockCode(code).code);});
  ipcMain.handle('reports:move', (event, code, target, after) => {trusted(event);return history.move(code,target,after);});
  ipcMain.handle('reports:export', async (event, code, content) => {
    trusted(event);
    const stock = stockCode(code);
    if (typeof content !== 'string' || Buffer.byteLength(content) > 5_000_000) throw new Error('导出内容无效');
    const result = await dialog.showSaveDialog(window, {defaultPath: `${stock.code}_财务透镜.csv`, filters: [{name: 'CSV 数据', extensions: ['csv']}]});
    if (result.canceled) return false;
    await fs.writeFile(result.filePath, content, 'utf8');
    return true;
  });
}
function createWindow() {
  window = new BrowserWindow({width: 1240, height: 900, minWidth: 960, minHeight: 720, maximizable: true, fullscreenable: false, title: 'FinScope · 财务透镜', backgroundColor: '#f6f7f8', icon: path.join(__dirname, '../assets/icon.ico'), webPreferences: {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true}});
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.loadFile(page);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label: 'FinScope', submenu: [{role: 'reload', label: '重新加载'}, {role: 'resetZoom', label: '重置缩放'}, {role: 'zoomIn', label: '放大'}, {role: 'zoomOut', label: '缩小'}, {type: 'separator'}, {role: 'quit', label: '退出'}]}, {label: '编辑', submenu: [{role: 'copy', label: '复制'}, {role: 'paste', label: '粘贴'}, {role: 'selectAll', label: '全选'}]}]));
}
app.on('before-quit',()=>priceMonitor?.dispose());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => { registerHandlers(); createWindow(); app.on('activate', () => {if (!BrowserWindow.getAllWindows().length) createWindow();}); });
  app.on('window-all-closed', () => {if (process.platform !== 'darwin') app.quit();});
}
