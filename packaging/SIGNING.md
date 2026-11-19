# Distribution signing

Mac release builds use the publisher's Developer ID Application identity, hardened
runtime, Apple notarization, and stapled tickets on both the app and DMG. The
workflow verifies the nested code, tickets, and Gatekeeper assessment before
uploading an installer. Signing or notarization failure blocks publication.

The release repository uses `POWERBRIX_MAC_SIGNING=enabled` and
`POWERBRIX_APPLE_SIGNING_IDENTITY` as Actions variables. Encrypted Actions secrets:

- `PBX_APPLE_CERTIFICATE`: base64-encoded Developer ID PKCS#12 export.
- `PBX_APPLE_CERTIFICATE_PASSWORD`: its export password.
- `PBX_APPLE_API_KEY`: base64-encoded dedicated notarization API private key.
- `PBX_APPLE_API_KEY_ID`: that key's identifier.
- `PBX_APPLE_API_ISSUER`: the App Store Connect team's issuer identifier.

The setup script imports credentials into an ephemeral runner keychain, validates
Apple access, and removes temporary credential files. The workflow deletes the
keychain after packaging. No credential belongs in source, release assets, logs,
or the application bundle. Never enable shell command tracing in credential steps.

For local signed packaging, set `POWERBRIX_APPLE_SIGNING_IDENTITY` and
`POWERBRIX_NOTARY_PROFILE` to an existing Developer ID and validated `notarytool`
keychain profile. `POWERBRIX_APPLE_KEYCHAIN` can select a specific keychain.
`POWERBRIX_REQUIRE_MAC_SIGNING=1` rejects incomplete configuration. Unconfigured
local development builds retain ad hoc signing and are not notarized.

Windows currently uses the existing unsigned EXE distribution. Apple credentials
do not sign Windows installers. Trusted Authenticode signing requires its own
validated publisher setup; SmartScreen reputation is separate from signature
validity. No paid Windows signing service is enabled by this workflow.
