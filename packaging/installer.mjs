import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, rename, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packager} from '@electron/packager';
import {packageWhisper} from './whisper.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const product = 'PowerBrix Launcher';
const platform = process.argv[2];
const output = path.join(root, 'build');
const icon = path.join(root, 'assets', platform === 'mac' ? 'icon.icns' : 'icon.ico');

if (!['mac', 'win'].includes(platform)) throw new Error('Choose mac or win.');
if (platform === 'mac' && process.platform !== 'darwin') {
  throw new Error('A macOS host is required to make a DMG.');
}

function run(executable, args) {
  execFileSync(executable, args, {stdio: 'inherit'});
}

const stage = await mkdtemp(path.join(tmpdir(), 'powerbrix-launcher-'));
try {
  await mkdir(output, {recursive: true});
  const whisper = await packageWhisper(stage,platform);
  const [appDir] = await packager({
    extraResource: [whisper],
    dir: root,
    name: product,
    platform: platform === 'mac' ? 'darwin' : 'win32',
    arch: platform === 'mac' ? 'arm64' : 'x64',
    out: stage,
    prune: true,
    asar: true,
    icon,
    ignore: /^\/(build|installers|packaging|test)(\/|$)/,
    ...(platform === 'mac' ? {
      appBundleId: 'ai.powerbrix.infer',
      extendInfo: {NSMicrophoneUsageDescription: 'PowerBrix turns your voice into a chat prompt on this device.'},
    } : {
      win32metadata: {
        CompanyName: 'PowerBrix',
        FileDescription: product,
        ProductName: product,
        OriginalFilename: product + '.exe',
      },
    }),
  });

  if (platform === 'mac') {
    const bundle = path.join(appDir, product + '.app');
    const dmgName = 'PowerBrix-Launcher-macOS-arm64.dmg';
    const diskImage = path.join(stage, dmgName);
    run('xattr', ['-cr', bundle]);
    run('codesign', ['--force', '--deep', '--sign', '-', bundle]);
    run('codesign', ['--verify', '--deep', '--strict', bundle]);
    run('dmgbuild', ['-s', path.join(root, 'packaging', 'dmg-settings.py'),
      '-D', 'app=' + bundle,
      '-D', 'background=' + path.join(root, 'packaging', 'dmg-background.tiff'),
      '-D', 'icon=' + icon, product, diskImage]);
    await copyFile(diskImage, path.join(output, dmgName));
  } else {
    const option = process.platform === 'win32' ? '/' : '-';
    const installerName = 'PowerBrix-Launcher-Windows-x64-Setup.exe';
    const installerStage = await mkdtemp(path.join(output, '.setup-'));
    const stagedInstaller = path.join(installerStage, installerName);
    try {
      run('makensis', [
        option + 'WX',
        option + 'DAPP_DIR=' + appDir,
        option + 'DAPP_ICON=' + icon,
        option + 'DOUTPUT=' + stagedInstaller,
        path.join(root, 'packaging', 'windows.nsi'),
      ]);
      await rename(stagedInstaller, path.join(output, installerName));
    } finally {
      await rm(installerStage, {recursive: true, force: true});
    }
  }
} finally {
  await rm(stage, {recursive: true, force: true});
}
