const {test} = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../packaging/mac-signing.mjs');
const identity = 'Developer ID Application: Example Publisher (ABCDEFGHIJ)';

test('Mac distribution cannot silently fall back to ad hoc signing', async () => {
  const {macSigningConfiguration: config} = await load();
  assert.equal(config({}), null);
  for (const env of [
    {POWERBRIX_REQUIRE_MAC_SIGNING:'1'},
    {POWERBRIX_APPLE_SIGNING_IDENTITY:identity},
    {POWERBRIX_NOTARY_PROFILE:'release'},
    {POWERBRIX_APPLE_SIGNING_IDENTITY:'-',POWERBRIX_NOTARY_PROFILE:'release'},
  ]) assert.throws(() => config(env));
  const valid = config({POWERBRIX_APPLE_SIGNING_IDENTITY:identity,POWERBRIX_NOTARY_PROFILE:'release'});
  assert.equal(valid.osxSign.optionsForFile('whisper-cli').hardenedRuntime, true);
  assert.deepEqual(valid.osxSign.optionsForFile('whisper-cli').entitlements, []);
  assert.ok(valid.osxSign.optionsForFile('app').entitlements.includes('com.apple.security.device.audio-input'));
  assert.equal(valid.osxNotarize.keychainProfile, 'release');
});

test('Rejected or failed notarization never staples or approves an installer', async () => {
  const {notarizeDiskImage} = await load();
  const config = {identity,notaryArgs:['--keychain-profile','release']};
  for (const status of ['Invalid','In Progress']) {
    const calls = [];
    assert.throws(() => notarizeDiskImage('app.dmg', config, (cmd,args) => {
      calls.push([cmd,...args]);
      return JSON.stringify({status,id:'submission'});
    }), /did not accept/);
    assert.equal(calls.some(call => call.includes('staple')), false);
  }
  assert.throws(() => notarizeDiskImage('app.dmg', config, () => {throw Error('Signing failed');}), /Signing failed/);
});

test('Accepted Mac installer must have a valid ticket and pass Gatekeeper', async () => {
  const {notarizeDiskImage} = await load();
  const calls = [];
  notarizeDiskImage('app.dmg',{identity,notaryArgs:[]},(cmd,args) => {
    calls.push([cmd,...args]);
    return JSON.stringify({status:'Accepted'});
  });
  assert.ok(calls[0].includes('--timestamp'));
  assert.deepEqual(calls.slice(-3).map(call => call.slice(0,3)), [
    ['xcrun','stapler','staple'],['xcrun','stapler','validate'],['spctl','--assess','--type'],
  ]);
});
