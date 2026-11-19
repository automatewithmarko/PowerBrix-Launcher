const {test}=require('node:test');
const assert=require('node:assert/strict');
test('Store identity is required, XML escaped, and the package preserves native permissions',async()=>{
  const {storeManifest}=await import('../packaging/store.mjs');
  const identity={name:'12345.PowerBrixLauncher',publisher:'CN=00000000-0000-0000-0000-000000000001',publisherDisplayName:'PowerBrix & Co'};
  const manifest=storeManifest(identity,'0.1.16');
  assert.match(manifest,/Version="0\.1\.16\.0"/);
  assert.match(manifest,/PowerBrix &amp; Co/);
  assert.match(manifest,/Windows\.FullTrustApplication/);
  assert.match(manifest,/runFullTrust/);
  assert.match(manifest,/microphone/);
  assert.match(manifest,/app\\PowerBrix Launcher\.exe/);
  for(const bad of [undefined,{...identity,name:'placeholder'},{...identity,publisher:'not-a-publisher'}])assert.throws(()=>storeManifest(bad,'0.1.16'));
  assert.throws(()=>storeManifest(identity,'1.2.3.4'));
  assert.throws(()=>storeManifest(identity,'1.2.70000'));
});
