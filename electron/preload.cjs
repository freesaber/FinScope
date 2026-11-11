'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('finscope', {
  analyze: code => ipcRenderer.invoke('reports:load', code),
  openQuote: code => ipcRenderer.invoke('reports:openQuote', code),
  history: () => ipcRenderer.invoke('reports:history'),
  removeHistory: code => ipcRenderer.invoke('reports:remove', code),
  moveHistory: (code, target, after) => ipcRenderer.invoke('reports:move', code, target, after),
  exportCSV: (code, content) => ipcRenderer.invoke('reports:export', code, content)
});
