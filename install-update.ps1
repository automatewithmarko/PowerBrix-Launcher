$ErrorActionPreference = 'Stop'
$install = Split-Path -Parent $env:PBX_DESTINATION
$backup = $install + '.previous-' + [System.Guid]::NewGuid()
$profileArg = '"--user-data-dir=' + $env:PBX_ROOT + '"'
$moved = $false
try {
    $old = Get-Process -Id ([int]$env:PBX_PID) -ErrorAction SilentlyContinue
    if ($old -and !$old.WaitForExit(120000)) { throw 'The launcher did not close.' }
    Move-Item -LiteralPath $install -Destination $backup
    $moved = $true
    $setup = Start-Process -FilePath $env:PBX_IMAGE -ArgumentList '/S' -PassThru -Wait
    if ($setup.ExitCode -ne 0 -or !(Test-Path -LiteralPath $env:PBX_DESTINATION)) {
        throw 'Windows setup could not install the update.'
    }
    Start-Process -FilePath $env:PBX_DESTINATION -ArgumentList $profileArg
    $moved = $false
    Remove-Item -LiteralPath $backup,$env:PBX_FOLDER -Recurse -Force -ErrorAction SilentlyContinue
} catch {
    'Could not install the update. Try again.' | Set-Content -LiteralPath $env:PBX_REPORT
    if ($moved) {
        if (Test-Path -LiteralPath $install) { Remove-Item -LiteralPath $install -Recurse -Force }
        Move-Item -LiteralPath $backup -Destination $install
    }
    if (Test-Path -LiteralPath $env:PBX_DESTINATION) { Start-Process -FilePath $env:PBX_DESTINATION -ArgumentList $profileArg }
}
