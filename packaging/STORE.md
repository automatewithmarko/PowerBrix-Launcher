# Microsoft Store distribution

Store distribution uses an MSIX package rather than the direct-download EXE.
Microsoft signs the package after certification. No Apple key, Windows signing
private key, PowerBrix API key, or GitHub token is needed in the MSIX or app source.

## First submission

1. Complete free Microsoft Store publisher enrollment and identity verification.
2. Reserve the product name **PowerBrix Launcher** in the publisher dashboard.
3. From **Product identity**, copy the exact package Identity Name, Identity
   Publisher, and PublisherDisplayName. These identifiers are public metadata.
4. Run the **Microsoft Store package** GitHub Actions workflow with those values.
   It checks credentials, runs tests, creates the Windows app, scans the runtime,
   generates correctly sized icon assets, and validates the MSIX with MakeAppx.
5. Download the `powerbrix-store-submission` artifact and upload its MSIX to the
   product submission. It is an unsigned ingestion package, not a trusted installer
   for sideloading. Microsoft certification and signing are still required.
6. Complete accurate listing metadata, privacy details, age ratings, capability
   explanations, and the live generative AI declaration before submission.
7. Validate the Store-installed app on Windows: analysis, model downloads and
   inference, CPU-only operation, GPU operation, microphone, projects/folder access,
   localhost API, shutdown/offload, and updating through Microsoft Store.

The first-launch description and reviewer notes must disclose additional model
downloads and the runtime engine downloads used for local inference. The product
must include a working way to report inappropriate generated content before
certification. Store policies apply to dynamically generated content as well.
Do not claim Windows S Mode compatibility without testing its engine requirements.

Store installs are detected using Electron's read-only `process.windowsStore`
property. They do not run the GitHub EXE updater or replace the protected package.
Updates for that channel must be built and submitted through Microsoft Store.
Direct-download Windows and Mac apps retain the existing GitHub updater.

Local build on Windows with the Windows SDK:

```powershell
$env:POWERBRIX_STORE_NAME = '<Identity Name from Partner Center>'
$env:POWERBRIX_STORE_PUBLISHER = '<Identity Publisher from Partner Center>'
$env:POWERBRIX_STORE_PUBLISHER_DISPLAY_NAME = '<PublisherDisplayName from Partner Center>'
npm ci
npm test
npm run package:store
```

The build rejects missing identity information. Never substitute invented package
identity values for an actual submission, and never upload secrets as workflow
inputs. The Store build workflow only accepts public publisher identifiers.
