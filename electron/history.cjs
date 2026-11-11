'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {stockCode}=require('./data.cjs');
const {classify}=require('../src/classification.js');
function createHistoryStore(root){
  const orderFile=path.join(root,'history-order.json');
  const watchlistFile=path.join(root,'watchlist.json');
  const cache=code=>path.join(root,'reports',stockCode(code).code+'.json');
  let pending=Promise.resolve();
  const mutate=operation=>{const next=pending.then(operation);pending=next.catch(()=>{});return next;};
  async function order(){try{const codes=JSON.parse(await fs.readFile(orderFile,'utf8'));return Array.isArray(codes)?codes.filter(code=>/^\d{6}$/.test(code)):[];}catch{return [];}}
  async function save(codes){await fs.mkdir(root,{recursive:true});await fs.writeFile(orderFile+'.tmp',JSON.stringify(codes),'utf8');await fs.rename(orderFile+'.tmp',orderFile);}
  let initialized;
  async function records(){
    if(!initialized)initialized=(async()=>{
      try{await fs.access(watchlistFile);}
      catch(error){
        if(error.code!=='ENOENT')throw error;
        // 首次升级只迁移名单和筛选摘要，历史财报不再用于打开或兜底。
        await saveRecords(await legacyRecords());
      }
    })().catch(error=>{initialized=null;throw error;});
    await initialized;
    return JSON.parse(await fs.readFile(watchlistFile,'utf8'));
  }
  async function saveRecords(items){await fs.mkdir(root,{recursive:true});await fs.writeFile(watchlistFile+'.tmp',JSON.stringify(items),'utf8');await fs.rename(watchlistFile+'.tmp',watchlistFile);}
  async function legacyRecords(){
    const files=await fs.readdir(path.join(root,'reports')).catch(()=>[]);
    const items=await Promise.all(files.filter(file=>/^\d{6}\.json$/.test(file)).map(async file=>{
      try{const data=JSON.parse(await fs.readFile(cache(file.slice(0,6)),'utf8'));return {code:file.slice(0,6),name:data.b[0]?.SECURITY_NAME_ABBR||data.stock.code,fetchedAt:data.fetchedAt,classification:classify(data)};}catch{return null;}
    }));
    return items.filter(Boolean);
  }
  async function list(){
    const items=await records();
    const saved=await order(),ranks=new Map(saved.map((code,index)=>[code,index]));
    return items.filter(Boolean).sort((a,b)=>(ranks.get(a.code)??Infinity)-(ranks.get(b.code)??Infinity)||b.fetchedAt.localeCompare(a.fetchedAt));
  }
  return {
    list,
    record:data=>mutate(async()=>{
      const code=stockCode(data.stock.code).code,items=await records();
      const summary={code,name:data.b[0]?.SECURITY_NAME_ABBR||code,fetchedAt:data.fetchedAt,classification:classify(data)};
      const index=items.findIndex(item=>item.code===code);
      if(index<0)items.push(summary);else items[index]=summary;
      await saveRecords(items);
    }),
    remove:code=>mutate(async()=>{const normalized=stockCode(code).code;await saveRecords((await records()).filter(item=>item.code!==normalized));await fs.rm(cache(normalized),{force:true});await save((await order()).filter(item=>item!==normalized));}),
    move:(code,target,after)=>mutate(async()=>{
      code=stockCode(code).code;target=stockCode(target).code;
      if(typeof after!=='boolean')throw Error('排序位置无效');
      const items=await list(),source=items.find(item=>item.code===code),destination=items.find(item=>item.code===target);
      if(!source||!destination)throw Error('查询记录已变更，请重试');
      if(source.classification.level!==destination.classification.level)throw Error('只能在同一分类内排序');
      if(code===target)return;
      const codes=items.map(item=>item.code).filter(item=>item!==code),index=codes.indexOf(target)+(after?1:0);
      codes.splice(index,0,code);await save(codes);
    })
  };
}
module.exports={createHistoryStore};
