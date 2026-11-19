# Credentials and distribution

PowerBrix publisher credentials are not application settings. Apple notarization
keys and signing private keys stay in encrypted GitHub Actions secrets and a
temporary build-runner keychain. They are never needed by users, the updater, or
the public repository. The Windows signing service will use a separate build-only
publisher identity when configured.

Signing certificates and notarization tickets attached to an installer are public
verification data. They let the operating system verify the publisher; they do
not contain the private keys needed to sign another application.

The API plugin generates a random local API key on each user's own installation.
It is not a shared PowerBrix company credential. Its configuration is saved in that
user's profile, outside the application and source tree, with restrictive file
permissions. The API listens on localhost and requires Bearer authentication.

Repository secret scanning and push protection help prevent accidental exposure.
CI checks all Git history with Gitleaks and blocks release builds on findings.
Application packaging uses a runtime allowlist, excludes credential files and
user profiles, and scans the copied runtime before creating its ASAR archive.
Source exports also exclude private credential formats and local settings.

Never commit `.env` files, private keys, certificate exports, API credentials,
cloud credential folders, user profiles, or model downloads. Store build secrets
in GitHub Actions secrets. If a secret is ever exposed, revoke/rotate it first;
removing the latest copy from source does not remove it from Git history.

To report a security issue privately, use the repository's Security tab and choose
"Report a vulnerability" when available. Do not paste keys or private data into
public issues, discussions, screenshots, logs, or pull requests.
