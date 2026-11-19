const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const cp=require('node:child_process');const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
test('all model paths launch on CPU/SSD and mapped paths allow GPU offloading with a CPU fallback',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-execution-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=path.join(root,'engine','local-b12498-'+process.platform+'-'+process.arch);await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,process.platform==='win32'?'llama-server.exe':'llama-server'),'');
 let lastArgs,failGpu=false;
 t.mock.method(cp,'spawn',(exe,args)=>{lastArgs=args;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=failGpu&&args.includes('--cpu-moe')?1:null;child.signalCode=null;return child});
 t.mock.method(global,'fetch',async url=>({ok:true,json:async()=>url.endsWith('/props')?{default_generation_settings:{n_ctx:8192}}:{data:[{id:'test'}]}}));
 const modulePath=require.resolve('../engine.cjs');delete require.cache[modulePath];t.after(()=>delete require.cache[modulePath]);const {LocalEngine}=require(modulePath);const engine=new LocalEngine();
 const catalog=require('../catalog.json');const report={machine:{memory_bytes:24*2**30,memory_read_Bps:80e9,models_drive:{read_Bps:3e9},gpus:[]}};
 const legacy=async()=>({server:'legacy-server',launcher:'legacy-launcher',env:{}});
 for(const model of catalog){await engine.start(model,'test.gguf',legacy,root,()=>{},new AbortController().signal,report);if(model.runtime!=='ssd'){assert.ok(lastArgs.includes('mmap'),model.id);assert.equal(lastArgs[lastArgs.indexOf('-ngl')+1],'0');assert.ok(lastArgs.includes('--no-op-offload'));}await engine.stop();}
 const model=catalog.find(model=>model.id==='kimi-k25');const gpu={machine:{...report.machine,gpus:['Apple M4']}};
 await engine.start(model,'test.gguf',legacy,root,()=>{},new AbortController().signal,gpu);assert.ok(Number(lastArgs[lastArgs.indexOf('-ngl')+1])>0);assert.ok(lastArgs.includes('--cpu-moe'));await engine.stop();
 failGpu=true;await engine.start(model,'test.gguf',legacy,root,()=>{},new AbortController().signal,gpu);assert.equal(engine.current.usedCpuFallback,true);assert.equal(lastArgs[lastArgs.indexOf('-ngl')+1],'0');await engine.stop();
});
