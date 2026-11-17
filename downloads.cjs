const {createHash} = require('node:crypto');
const {createReadStream} = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');

async function fileSize(file) {
  return (await fs.stat(file).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }))?.size ?? 0;
}

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadFile(url, target, file, signal, onProgress = () => {}) {
  await fs.mkdir(path.dirname(target), {recursive:true});
  if (await fileSize(target) === file.bytes && await checksum(target) === file.sha256) {
    onProgress(file.bytes);
    return;
  }
  const partial = target + '.part';
  let offset = await fileSize(partial);
  if (offset > file.bytes) {
    await fs.rm(partial);
    offset = 0;
  }
  if (offset < file.bytes) {
    const response = await fetch(url, {signal, headers:offset ? {Range:'bytes='+offset+'-'} : {}});
    if (!response.ok || !response.body) throw new Error('Download returned HTTP '+response.status+'.');
    if (response.status === 206) {
      const range = response.headers.get('content-range');
      if (!range?.startsWith('bytes '+offset+'-') || !range.endsWith('/'+file.bytes)) {
        await response.body.cancel();
        throw new Error('The download host returned an unexpected byte range.');
      }
    } else {
      offset = 0;
    }
    let bytes = offset;
    const counter = new Transform({transform(chunk, _, done) {
      bytes += chunk.length;
      if (bytes > file.bytes) return done(new Error('Download exceeds its declared size.'));
      onProgress(bytes);
      done(null,chunk);
    }});
    await pipeline(Readable.fromWeb(response.body), counter, (await fs.open(partial, offset ? 'a':'w')).createWriteStream(), {signal});
  }
  await fs.chmod(partial,0o600);
  if (await fileSize(partial) !== file.bytes) throw new Error('The file is incomplete. Pull again to resume.');
  if (await checksum(partial) !== file.sha256) {
    await fs.rm(partial);
    throw new Error('Checksum mismatch. Pull again to retry the download.');
  }
  signal?.throwIfAborted();
  await fs.rename(partial,target);
  onProgress(file.bytes);
}

module.exports = {fileSize, checksum, downloadFile};
