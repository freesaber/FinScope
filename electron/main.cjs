'use strict';
const {app, BrowserWindow, ipcMain, dialog, Menu, net} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {loadReports, stockCode} = require('./data.cjs');
const {createHistoryStore} = require('./history.cjs');
const page = path.join(__dirname, '../src/index.html');
let window;
const cacheFile = code => path.join(app.getPath('userData'), 'reports', `${stockCode(code).code}.json`);
async function readCache(code) {
  try { return JSON.parse(await fs.readFile(cacheFile(code), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('本地缓存损坏，请重新联网查询'); }
}
function trusted(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pathToFileURL(page).href) throw new Error('请求来源无效');
}
function registerHandlers() {
  const history=createHistoryStore(app.getPath('userData'));
  ipcMain.handle('reports:load', async (event, code) => {
    trusted(event);
    const data = await loadReports(code, net.fetch);
    try {
      const file = cacheFile(code);
      await fs.mkdir(path.dirname(file), {recursive: true});
      await fs.writeFile(file + '.tmp', JSON.stringify(data), 'utf8');
      await fs.rename(file + '.tmp', file);
    } catch { data.warnings.push('本次查询成功，但本地缓存写入失败。'); }
    return data;
  });
  ipcMain.handle('reports:cached', (event, code) => { trusted(event); return readCache(code); });
  ipcMain.handle('reports:history', async event => {
    trusted(event);
    return history.list();
  });
  ipcMain.handle('reports:remove', (event, code) => {trusted(event);return history.remove(code);});
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
  window = new BrowserWindow({width: 1240, height: 900, minWidth: 820, minHeight: 640, maximizable: true, fullscreenable: false, title: 'FinScope · 财务透镜', backgroundColor: '#f6f7f8', icon: path.join(__dirname, '../assets/icon.ico'), webPreferences: {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true}});
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.loadFile(page);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label: 'FinScope', submenu: [{role: 'reload', label: '重新加载'}, {role: 'resetZoom', label: '重置缩放'}, {role: 'zoomIn', label: '放大'}, {role: 'zoomOut', label: '缩小'}, {type: 'separator'}, {role: 'quit', label: '退出'}]}, {label: '编辑', submenu: [{role: 'copy', label: '复制'}, {role: 'paste', label: '粘贴'}, {role: 'selectAll', label: '全选'}]}]));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => { registerHandlers(); createWindow(); app.on('activate', () => {if (!BrowserWindow.getAllWindows().length) createWindow();}); });
  app.on('window-all-closed', () => {if (process.platform !== 'darwin') app.quit();});
}
