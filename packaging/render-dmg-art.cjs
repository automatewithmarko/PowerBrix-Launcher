const {app, BrowserWindow} = require('electron');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {mkdtemp, rm, writeFile} = require('node:fs/promises');
const {tmpdir} = require('node:os');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'powerbrix-dmg-art-'));
  const window = new BrowserWindow({
    width: 800, height: 460, useContentSize: true, show: false,
    webPreferences: {offscreen: true, backgroundThrottling: false},
  });
  try {
    await window.loadFile(path.join(__dirname, 'dmg-art.html'));
    await window.webContents.executeJavaScript(`(async()=>{
      await document.fonts.ready;
      const finish=Date.now()+4000;
      while (document.querySelector('canvas')?.hidden !== false) {
        if (Date.now()>finish) throw Error('The PowerBrix waves did not render');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    })()`);
    const debug = window.webContents.debugger;
    debug.attach('1.3');
    await debug.sendCommand('Emulation.setEmulatedMedia', {
      features: [{name: 'prefers-reduced-motion', value: 'reduce'}],
    });
    const frames = [];
    for (const scale of [1, 2]) {
      await debug.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: 800, height: 460, deviceScaleFactor: scale, mobile: false,
      });
      const frame = await debug.sendCommand('Page.captureScreenshot', {format: 'png'});
      const file = path.join(scratch, 'art-' + scale + '.png');
      await writeFile(file, Buffer.from(frame.data, 'base64'));
      frames.push(file);
    }
    execFileSync('tiffutil', ['-cathidpicheck', ...frames, '-out', path.join(__dirname, 'dmg-background.tiff')]);
  } finally {
    window.destroy();
    await rm(scratch, {recursive: true, force: true});
  }
}).then(() => app.quit(), error => {console.error(error);app.exit(1);});
