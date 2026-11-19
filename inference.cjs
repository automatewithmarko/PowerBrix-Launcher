const {totalmem}=require('node:os');
const layouts=require('./model-layouts.json');
const GiB=2**30;
const positive=value=>Number.isFinite(value)&&value>0;
// These are GGML tensor format IDs, not advertised GGUF file quantizations.
const formats={0:'F32',1:'F16',2:'Q4_0',3:'Q4_1',6:'Q5_0',7:'Q5_1',8:'Q8_0',10:'Q2_K',11:'Q3_K',12:'Q4_K',13:'Q5_K',14:'Q6_K',16:'IQ2_XXS',17:'IQ2_XS',18:'IQ3_XXS',19:'IQ1_S',20:'IQ4_NL',21:'IQ3_S',22:'IQ2_S',23:'IQ4_XS',30:'BF16',39:'MXFP4'};
function planInference(model,report,mode='auto'){
 if(mode==='auto'&&report?.cpuFallbacks?.includes(model.id))mode='cpu';
 const layout=layouts[model.id];const machine=report?.machine||{};
 const ram=machine.memory_bytes||totalmem();
 const apple=(machine.gpus||[]).some(gpu=>/Apple/i.test(typeof gpu==='string'?gpu:gpu.name||''));
 const devices=report?.hardwareProfile?.gpus||[];
 const vram=Math.max(0,...devices.map(gpu=>gpu.vram_total_bytes||gpu.vram_bytes||gpu.memory_bytes||gpu.total_bytes||0));
 const gpuBandwidth=Math.max(0,...devices.map(gpu=>gpu.read_Bps||gpu.d2d_Bps||0));
 const gpuBudget=mode==='cpu'?0:apple?Math.max(0,ram*.55-2*GiB):Math.max(0,vram*.8-2*GiB);
 const layers=layout?.layers||0;
 // Keep routed experts on the CPU where mmap permits SSD-backed paging. Dense layers
 // can still run on Metal/Vulkan. Explicit allocation keeps runtime and estimates aligned.
 const dense=(layout?.denseBytes||0)+(layout?.outputEmbeddingBytes||0);
 const gpuLayers=layers?Math.min(layers,Math.floor(gpuBudget/Math.max(1,dense/layers))):0;
 const gpuFraction=layers?gpuLayers/layers:0;
 return {mode:gpuLayers?'hybrid':'cpu',gpuLayers,gpuFraction,gpuBytes:dense*gpuFraction,
  unified:apple,gpuBandwidth,ram,layout,signature:['layout-v2-b12498',machine.cpu,machine.logical_cpus,JSON.stringify(machine.gpus||[]),vram,gpuBandwidth,model.runtime,model.parameterSource||model.revision,mode,gpuLayers,ram,machine.memory_read_Bps,machine.models_drive?.read_Bps].join(':')};
}
function estimateModel(model,report,mode='auto'){
 const plan=planInference(model,report,mode);const l=plan.layout;const machine=report?.machine||{};
 if(!l)return {speed:null,plan,detail:'Run Analyze System to estimate performance.'};
 const memory=machine.memory_read_Bps,disk=machine.models_drive?.read_Bps;
 const dense=l.denseBytes+(l.outputEmbeddingBytes||0); // tied output tables are scanned; input-only tables are lookups
 const routed=l.expertBytes*(l.expertCount?l.expertsUsed/l.expertCount:0);
 const denseCpu=dense*(1-plan.gpuFraction);
 const available=Math.max(0,plan.ram-6*GiB-(plan.unified?plan.gpuBytes:0));
 const residentDense=Math.min(denseCpu,available);
 const expertCache=Math.min(l.expertBytes,Math.max(0,available-residentDense));
 const misses=denseCpu-residentDense+routed*(1-(l.expertBytes?expertCache/l.expertBytes:0));
 if(!positive(memory)||misses>0&&!positive(disk))return {speed:null,plan,detail:'Run Analyze System to measure RAM and model-drive speed.'};
 const cpuProbes=report?.hardwareProfile?.compute?.cpu||[];
 const rateFor=type=>{
  const format=formats[type];const rates=cpuProbes.filter(probe=>probe.format===format).flatMap(probe=>(probe.points||[]).filter(point=>point.tokens===1&&positive(point.weight_Bps)).map(point=>point.weight_Bps));
  // Unmeasured IQ/mixed formats receive a lower throughput allowance, not a fabricated benchmark.
  return rates.length?Math.min(memory,Math.max(...rates)):memory*(format?.startsWith('IQ') ? .35 : .6);
 };
 let computeSeconds=0;
 for(const [type,bucket] of Object.entries(l.types))computeSeconds+=(bucket.denseBytes*(1-plan.gpuFraction)+bucket.expertBytes*(l.expertCount?l.expertsUsed/l.expertCount:0))/rateFor(type);
 computeSeconds+=(l.outputEmbeddingBytes||0)*(1-plan.gpuFraction)/memory;
 const gpuSeconds=plan.gpuBytes/(plan.gpuBandwidth||memory); // conservative shared-bandwidth estimate until a real decode is observed
 const seconds=(misses?misses/disk:0)+computeSeconds+gpuSeconds+.00005*(l.layers||1);
 const speed=.8/seconds;
 const detail=`${plan.gpuLayers?'GPU + CPU + SSD':'CPU + SSD'} estimate using pinned GGUF tensor sizes, ${l.expertCount?l.expertsUsed+' of '+l.expertCount+' experts per token':'dense weights'}, measured RAM/SSD bandwidth, CPU quantization probes when available and an OS/context memory reserve. ${cpuProbes.length?'':'CPU compute measurements are missing. '}${plan.gpuLayers?'GPU throughput uses measured VRAM bandwidth when available, otherwise shared RAM bandwidth. ':''}Context length, page-cache reuse, thermal limits and other apps affect speed. This is an estimate, not a model benchmark.`;
 return {speed,plan,range:[speed*.45,speed*1.6],detail,source:'Hardware estimate'};
}
module.exports={planInference,estimateModel};
