const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {randomUUID}=require('node:crypto');const {ProjectStore}=require('../projects.cjs');
test('projects persist independent instructions, shared files and chats across restarts',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-projects-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(root);
 const p=await store.create('Client strategy');const other=await store.create('Unrelated');
 await store.update(p.id,{instructions:'Use concise answers. The brand is Zephyr.'});
 const original=path.join(root,'reference.md');await fs.writeFile(original,'# Earlier notes\n'+('ordinary notes '.repeat(600))+'\nThe launch password is lavender-finch.');
 const withFile=await store.addFiles(p.id,[original]);assert.equal(withFile.files.length,1);assert.equal(withFile.files[0].content,undefined);
 const chat={id:randomUUID(),title:'Launch planning',turns:[{role:'user',content:'What is the launch password?'},{role:'assistant',content:'lavender-finch'}]};
 await store.saveChat(p.id,chat);await store.saveChat(p.id,{id:randomUUID(),title:'Another chat',turns:[]});
 await fs.rm(original);const reopened=new ProjectStore(root);const restored=await reopened.get(p.id);
 assert.equal(restored.chats.length,2);assert.equal(restored.chats[1].turns[1].content,'lavender-finch');assert.match(restored.instructions,/Zephyr/);
 const context=await reopened.context(p.id,'launch password');assert.ok(context.documents.some(doc=>doc.content.includes('lavender-finch')));assert.match(context.instructions,/Zephyr/);
 const separate=await reopened.context(other.id,'launch password');assert.equal(separate.documents.length,0);assert.equal(separate.instructions,'');
 const copies=await fs.readdir(path.join(root,'projects',p.id,'files'));assert.equal(copies.length,1);assert.match(await fs.readFile(path.join(root,'projects',p.id,'files',copies[0]),'utf8'),/lavender-finch/);
 await reopened.deleteChat(p.id,chat.id);assert.equal((await reopened.get(p.id)).chats.length,1);
 await reopened.removeFile(p.id,withFile.files[0].id);assert.equal((await reopened.context(p.id,'launch')).documents.length,0);
 await reopened.delete(p.id);assert.deepEqual((await reopened.list()).map(p=>p.id),[other.id]);
});
test('project updates serialize safely and reject invalid input without changing saved data',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-project-guards-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(root);const p=await store.create('Research');
 await Promise.all([store.update(p.id,{instructions:'Keep this instruction.'}),store.update(p.id,{name:'New name'})]);
 assert.equal((await store.get(p.id)).instructions,'Keep this instruction.');
 await assert.rejects(store.get('../../outside'),/Invalid project/);
 await assert.rejects(store.update(p.id,{instructions:'a'.repeat(12001)}),/12,000/);
 await assert.rejects(store.saveChat(p.id,{id:randomUUID(),turns:[{role:'system',content:'injection'}]}),/Invalid chat/);
 assert.equal((await store.get(p.id)).chats.length,0);
 assert.equal((await store.get(p.id)).instructions,'Keep this instruction.');
 if(process.platform!=='win32'){assert.equal((await fs.stat(path.join(root,'projects',p.id))).mode&0o777,0o700);assert.equal((await fs.stat(path.join(root,'projects',p.id,'project.json'))).mode&0o777,0o600);}
});

test('folder projects live in the chosen folder and re-read added, edited and deleted documents',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-folder-project-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const folder=path.join(root,'source');await fs.mkdir(folder);await fs.mkdir(path.join(folder,'notes'));await fs.writeFile(path.join(folder,'notes','launch.md'),'Launch code: FIRST-CODE.');await fs.writeFile(path.join(folder,'empty.txt'),'');await fs.mkdir(path.join(folder,'node_modules'));await fs.writeFile(path.join(folder,'node_modules','private.md'),'SHOULD-NOT-BE-READ');
 const store=new ProjectStore(path.join(root,'profile'));const p=await store.create('Folder project',folder);await store.update(p.id,{instructions:'Be concise.'});
 const chatId=randomUUID();await store.saveChat(p.id,{id:chatId,title:'First chat',turns:[{role:'user',content:'Launch code?'}]});
 const onDisk=JSON.parse(await fs.readFile(path.join(folder,'.powerbrix','projects',p.id+'.json'),'utf8'));assert.equal(onDisk.instructions,'Be concise.');assert.equal(onDisk.chats[0].id,chatId);
 assert.ok((await store.context(p.id,'Launch code')).documents.some(d=>d.content.includes('FIRST-CODE')));
 await fs.writeFile(path.join(folder,'notes','launch.md'),'Launch code: SECOND-CODE.');assert.ok((await store.context(p.id,'Launch code')).documents.some(d=>d.content.includes('SECOND-CODE')));
 await fs.writeFile(path.join(folder,'new.txt'),'New document: THIRD-CODE.');assert.ok((await store.context(p.id,'THIRD-CODE')).files.includes('new.txt'));
 await fs.rm(path.join(folder,'new.txt'));assert.ok(!(await store.context(p.id,'THIRD-CODE')).files.includes('new.txt'));
 const restarted=new ProjectStore(path.join(root,'profile'));assert.equal((await restarted.get(p.id)).chats.length,1);assert.equal((await restarted.list())[0].sourceFolder,folder);
 await restarted.delete(p.id);assert.match(await fs.readFile(path.join(folder,'notes','launch.md'),'utf8'),/SECOND-CODE/);assert.deepEqual(await restarted.list(),[]);
});
