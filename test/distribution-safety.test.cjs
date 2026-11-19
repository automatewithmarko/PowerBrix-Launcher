const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const load = () => import('../packaging/distribution-safety.mjs');

test('Application packaging includes runtime files but excludes signing files and local data',async()=>{
  const {ignoreApplicationPath:ignore,privateDistributionPath:privateFile}=await load();
  for(const name of ['/main.cjs','/api.cjs','/renderer/app.js','/renderer/manrope.woff2','/assets/icon.png','/node_modules/mammoth/lib/index.js'])assert.equal(ignore(name),false,name);
  for(const name of ['/packaging/apple-ci-setup.mjs','/.github/workflows/launcher-release.yml','/README.md','/.env','/renderer/.env.local','/AuthKey_example.p8','/node_modules/example/private.key','/settings.json','/local-api.json','/secrets/key.txt','/user-data/chats.json','/untracked-script.cjs'])assert.equal(ignore(name),true,name);
  assert.equal(privateFile('C:\\build\\identity.pfx'),true);
  assert.equal(privateFile('renderer/model-logos/openai.svg'),false);
});

test('Distribution scanning blocks credentials without revealing their values',async()=>{
  const {assertSafeDistributionTree:scan}=await load();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-dist-safety-'));
  try{
    await fs.writeFile(path.join(root,'main.cjs'),'console.log("Safe runtime");');
    assert.equal(await scan(root),1);
    const secret=['pbx','a'.repeat(64)].join('_');
    await fs.writeFile(path.join(root,'main.cjs'),secret);
    await assert.rejects(scan(root),error=>error.message.includes('local API key')&&!error.message.includes(secret));
    await fs.writeFile(path.join(root,'main.cjs'),'console.log("Safe runtime");');
    await fs.writeFile(path.join(root,'.env.production'),'SECRET=value');
    await assert.rejects(scan(root),/Private file cannot be distributed/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Distribution symlinks cannot reach files outside the package', {skip:process.platform==='win32'},async()=>{
  const {assertSafeDistributionTree:scan}=await load();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-dist-links-'));
  const external=await fs.mkdtemp(path.join(os.tmpdir(),'pbx-dist-external-'));
  try{
    await fs.writeFile(path.join(root,'module.cjs'),'module.exports={};');
    await fs.symlink('module.cjs',path.join(root,'alias.cjs'));
    assert.equal(await scan(root),2);
    await fs.writeFile(path.join(external,'private.txt'),'Private local data');
    await fs.symlink(path.join(external,'private.txt'),path.join(root,'outside.txt'));
    await assert.rejects(scan(root),/Unsafe symlink/);
  }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(external,{recursive:true,force:true});}
});
