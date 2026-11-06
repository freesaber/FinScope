'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('finscope', {
  analyze: code => ipcRenderer.invoke('reports:load', code),
  cached: code => ipcRenderer.invoke('reports:cached', code),
  history: () => ipcRenderer.invoke('reports:history'),
  exportCSV: (code, content) => ipcRenderer.invoke('reports:export', code, content)
});
