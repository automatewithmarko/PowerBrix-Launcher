import {access, cp, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const xml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function storeManifest(identity, version) {
  const {name,publisher,publisherDisplayName}=identity || {};
  if (typeof name!=='string' || !/^[A-Za-z0-9.-]{3,50}$/.test(name) || /example|placeholder/i.test(name)) throw Error('Use the exact package identity name from Partner Center.');
  if (typeof publisher!=='string' || !publisher.startsWith('CN=') || publisher.length>256 || /[\r\n]/.test(publisher)) throw Error('Use the exact package publisher from Partner Center.');
  if (typeof publisherDisplayName!=='string' || !publisherDisplayName.trim() || publisherDisplayName.length>256 || /[\r\n]/.test(publisherDisplayName)) throw Error('Use the publisher display name from Partner Center.');
  const parts=version?.split('.');
  if (parts?.length!==3 || parts.some(part=>!/^\d+$/.test(part)||Number(part)>65535)) throw Error('The Store package needs a valid three-part app version.');
  const packageVersion=parts.map(Number).join('.')+'.0';
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
  <Identity Name="${xml(name)}" Publisher="${xml(publisher)}" Version="${packageVersion}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>PowerBrix Launcher</DisplayName>
    <PublisherDisplayName>${xml(publisherDisplayName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
  <Resources><Resource Language="en-us" /></Resources>
  <Applications>
    <Application Id="PowerBrixLauncher" Executable="app\\PowerBrix Launcher.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="PowerBrix Launcher" Description="Run local AI models on your computer." BackgroundColor="#201332" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" />
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <Capability Name="privateNetworkClientServer" />
    <rescap:Capability Name="runFullTrust" />
    <DeviceCapability Name="microphone" />
  </Capabilities>
</Package>
`;
}

export function storeIdentity(env=process.env) {
  return {name:env.POWERBRIX_STORE_NAME,publisher:env.POWERBRIX_STORE_PUBLISHER,publisherDisplayName:env.POWERBRIX_STORE_PUBLISHER_DISPLAY_NAME};
}

export async function packageStore(appDirectory,stage,output,root) {
  if (process.platform!=='win32') throw Error('Store packaging requires Windows and the Windows SDK.');
  const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const manifest=storeManifest(storeIdentity(),version);
  const layout=path.join(stage,'store-layout');
  await mkdir(layout,{recursive:true});
  await cp(appDirectory,path.join(layout,'app'),{recursive:true});
  await writeFile(path.join(layout,'AppxManifest.xml'),manifest);
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(root,'packaging','store-assets.ps1'),'-Icon',path.join(root,'assets','icon.png'),'-Destination',path.join(layout,'Assets')],{stdio:'inherit'});
  const sdkRoot=path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)','Windows Kits','10','bin');
  const versions=(await readdir(sdkRoot)).filter(name=>/^10\.\d+\.\d+\.\d+$/.test(name)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  let makeappx;
  for(const version of versions){const file=path.join(sdkRoot,version,'x64','makeappx.exe');if(await access(file).then(()=>true,()=>false)){makeappx=file;break;}}
  if(!makeappx)throw Error('Install the Windows SDK with MakeAppx to create the Store package.');
  const file=path.join(output,'PowerBrix-Launcher-Windows-x64-Store.msix');
  execFileSync(makeappx,['pack','/d',layout,'/p',file,'/o'],{stdio:'inherit'});
  console.log('Unsigned Store submission package created. Microsoft signs it after certification; this is not a trusted sideload installer.');
}
