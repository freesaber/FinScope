'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {stockCode}=require('./data.cjs');
const {classify}=require('../src/classification.js');
function createHistoryStore(root){
  const orderFile=path.join(root,'history-order.json');
  const cache=code=>path.join(root,'reports',stockCode(code).code+'.json');
  let pending=Promise.resolve();
  const mutate=operation=>{const next=pending.then(operation);pending=next.catch(()=>{});return next;};
  async function order(){try{const codes=JSON.parse(await fs.readFile(orderFile,'utf8'));return Array.isArray(codes)?codes.filter(code=>/^\d{6}$/.test(code)):[];}catch{return [];}}
  async function save(codes){await fs.mkdir(root,{recursive:true});await fs.writeFile(orderFile+'.tmp',JSON.stringify(codes),'utf8');await fs.rename(orderFile+'.tmp',orderFile);}
  async function list(){
    const files=await fs.readdir(path.join(root,'reports')).catch(()=>[]);
    const items=await Promise.all(files.filter(file=>/^\d{6}\.json$/.test(file)).map(async file=>{
      try{const data=JSON.parse(await fs.readFile(cache(file.slice(0,6)),'utf8'));return {code:file.slice(0,6),name:data.b[0]?.SECURITY_NAME_ABBR||data.stock.code,fetchedAt:data.fetchedAt,classification:classify(data)};}catch{return null;}
    }));
    const saved=await order(),ranks=new Map(saved.map((code,index)=>[code,index]));
    return items.filter(Boolean).sort((a,b)=>(ranks.get(a.code)??Infinity)-(ranks.get(b.code)??Infinity)||b.fetchedAt.localeCompare(a.fetchedAt));
  }
  return {
    list,
    remove:code=>mutate(async()=>{const normalized=stockCode(code).code;await fs.rm(cache(normalized),{force:true});await save((await order()).filter(item=>item!==normalized));}),
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
