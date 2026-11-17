const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {checkForUpdate,startUpdatePolling,compareVersions} = require('../updater.cjs');

const repository = 'automatewithmarko/PowerBrix-Launcher';
const origin = 'https://github.com/'+repository+'/releases/download/v0.1.10/';
const manifest = JSON.stringify({version:'0.1.10',name:'Chat improves'});
const asset = (name,content)=>({
  name,state:'uploaded',size:Buffer.byteLength(content),browser_download_url:origin+name,
  digest:'sha256:'+createHash('sha256').update(content).digest('hex'),
});
const release = {tag_name:'v0.1.10',draft:false,prerelease:false,assets:[
  asset('new-update.json',manifest),
  asset('PowerBrix-Launcher-macOS-arm64.dmg','mac installer'),
  asset('PowerBrix-Launcher-Windows-x64-Setup.exe','windows installer'),
]};
const api = (metadata=release,body=manifest) => async (url,options)=>{
  assert.ok(!new Headers(options?.headers).has('Authorization'));
  if (url==='https://api.github.com/repos/'+repository+'/releases/latest') return Response.json(metadata);
  assert.equal(url,origin+'new-update.json');
  return new Response(body);
};

test('public update discovery compares versions numerically and picks the matching platform asset',async()=>{
  assert.ok(compareVersions('0.1.10','0.1.9')>0);
  const mac = await checkForUpdate('0.1.9','darwin-arm64',api());
  const windows = await checkForUpdate('0.1.9','win32-x64',api());
  assert.equal(mac.name,'Chat improves');
  assert.ok(mac.installer.name.endsWith('.dmg'));
  assert.ok(windows.installer.name.endsWith('.exe'));
  assert.equal(await checkForUpdate('0.1.10','darwin-arm64',api()),null);
});

test('the updater ignores prereleases, inconsistent metadata and modified manifests',async()=>{
  assert.equal(await checkForUpdate('0.1.9','darwin-arm64',api({...release,prerelease:true})),null);
  assert.equal(await checkForUpdate('0.1.9','darwin-arm64',api(release,manifest.replace('Chat','Math'))),null);
  const invalid = structuredClone(release);
  invalid.assets[1].browser_download_url='https://example.com/download.dmg';
  assert.equal(await checkForUpdate('0.1.9','darwin-arm64',api(invalid)),null);
});

test('an open launcher discovers a release on the next minute check and stops on shutdown',async t=>{
  t.mock.timers.enable({apis:['setInterval','Date']});
  const controller = new AbortController();
  let version = '0.1.9';
  const checks = [];
  const updates = [];
  const request = async (url,options)=>{
    if (options.method !== 'HEAD') return api()(url,options);
    checks.push(url);
    return new Response(null,{status:302,headers:{
      Location:'https://github.com/'+repository+'/releases/tag/v'+version,
    }});
  };
  const settle = () => new Promise(resolve=>setImmediate(resolve));
  startUpdatePolling('0.1.9',update=>updates.push(update),{request,signal:controller.signal,target:'darwin-arm64'});
  await settle();
  assert.equal(checks.length,1);
  assert.equal(updates.length,0);
  version = '0.1.10';
  t.mock.timers.tick(59_999);
  assert.equal(checks.length,1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(updates[0]?.version,'0.1.10');
  assert.notEqual(checks[0],checks[1]);
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(updates.length,1);
  controller.abort();
  t.mock.timers.tick(60_000);
  assert.equal(checks.length,3);
});
