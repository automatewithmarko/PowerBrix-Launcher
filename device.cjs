const os = require('node:os');
const fs = require('node:fs/promises');

const GiB = 2**30;
const {estimateModel}=require('./inference.cjs');

function pickModels(catalog, report, freeBytes, installed = new Set(), resumed = new Map()) {
  const estimates = new Map((report?.estimates || []).map(row => [row.model,row]));
  const ram = report?.machine?.memory_bytes || os.totalmem();
  return catalog.map(({files,revision,...model}) => {
    const bytes = files.reduce((total,file)=>total+file.bytes,0);
    const local = installed.has(model.id);
    const estimate = estimates.get(model.repo);
    const prediction=estimateModel(model,report);
    const nativeFits=ram >= Math.max(model.minRamGiB||0,model.runtime==='fixture'?0:4)*GiB;
    const calibrated=model.runtime==='ssd'&&!report?.cpuFallbacks?.includes(model.id)&&Number.isFinite(estimate?.decode_tokens_per_second)&&estimate.decode_tokens_per_second>0;
    const observed=report?.actualSpeeds?.[model.id];
    const valid=observed?.signature===prediction.plan.signature&&observed.samples?.length;
    const samples=valid?observed.samples.filter(sample=>Number.isFinite(sample.tokens)&&sample.tokens>=16&&Number.isFinite(sample.ms)&&sample.ms>=100):[];
    const measured=samples.length?samples.reduce((sum,sample)=>sum+sample.tokens,0)*1000/samples.reduce((sum,sample)=>sum+sample.ms,0):null;
    const speed=measured??(calibrated?estimate.decode_tokens_per_second:prediction.speed);
    const source=measured?'Measured on this device':calibrated?'SSD profile estimate':prediction.source||null;
    const remaining = bytes-(resumed.get(model.id)||0);
    const diskFits = freeBytes >= remaining+GiB;
    const detail=measured?'Average decode speed from recent completed replies on this device and execution path. Context length and other workloads affect speed.':calibrated?estimate.detail||'SSD profile estimate. Actual speed varies with context and hardware.':prediction.detail;
    return {...model,bytes,local,speed,source,detail,range:calibrated?estimate?.scenario_range_tokens_per_second||null:prediction.range||null,executionMode:prediction.plan.mode,
      fit:local ? 'Installed' : !diskFits ? 'Needs more storage' : !nativeFits ? 'Needs more memory' : 'Ready to pull',
      pullable:!local && diskFits && nativeFits,
      resumed:!local && (resumed.get(model.id)||0)>0,
    };
  });
}

async function freeSpace(directory) {
  const info = await fs.statfs(directory);
  return info.bavail*info.bsize;
}

module.exports = {GiB, pickModels, freeSpace};
