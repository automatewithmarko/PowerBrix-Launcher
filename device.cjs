const os = require('node:os');
const fs = require('node:fs/promises');

const GiB = 2**30;

function pickModels(catalog, report, freeBytes, installed = new Set(), resumed = new Map()) {
  const estimates = new Map((report?.estimates || []).map(row => [row.model,row]));
  const ram = report?.machine?.memory_bytes || os.totalmem();
  return catalog.map(({files,revision,...model}) => {
    const bytes = files.reduce((total,file)=>total+file.bytes,0);
    const local = installed.has(model.id);
    const estimate = estimates.get(model.repo);
    const bandwidth = report?.machine?.memory_read_Bps;
    const nativeFits = model.runtime === 'ssd' || ram >= bytes+4*GiB;
    // Secondary estimates are explicitly separate from the calibrated upstream estimator.
    // Gemma E4B uses embedding lookups; the model card lists 4.5B effective vs. 8B stored.
    const workingBytes = model.id==='gemma' ? bytes*(4.5/8) : bytes;
    const bandwidthRate = model.runtime !== 'ssd' && bandwidth ? bandwidth / workingBytes * .60 : null;
    const disk = report?.machine?.models_drive?.read_Bps;
    // Upstream IQ4_XS catalog: 3.10 GB dense excluding token lookup; 48 layers,
    // 10 routed experts per layer, 2,678,784 aligned bytes per expert read.
    const expertRead = 48*10*2678784;
    const fallback = model.id==='qwenflash' && disk && bandwidth
      ? .65 / (expertRead/disk + (32239669760-29137853440)/bandwidth) : bandwidthRate;
    const speed = estimate?.decode_tokens_per_second ?? fallback;
    const source = estimate?.decode_tokens_per_second != null ? 'SSD profile estimate' : speed != null ? 'PowerBrix estimate' : null;
    const remaining = bytes-(resumed.get(model.id)||0);
    const diskFits = freeBytes >= remaining+GiB;
    const detail = source==='PowerBrix estimate'
      ? model.id==='qwenflash'
        ? 'Approximate SSD and RAM bandwidth estimate with a cold expert cache; CPU quantization throughput was unavailable.'
        : 'Approximate memory bandwidth estimate. Context, compute and GPU behavior can change actual speed.'
      : estimate?.detail || 'Run Analyze System for a speed estimate.';
    return {...model,bytes,local,speed,source,detail,range:estimate?.scenario_range_tokens_per_second||null,
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
