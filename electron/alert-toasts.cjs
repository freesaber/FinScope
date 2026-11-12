'use strict';
const {BrowserWindow,ipcMain,screen}=require('electron');
const path=require('node:path');
function createAlertToasts({getMainWindow,onSpace=()=>{}}){
  const windows=new Set(),timers=new Map();let disposed=false;
  const size={width:330,height:160},gap=12;
  function layout(){
    const main=getMainWindow();
    const display=main&&!main.isDestroyed()?screen.getDisplayMatching(main.getBounds()):screen.getPrimaryDisplay();
    const area=display.workArea;
    [...windows].forEach((win,index)=>{if(!win.isDestroyed())win.setPosition(area.x+area.width-size.width-16,Math.max(area.y+12,area.y+area.height-size.height-16-index*(size.height+gap)));});
  }
  const close=event=>{for(const win of windows)if(!win.isDestroyed()&&event.sender===win.webContents){win.close();break;}};
  ipcMain.on('toast:close',close);screen.on('display-metrics-changed',layout);
  return {
    canShow:()=>!disposed&&windows.size<3,
    show:async data=>{
      if(disposed||windows.size>=3)return;
      const win=new BrowserWindow({...size,show:false,frame:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,focusable:false,alwaysOnTop:true,backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'toast-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
      windows.add(win);layout();
      win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
      win.on('closed',()=>{clearTimeout(timers.get(win));timers.delete(win);windows.delete(win);if(!disposed){layout();onSpace();}});
      try{
        await win.loadFile(path.join(__dirname,'../src/price-toast.html'));
        if(disposed||win.isDestroyed())return;
        win.webContents.send('toast:data',data);win.showInactive();
        const timer=setTimeout(()=>{if(!win.isDestroyed())win.close();},15000);timer.unref();timers.set(win,timer);
      }catch(error){if(!win.isDestroyed())win.close();throw error;}
    },
    dispose:()=>{disposed=true;ipcMain.removeListener('toast:close',close);screen.removeListener('display-metrics-changed',layout);for(const win of windows)if(!win.isDestroyed())win.destroy();}
  };
}
module.exports={createAlertToasts};
