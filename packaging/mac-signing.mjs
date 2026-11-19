export function macSigningConfiguration(env = process.env) {
  const identity = env.POWERBRIX_APPLE_SIGNING_IDENTITY?.trim();
  const profile = env.POWERBRIX_NOTARY_PROFILE?.trim();
  const required = env.POWERBRIX_REQUIRE_MAC_SIGNING === '1';
  if (!identity && !profile && !required) return null;
  if (!identity || !profile) {
    throw new Error('Mac distribution requires both a Developer ID identity and a notarization keychain profile.');
  }
  if (!identity.startsWith('Developer ID Application: ')) {
    throw new Error('Use a Developer ID Application certificate for Mac distribution.');
  }
  const keychain = env.POWERBRIX_APPLE_KEYCHAIN?.trim();
  return {
    identity,
    osxSign: {
      identity,
      ...(keychain ? {keychain} : {}),
      optionsForFile: file => ({
        hardenedRuntime: true,
        entitlements: file.endsWith('whisper-cli') ? [] : [
          'com.apple.security.cs.allow-jit',
          'com.apple.security.device.audio-input',
        ],
      }),
    },
    osxNotarize: {keychainProfile: profile, ...(keychain ? {keychain} : {})},
    notaryArgs: ['--keychain-profile', profile, ...(keychain ? ['--keychain', keychain] : [])],
  };
}

export function notarizeDiskImage(file, configuration, run) {
  run('codesign', ['--force', '--timestamp', '--sign', configuration.identity, file]);
  run('codesign', ['--verify', '--strict', file]);
  const result = JSON.parse(run('xcrun', ['notarytool', 'submit', file,
    ...configuration.notaryArgs, '--wait', '--output-format', 'json']));
  if (result.status !== 'Accepted') {
    throw new Error('Apple did not accept the disk image for notarization. Submission: ' + (result.id || 'unknown'));
  }
  run('xcrun', ['stapler', 'staple', file]);
  run('xcrun', ['stapler', 'validate', file]);
  run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', file]);
}
