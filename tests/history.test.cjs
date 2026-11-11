const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHistoryStore}=require('../electron/history.cjs');
test('排序持久化、更新财报不重置排序，删除同步移除缓存与顺序',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'finscope-order-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const dir=path.join(root,'reports');await fs.mkdir(dir);
  for(const code of ['600100','600101','600102'])await fs.writeFile(path.join(dir,code+'.json'),JSON.stringify({stock:{code},fetchedAt:'2026-11-06',b:[{SECURITY_NAME_ABBR:code}],i:[],c:[]}));
  const store=createHistoryStore(root);await store.move('600102','600100',false);
  assert.deepEqual((await createHistoryStore(root).list()).map(x=>x.code),['600102','600100','600101']);
  await store.move('600102','600101',true);
  assert.deepEqual((await store.list()).map(x=>x.code),['600100','600101','600102']);
  await store.remove('600101');assert.equal((await store.list()).length,2);
  await assert.rejects(()=>fs.readFile(path.join(dir,'600101.json')),/ENOENT/);
  assert.ok(!JSON.parse(await fs.readFile(path.join(root,'history-order.json'),'utf8')).includes('600101'));
  await assert.rejects(()=>store.remove('../outside'),/六位/);
  await assert.rejects(()=>store.move('600101','600100',false),/已变更/);
  // 删除不存在记录可重复执行，且不会清除其他记录。
  await store.remove('600101');assert.equal((await store.list()).length,2);
});
test('跨分类拖动被拒绝；并发排序和删除按顺序落盘',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'finscope-order-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'reports'));
  for(const [code,minority] of [['600100',40],['600101',null],['600102',null]])await fs.writeFile(path.join(root,'reports',code+'.json'),JSON.stringify({stock:{code},fetchedAt:'2026-11-06',b:[{REPORT_DATE:'2025-12-31',TOTAL_EQUITY:100,MINORITY_EQUITY:10}],i:[{REPORT_DATE:'2025-12-31',NETPROFIT:100,MINORITY_INTEREST:minority}],c:[]}));
  const store=createHistoryStore(root);await assert.rejects(()=>store.move('600100','600101',true),/同一分类/);
  await Promise.all([store.move('600102','600101',false),store.remove('600101')]);
  assert.deepEqual((await store.list()).map(x=>x.code),['600100','600102']);
});


test('仅持久化自选摘要，重启保留顺序且不保存报表正文',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'finscope-watchlist-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=createHistoryStore(root);
  const data=code=>({stock:{code},fetchedAt:'2026-11-11',b:[{REPORT_DATE:'2025-12-31',SECURITY_NAME_ABBR:code}],i:[],c:[]});
  await store.record(data('600100'));await store.record(data('600101'));
  await store.move('600101','600100',false);
  await store.record({...data('600100'),fetchedAt:'2026-11-12'});
  const list=await createHistoryStore(root).list();
  assert.deepEqual(list.map(x=>x.code),['600101','600100']);
  assert.equal(list[1].fetchedAt,'2026-11-12');
  const saved=JSON.parse(await fs.readFile(path.join(root,'watchlist.json'),'utf8'));
  assert.ok(saved.every(item=>!('b' in item)&&!('i' in item)&&!('c' in item)));
  await assert.rejects(()=>fs.access(path.join(root,'reports')),/ENOENT/);
});
