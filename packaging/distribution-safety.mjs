import {readFile, readdir, realpath, stat} from 'node:fs/promises';
import path from 'node:path';

const runtimeFiles = new Set([
  'LICENSE','package.json','api.cjs','attachments.cjs','catalog.json','device.cjs',
  'dictation.cjs','downloads.cjs','engine.cjs','inference.cjs','main.cjs',
  'model-layouts.json','preload.cjs','projects.cjs','updater.cjs','web-search.cjs',
  'install-update.ps1','install-update.sh',
]);
const runtimeDirectories = new Set(['assets','renderer','node_modules']);
const privateDirectories = new Set(['.git','.ssh','.aws','.azure','.private_keys',
  'credentials','secrets','user-data','models']);

export function privateDistributionPath(file) {
  const parts = file.replaceAll('\\','/').split('/').filter(Boolean);
  return parts.some(part => privateDirectories.has(part.toLowerCase())) ||
    parts.some(part => /^\.env(?:\.|$)/i.test(part) || /^\.npmrc$/i.test(part) ||
      /\.(?:p8|p12|pfx|key|pem|keychain(?:-db)?|mobileprovision|provisionprofile|keystore|jks)$/i.test(part) ||
      /^(?:local-api|settings)\.json$/i.test(part));
}

export function ignoreApplicationPath(file) {
  const normalized = file.replaceAll('\\','/').replace(/^\/+/, '');
  if (!normalized) return false;
  if (privateDistributionPath(normalized)) return true;
  return !runtimeFiles.has(normalized) && !runtimeDirectories.has(normalized.split('/')[0]);
}

export function credentialType(bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const checks = [
    ['private key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----\s+[A-Za-z0-9+/=]{16,}/],
    ['Stripe credential', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/],
    ['GitHub credential', /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,}\b/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['local API key', /\bpbx_[a-f0-9]{64}\b/],
  ];
  return checks.find(([,pattern]) => pattern.test(content))?.[0] || null;
}

export async function assertSafeDistributionTree(root) {
  let count = 0;
  const base = await realpath(root);
  const visited = new Set();
  async function visit(directory, relative = '') {
    const actual = await realpath(directory);
    if (visited.has(actual)) return;
    visited.add(actual);
    for (const entry of await readdir(directory,{withFileTypes:true})) {
      const name = relative ? relative+'/'+entry.name : entry.name;
      if (privateDistributionPath(name)) throw new Error('Private file cannot be distributed: '+name);
      const full = path.join(directory,entry.name);
      let info = entry;
      if (entry.isSymbolicLink()) {
        const target = path.relative(base,await realpath(full));
        if (path.isAbsolute(target) || target === '..' || target.startsWith('..'+path.sep) || privateDistributionPath(target)) {
          throw new Error('Unsafe symlink in distribution: '+name);
        }
        info = await stat(full);
      }
      if (info.isDirectory()) await visit(full,name);
      else if (info.isFile()) {
        count++;
        const metadata = await stat(full);
        if (metadata.size <= 2*1024**2) {
          const type = credentialType(await readFile(full));
          if (type) throw new Error('Potential '+type+' in distribution: '+name);
        }
      }
    }
  }
  await visit(root);
  return count;
}
