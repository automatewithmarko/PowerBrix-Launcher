const {test} = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('system analysis preserves usable results and keeps diagnostic output out of the UI', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'powerbrix-analysis-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let scenario;
  t.mock.method(cp,'spawn',()=>{
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    process.nextTick(()=>{
      child.stderr.write('inferssd profile: GPU probe: VRAM size and transfer rates\n');
      child.stdout.write(scenario.stdout);
      child.stderr.write(scenario.stderr);
      child.emit('close',scenario.code);
    });
    return child;
  });
  const enginePath = require.resolve('../engine.cjs');
  delete require.cache[enginePath];
  const {profileMachine} = require(enginePath);
  t.after(()=>{delete require.cache[enginePath];});
  const machine = {cpu:'Test CPU',logical_cpus:12,memory_bytes:16*2**30,memory_read_Bps:72e9,
    gpus:['Test graphics card'],models_drive:{model:'Test SSD',read_Bps:3e9}};
  const output = JSON.stringify({machine,estimates:[]});
  const run = async sections => {
    await fs.writeFile(path.join(root,'machine.json'),JSON.stringify({sections}));
    const progress = [];
    const report = await profileMachine({launcher:'test-engine',env:{}},root,root,line=>progress.push(line),true,new AbortController().signal);
    assert.ok(progress.every(line=>!/inferssd|VRAM|nvidia-smi/.test(line)));
    return report;
  };
  await t.test('a GPU-only measurement failure completes with a clear warning',async()=>{
    scenario={code:1,stdout:output,stderr:'inferssd profile: 1 section(s) failed: gpus'};
    const report = await run({cpu:{status:'ok'},memory:{status:'ok'},compute:{status:'ok'},gpus:{status:'failed',detail:'CUDA diagnostic'},'storage:test':{status:'ok'}});
    assert.deepEqual(report.machine,machine);
    assert.equal(report.gpuMeasurementUnavailable,true);
    assert.equal(report.analysisWarnings.length,1);
    assert.match(report.analysisWarnings[0],/graphics card/);
    assert.doesNotMatch(report.analysisWarnings[0],/inferssd|CUDA diagnostic/);
  });
  await t.test('a partial memory measurement keeps detected RAM and explains missing speed',async()=>{
    scenario={code:0,stdout:output,stderr:'inferssd profile: 1 section(s) partial: memory'};
    const report = await run({memory:{status:'partial'},gpus:{status:'ok'}});
    assert.equal(report.machine.memory_bytes,machine.memory_bytes);
    assert.match(report.analysisWarnings[0],/RAM capacity/);
    assert.equal(report.gpuMeasurementUnavailable,false);
  });
  await t.test('successful analysis has no warning',async()=>{
    scenario={code:0,stdout:output,stderr:''};
    const report = await run({cpu:{status:'ok'},memory:{status:'ok'},gpus:{status:'ok'}});
    assert.deepEqual(report.analysisWarnings,[]);
  });
  await t.test('a fatal process failure cannot pass using an earlier saved profile',async()=>{
    scenario={code:1,stdout:'',stderr:'inferssd profile: detailed internal error C:\\Users\\Admin\\models'};
    await assert.rejects(run({gpus:{status:'ok'}}),error=>{
      assert.match(error.message,/System analysis couldn’t finish/);
      assert.doesNotMatch(error.message,/inferssd|Admin/);
      return true;
    });
  });
});
