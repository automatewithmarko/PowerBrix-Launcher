const {test}=require('node:test');const assert=require('node:assert/strict');
const catalog=require('../catalog.json');const layouts=require('../model-layouts.json');
const {estimateModel,planInference}=require('../inference.cjs');const {pickModels,GiB}=require('../device.cjs');
const cpu={machine:{memory_bytes:24*GiB,memory_read_Bps:80e9,models_drive:{read_Bps:3e9},gpus:[]}};
test('all catalog entries have pinned tensor layouts and CPU/SSD speed estimates',()=>{
 for(const model of catalog){
  const layout=layouts[model.id];assert.ok(layout.layers>0,model.id);
  assert.equal(layout.source,model.parameterSource);
  assert.ok(layout.denseBytes+layout.expertBytes+layout.embeddingBytes+layout.lookupBytes<=model.files.reduce((sum,file)=>sum+file.bytes,0));
  const estimate=estimateModel(model,cpu);assert.ok(Number.isFinite(estimate.speed)&&estimate.speed>0,model.id);
  assert.equal(estimate.plan.gpuLayers,0);assert.ok(estimate.range[0]<estimate.speed&&estimate.range[1]>estimate.speed);
  assert.equal(pickModels([model],cpu,2e12)[0].pullable,true,model.id);
 }
});
test('CPU, dedicated GPU and unified GPU plans do not allocate more than their budgets',()=>{
 const reports=[cpu,{...cpu,hardwareProfile:{gpus:[{vram_bytes:12*GiB}]}},{machine:{...cpu.machine,gpus:['Apple M4, 10-core GPU']}}];
 for(const model of catalog)for(const report of reports){
  const plan=planInference(model,report);assert.ok(plan.gpuBytes<=12*GiB);
  assert.ok(plan.gpuLayers<=layouts[model.id].layers);
  assert.ok(estimateModel(model,report).speed>0);
  assert.equal(planInference(model,report,'cpu').gpuLayers,0);
 }
 assert.ok(planInference(catalog.find(m=>m.id==='kimi-k25'),reports[1]).gpuLayers>0);
});
test('disk bandwidth, RAM cache and CPU quantization throughput affect estimates in the correct direction',()=>{
 const model=catalog.find(m=>m.id==='kimi-k25');const base=estimateModel(model,cpu).speed;
 assert.ok(estimateModel(model,{machine:{...cpu.machine,models_drive:{read_Bps:6e9}}}).speed>base);
 assert.ok(estimateModel(model,{machine:{...cpu.machine,memory_bytes:512*GiB}}).speed>base);
 const slower={...cpu,hardwareProfile:{compute:{cpu:[{format:'Q2_K',points:[{tokens:1,weight_Bps:1e9}]}]}}};
 assert.ok(estimateModel(model,slower).speed<base);
 assert.equal(estimateModel(model,{machine:{...cpu.machine,models_drive:{}}}).speed,null);
});
test('observed decode speeds replace predictions only for the same hardware and execution plan',()=>{
 const model=catalog.find(m=>m.id==='kimi-linear');const signature=planInference(model,cpu).signature;
 const report={...cpu,actualSpeeds:{[model.id]:{signature,samples:[{tokens:100,ms:2000},{tokens:50,ms:2000}]}}};
 assert.equal(pickModels([model],report,2e12)[0].speed,37.5);
 assert.equal(pickModels([model],report,2e12)[0].source,'Measured on this device');
 const changed={...report,machine:{...cpu.machine,memory_bytes:128*GiB}};
 assert.notEqual(pickModels([model],changed,2e12)[0].source,'Measured on this device');
});
