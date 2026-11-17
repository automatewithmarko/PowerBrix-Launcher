const fs = require('node:fs/promises');
const path = require('node:path');
const {tmpdir} = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {downloadFile} = require('./downloads.cjs');

const run = promisify(execFile);
const model = {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  bytes: 77691713,
  sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
};
const maxAudioBytes = 90 * 16000 * 2 + 44;

async function findWhisper() {
  const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const bundled = process.resourcesPath && path.join(process.resourcesPath,'whisper');
  const folders = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (bundled) folders.unshift(bundled);
  if (process.platform === 'darwin') folders.push('/opt/homebrew/bin', '/usr/local/bin');
  for (const folder of folders) {
    const exe = path.join(folder, name);
    if (await fs.access(exe, fs.constants.X_OK).then(() => true, () => false)) return exe;
  }
  throw Error('Microphone Typing requires whisper-cli from whisper.cpp on this computer.');
}

async function speechModel(root, signal) {
  const file = path.join(root, 'plugins', 'microphone-typing', 'ggml-tiny.bin');
  await downloadFile(model.url, file, model, signal);
  return file;
}

async function transcribe(root, audio, signal) {
  if (!(audio instanceof Uint8Array) || audio.byteLength <= 44 || audio.byteLength > maxAudioBytes) {
    throw Error('Record up to 90 seconds of audio.');
  }
  const wav = Buffer.from(audio);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw Error('The audio recording was not recognized.');
  }
  const exe = await findWhisper();
  const weights = await speechModel(root, signal);
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'powerbrix-dictation-'));
  try {
    const input = path.join(directory, 'prompt.wav');
    const output = path.join(directory, 'transcript');
    await fs.writeFile(input, wav, {mode: 0o600});
    await run(exe, ['-m', weights, '-f', input, '-l', 'auto', '-t', '4', '-ng', '-otxt', '-of', output], {
      signal, timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true,
    }).catch(error => {
      if (signal.aborted) throw error;
      throw Error('Local transcription failed. Try recording again.');
    });
    return (await fs.readFile(output + '.txt', 'utf8')).trim().replace(/\s+/g, ' ').slice(0, 12000);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
}

module.exports = {speechModel, transcribe, findWhisper};
