const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFile,spawn} = require('node:child_process');
const {promisify} = require('node:util');
const {downloadFile} = require('./downloads.cjs');

const run = promisify(execFile);
const repository = 'automatewithmarko/PowerBrix-Launcher';
const latestReleaseUrl = 'https://github.com/'+repository+'/releases/latest';
const updateInterval = 60_000;
const filenames = {
  'darwin-arm64': 'PowerBrix-Launcher-macOS-arm64.dmg',
  'win32-x64': 'PowerBrix-Launcher-Windows-x64-Setup.exe',
};
const versionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

function compareVersions(first, second) {
  if (!versionPattern.test(first) || !versionPattern.test(second)) throw Error('Invalid launcher version.');
  const left = first.split('.').map(Number);
  const right = second.split('.').map(Number);
  return left[0]-right[0] || left[1]-right[1] || left[2]-right[2];
}

function releaseAsset(release, name) {
  const asset = release.assets?.find(item=>item.name===name && item.state==='uploaded');
  const url = 'https://github.com/'+repository+'/releases/download/'+release.tag_name+'/'+name;
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
      || !Number.isSafeInteger(asset.size) || asset.size<1 || asset.browser_download_url!==url) return null;
  return {name,url,bytes:asset.size,sha256:asset.digest.slice(7)};
}

async function checkForUpdate(current, target=process.platform+'-'+process.arch, request=fetch) {
  if (!filenames[target]) return null;
  const signal = AbortSignal.timeout(12000);
  const response = await request('https://api.github.com/repos/'+repository+'/releases/latest',{
    signal,headers:{Accept:'application/vnd.github+json','User-Agent':'PowerBrix-Launcher'},
  });
  if (!response.ok) return null;
  const release = await response.json();
  if (release.draft || release.prerelease || !release.tag_name?.startsWith('v')) return null;
  const version = release.tag_name.slice(1);
  if (!versionPattern.test(version) || compareVersions(version,current)<=0) return null;
  const manifest = releaseAsset(release,'new-update.json');
  const installer = releaseAsset(release,filenames[target]);
  if (!manifest || !installer || manifest.bytes>4096 || installer.bytes>1024**3) return null;
  const manifestResponse = await request(manifest.url,{signal});
  if (!manifestResponse.ok) return null;
  const bytes = Buffer.from(await manifestResponse.arrayBuffer());
  if (bytes.length!==manifest.bytes || createHash('sha256').update(bytes).digest('hex')!==manifest.sha256) return null;
  const info = JSON.parse(bytes);
  if (info.version!==version || typeof info.name!=='string' || !info.name.trim() || info.name.length>100) return null;
  return {version,name:info.name.trim(),installer};
}

function startUpdatePolling(current, onUpdate, {request=fetch, signal, target=process.platform+'-'+process.arch} = {}) {
  let pending = false;
  let publishedVersion;
  async function poll() {
    if (pending || signal?.aborted) return;
    pending = true;
    try {
      const timeout = AbortSignal.timeout(12_000);
      // Give each minute its own URL so intermediaries cannot replay an older redirect.
      const releaseCheckUrl = latestReleaseUrl+'?launcher-update='+Math.floor(Date.now()/updateInterval);
      const response = await request(releaseCheckUrl,{
        method:'HEAD',redirect:'manual',cache:'no-cache',
        signal:signal ? AbortSignal.any([signal,timeout]) : timeout,
      });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) return;
      const release = new URL(location,latestReleaseUrl);
      const prefix = '/'+repository+'/releases/tag/v';
      if (release.origin !== 'https://github.com' || !release.pathname.startsWith(prefix)) return;
      const version = release.pathname.slice(prefix.length);
      if (!versionPattern.test(version) || compareVersions(version,current) <= 0 || version === publishedVersion) return;
      const update = await checkForUpdate(current,target,request);
      if (!update || update.version !== version || signal?.aborted) return;
      if (onUpdate(update) !== false) publishedVersion = version;
    } catch {
      // The next interval retries transient network errors.
    } finally { pending = false; }
  }
  void poll();
  const timer = setInterval(poll,updateInterval);
  timer.unref?.();
  signal?.addEventListener('abort',()=>clearInterval(timer),{once:true});
  return timer;
}

