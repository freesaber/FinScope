'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('priceToast',{
  close:()=>ipcRenderer.send('toast:close'),
  onData:callback=>ipcRenderer.once('toast:data',(_event,data)=>callback(data))
});
