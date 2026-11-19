import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {appendFile, mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

// Only import distribution credentials into an ephemeral GitHub macOS runner.
if (process.platform !== 'darwin' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Apple CI credential setup is only supported on a GitHub macOS runner.');
}
for (const key of ['PBX_APPLE_CERTIFICATE','PBX_APPLE_CERTIFICATE_PASSWORD',
  'PBX_APPLE_API_KEY','PBX_APPLE_API_KEY_ID','PBX_APPLE_API_ISSUER',
  'POWERBRIX_APPLE_SIGNING_IDENTITY','RUNNER_TEMP','GITHUB_ENV']) {
  if (!process.env[key]?.trim()) throw new Error('Missing signing configuration: ' + key);
}
const directory = path.join(process.env.RUNNER_TEMP,'powerbrix-signing');
const keychain = path.join(process.env.RUNNER_TEMP,'powerbrix-signing.keychain-db');
const profile = 'powerbrix-launcher-release';
const password = randomBytes(32).toString('hex');
const run = (label, command, args) => {
  try {return execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
  catch {throw new Error('Apple signing setup failed: ' + label + '. No credential values have been logged.');}
};
await mkdir(directory,{recursive:true,mode:0o700});
try {
  const certificate = path.join(directory,'identity.p12');
  const key = path.join(directory,'notarization.p8');
  await writeFile(certificate,Buffer.from(process.env.PBX_APPLE_CERTIFICATE,'base64'),{mode:0o600});
  await writeFile(key,Buffer.from(process.env.PBX_APPLE_API_KEY,'base64'),{mode:0o600});
  run('create temporary keychain','security',['create-keychain','-p',password,keychain]);
  run('configure keychain','security',['set-keychain-settings','-lut','21600',keychain]);
  run('unlock keychain','security',['unlock-keychain','-p',password,keychain]);
  run('import Developer ID','security',['import',certificate,'-k',keychain,'-P',process.env.PBX_APPLE_CERTIFICATE_PASSWORD,'-T','/usr/bin/codesign','-T','/usr/bin/security']);
  run('allow automated signing','security',['set-key-partition-list','-S','apple-tool:,apple:,codesign:','-s','-k',password,keychain]);
  const existing = run('read keychain search list','security',['list-keychains','-d','user'])
    .match(/"([^"]+)"/g)?.map(value=>value.slice(1,-1)) || [];
  run('enable temporary signing keychain','security',['list-keychains','-d','user','-s',keychain,...existing]);
  run('validate and store notarization credentials','xcrun',['notarytool','store-credentials',profile,
    '--key',key,'--key-id',process.env.PBX_APPLE_API_KEY_ID,'--issuer',process.env.PBX_APPLE_API_ISSUER,
    '--keychain',keychain]);
  await appendFile(process.env.GITHUB_ENV,[
    'POWERBRIX_APPLE_KEYCHAIN='+keychain,
    'POWERBRIX_NOTARY_PROFILE='+profile,
    'POWERBRIX_REQUIRE_MAC_SIGNING=1',
    'POWERBRIX_APPLE_SIGNING_IDENTITY='+process.env.POWERBRIX_APPLE_SIGNING_IDENTITY,
    '',
  ].join('\n'));
  console.log('Developer ID imported; notarization credentials validated in the temporary keychain.');
} catch (error) {
  try {run('remove temporary keychain','security',['delete-keychain',keychain]);} catch {}
  throw error;
} finally {
  await rm(directory,{recursive:true,force:true});
}