async function installedApp(executable) {
  if (process.platform==='darwin') {
    const bundle = path.resolve(path.dirname(executable),'../..');
    if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/')) throw Error('Move PowerBrix Launcher to Applications before updating.');
    await fs.access(path.dirname(bundle),fs.constants.W_OK);
    return bundle;
  }
  const installed = path.join(process.env.LOCALAPPDATA || '', 'Programs','PowerBrix','Launcher','PowerBrix Launcher.exe');
  if (path.resolve(executable).toLowerCase()!==path.resolve(installed).toLowerCase()) {
    throw Error('Install PowerBrix Launcher with the Windows setup before updating.');
  }
  return installed;
}

async function stageMac(image, destination, folder, version) {
  const mount = path.join(folder,'disk');
  await fs.mkdir(mount,{recursive:true});
  const staging = await fs.mkdtemp(path.join(path.dirname(destination),'.powerbrix-update-'));
  try {
    await run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,image],{timeout:90000});
    try {
      const bundle = path.join(staging,'PowerBrix Launcher.app');
      await run('/usr/bin/ditto',[path.join(mount,'PowerBrix Launcher.app'),bundle],{timeout:90000});
      const plist = path.join(bundle,'Contents','Info.plist');
      const read = async key=>(await run('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist])).stdout.trim();
      if (await read('CFBundleIdentifier')!=='ai.powerbrix.infer' || await read('CFBundleShortVersionString')!==version) {
        throw Error('The downloaded Mac app does not match the release.');
      }
      await run('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{timeout:90000});
      return {staging,bundle};
    } finally {
      await run('/usr/bin/hdiutil',['detach',mount],{timeout:30000}).catch(()=>{});
    }
  } catch(error) {
    await fs.rm(staging,{recursive:true,force:true});
    throw error;
  }
}

async function prepareUpdate(update, root, executable, progress, signal) {
  const destination = await installedApp(executable);
  const folder = path.join(root,'updates',update.version);
  const image = path.join(folder,update.installer.name);
  await downloadFile(update.installer.url,image,update.installer,signal,bytes=>progress({
    phase:'downloading',percent:Math.floor(bytes/update.installer.bytes*100),
  }));
  progress({phase:'installing',percent:100});
  const mac = process.platform==='darwin' ? await stageMac(image,destination,folder,update.version) : null;
  return {root,folder,image,destination,mac};
}

async function launchInstaller(prepared, pid=process.pid) {
  const {root,folder,image,destination,mac} = prepared;
  const report = path.join(root,'update-error.txt');
  await fs.rm(report,{force:true});
  const env = {...process.env, PBX_PID:String(pid), PBX_IMAGE:image, PBX_DESTINATION:destination,
    PBX_REPORT:report, PBX_ROOT:root, PBX_FOLDER:folder, PBX_STAGE:mac?.staging || '', PBX_BUNDLE:mac?.bundle || ''};
  delete env.ELECTRON_RUN_AS_NODE;
  let executable, args;
  if (mac) {
    executable='/bin/sh';
    const script=path.join(folder,'install-update.sh');
    await fs.copyFile(path.join(__dirname,'install-update.sh'),script);
    args=[script];
  } else {
    executable=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const script=await fs.readFile(path.join(__dirname,'install-update.ps1'),'utf8');
    args=['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
  }
  await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{env,cwd:folder,detached:true,stdio:'ignore',windowsHide:true});
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve();});
  });
}

module.exports = {checkForUpdate,startUpdatePolling,compareVersions,prepareUpdate,launchInstaller};
