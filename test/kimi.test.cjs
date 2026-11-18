const {test} = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../catalog.json');
const {pickModels,GiB} = require('../device.cjs');
const {supportsFiles} = require('../attachments.cjs');

test('the Kimi catalog pins complete split downloads with checksums and logos', () => {
  const models = catalog.filter(model => model.logo === 'kimi');
  assert.equal(models.length,10);
  for (const model of models) {
    assert.match(model.revision,/^[a-f0-9]{40}$/);
    assert.ok(model.files.length > 0);
    assert.equal(model.runtime,'mapped');
    assert.ok(supportsFiles(model));
    const splits = model.files[0].path.match(/-00001-of-(\d+)\.gguf$/);
    if (splits) {
      assert.equal(model.files.length,Number(splits[1]));
      model.files.forEach((file,index) => assert.match(file.path,new RegExp('-'+String(index+1).padStart(5,'0')+'-of-'+splits[1]+'\\.gguf$')));
    }
    for (const file of model.files) {
      assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
      assert.match(file.sha256,/^[a-f0-9]{64}$/);
    }
  }
});

test('CPU SSD mapping checks working RAM and remaining storage instead of requiring all weights in RAM', () => {
  const kimi = catalog.find(model => model.id === 'kimi-k25');
  const report = {machine:{memory_bytes:16*GiB}};
  const weights = kimi.files.reduce((sum,file)=>sum+file.bytes,0);
  const roomy = pickModels([kimi],report,weights+2*GiB)[0];
  assert.equal(roomy.pullable,true);
  assert.equal(roomy.speed,null);
  assert.match(roomy.detail,/CPU inference/);
  assert.equal(pickModels([kimi],report,weights-GiB)[0].pullable,false);
  assert.equal(pickModels([kimi],{machine:{memory_bytes:4*GiB}},weights+2*GiB)[0].pullable,false);
  assert.equal(pickModels([kimi],report,3*GiB,new Set(),new Map([[kimi.id,weights-2*GiB]]))[0].pullable,true);
});
