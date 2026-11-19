const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {LocalApi,ApiError}=require('../api.cjs');
async function service(t,complete){const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-api-test-'));const api=new LocalApi(root,{listModels:async()=>[{id:'test-model',name:'Test model'}],complete:complete||(async(input,_signal,onDelta)=>{onDelta({answer:'Hello',reasoning:'Thought'});return {answer:'Hello',reasoning:'Thought',finishReason:'stop',metrics:{promptTokens:5,generatedTokens:2}};})});await api.start();t.after(async()=>{await api.close();await fs.rm(root,{recursive:true,force:true})});return {api,root};}
const prompt={model:'test-model',messages:[{role:'user',content:'Hello'}]};
const request=(api,body=prompt,token=api.info().key)=>fetch(api.info().baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('the local API requires a key and rejects browser origins and uninstalled models',async t=>{
 let called=0;const {api}=await service(t,async()=>{called++;});
 assert.equal(api.server.address().address,'127.0.0.1');
 assert.equal((await request(api,prompt,'wrong-key')).status,401);
 assert.equal((await fetch(api.info().baseUrl+'/models',{headers:{Authorization:'Bearer '+api.info().key,Origin:'https://example.com'}})).status,403);
 assert.equal((await request(api,{...prompt,model:'not-installed'})).status,404);
 assert.equal(called,0);
 const response=await fetch(api.info().baseUrl+'/models',{headers:{Authorization:'Bearer '+api.info().key}});assert.equal((await response.json()).data[0].id,'test-model');
});
test('chat completions and streaming keep reasoning separate and include real usage',async t=>{
 const {api}=await service(t);
 const response=await request(api);const data=await response.json();assert.equal(response.status,200);assert.equal(data.choices[0].message.content,'Hello');assert.equal(data.choices[0].message.reasoning_content,'Thought');assert.equal(data.usage.total_tokens,7);
 const stream=await request(api,{...prompt,stream:true});assert.match(stream.headers.get('content-type'),/text\/event-stream/);const text=await stream.text();assert.match(text,/"content":"Hello"/);assert.match(text,/reasoning_content/);assert.match(text,/data: \[DONE\]/);
});
test('one key persists across restart and regeneration revokes the old key',async t=>{
 const {api,root}=await service(t);const old=api.info().key;
 // Windows reports synthetic POSIX mode bits; its profile ACL controls file access.
 if(process.platform!=='win32')assert.equal((await fs.stat(path.join(root,'local-api.json'))).mode&0o777,0o600);
 await api.close();await api.start();assert.equal(api.info().key,old);
 await api.regenerate();assert.notEqual(api.info().key,old);assert.equal((await request(api,prompt,old)).status,401);assert.equal((await request(api)).status,200);
});
test('system messages and valid generation settings reach inference, invalid inputs are rejected',async t=>{
 let captured;const {api}=await service(t,async input=>{captured=input;return {answer:'OK',finishReason:'stop'};});
 assert.equal((await request(api,{...prompt,messages:[{role:'system',content:'Be concise'},...prompt.messages],max_tokens:100,temperature:0,top_p:.8})).status,200);
 assert.equal(captured.messages[0].role,'system');assert.deepEqual(captured.options,{max_tokens:100,temperature:0,top_p:.8});
 assert.equal((await request(api,{...prompt,messages:[{role:'user',content:[{type:'image_url'}]}]})).status,400);
 assert.equal((await request(api,{...prompt,max_tokens:999999})).status,400);
 assert.equal((await request(api,{...prompt,messages:[...prompt.messages,{role:'system',content:'Late system'}]})).status,400);
});
test('busy errors have a useful status and shutdown cancels active work',async t=>{
 const {api}=await service(t,async()=>{throw new ApiError(409,'The engine is busy.');});const response=await request(api);assert.equal(response.status,409);assert.match((await response.json()).error.message,/busy/);
 let began;const started=new Promise(resolve=>{began=resolve});let aborted=false;
 api.complete=async(_input,signal)=>{began();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('Stopped'))},{once:true}));};
 const pending=request(api).catch(()=>null);await started;await api.close();await pending;assert.equal(aborted,true);
});
