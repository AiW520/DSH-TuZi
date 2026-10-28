# Run on a disposable Windows CI runner after packaging. Only qualified bytes are published.
$ErrorActionPreference = 'Stop'
$artifacts = Join-Path $PWD 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'
$installers = @(Get-ChildItem -LiteralPath $artifacts -Filter 'dsh-tuzi-*-unsigned.exe')
if ($installers.Count -ne 1) { throw 'Expected exactly one community NSIS installer.' }
$installer = $installers[0]
$destination = Join-Path $env:RUNNER_TEMP ('dsh-tuzi-installed-' + [Guid]::NewGuid().ToString('N'))
$evidence = Join-Path $PWD 'community-qualification'
New-Item -ItemType Directory -Force $evidence | Out-Null
$env:DSH_COMMUNITY_EVIDENCE_DIR = $evidence
$process = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$destination") -PassThru
if (-not $process.WaitForExit(300000)) { Stop-Process -Id $process.Id -Force; throw 'Installer timed out.' }
if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)." }
$executable = Join-Path $destination 'DSH-TuZi.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Installer did not create the application executable.' }
# Desktop GUI tests run sequentially because native display and pointer state is shared.
node community/tests/desktop-acceptance.mjs $executable
if ($LASTEXITCODE -ne 0) { throw 'Installed Harness integration failed.' }
node community/tests/desktop-pet-interactions.mjs $executable --installed
if ($LASTEXITCODE -ne 0) { throw 'Installed desktop pet interactions failed.' }
$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $($installer.Name)" | Set-Content -Encoding utf8 (Join-Path $artifacts 'SHA256SUMS.txt')
@{ schemaVersion = 1; qualified = $true; platform = 'Windows'; arch = 'x64'; sourceCommit = $env:GITHUB_SHA; runId = $env:GITHUB_RUN_ID; artifact = $installer.Name; bytes = $installer.Length; sha256 = $hash; signing = 'unsigned-test'; tests = @('NSIS silent installation', 'installed Harness sessions and task states', 'installed desktop pet interactions') } | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $artifacts 'qualification.json')
