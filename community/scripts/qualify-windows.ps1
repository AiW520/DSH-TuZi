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
$uninstallers = @(Get-ChildItem -LiteralPath $destination -Filter 'Uninstall*.exe')
if ($uninstallers.Count -ne 1) { throw 'Expected one installed uninstaller.' }
$homeMarker = Join-Path $evidence 'preserved-home'
New-Item -ItemType Directory -Force $homeMarker | Out-Null
'keep user data' | Set-Content (Join-Path $homeMarker 'keep.txt')
$env:DSH_TUZI_HOME = $homeMarker
$uninstall = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList @('/S', "_?=$destination") -PassThru
if (-not $uninstall.WaitForExit(180000)) { Stop-Process -Id $uninstall.Id -Force; throw 'Uninstaller timed out.' }
if ($uninstall.ExitCode -ne 0 -or (Test-Path -LiteralPath $executable)) { throw 'Uninstall did not remove the application.' }
if (-not (Test-Path -LiteralPath (Join-Path $homeMarker 'keep.txt'))) { throw 'Uninstaller removed the protected community home.' }
$reports = @(Get-ChildItem -LiteralPath $evidence -Filter 'report.json' -Recurse | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json } | Where-Object { $_.updates.qualified -eq $true })
if ($reports.Count -ne 1) { throw 'Expected one installed update notification qualification report.' }
$communityVersion = $reports[0].updates.communityVersion
$expectedVersion = (Get-Content -LiteralPath 'community/release.json' -Raw | ConvertFrom-Json).version
if ($communityVersion -ne $expectedVersion) { throw 'Installed community identity differs from the source release.' }
$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $($installer.Name)" | Set-Content -Encoding utf8 (Join-Path $artifacts 'SHA256SUMS.txt')
@{ schemaVersion = 1; qualified = $true; communityVersion = $communityVersion; platform = 'Windows'; arch = 'x64'; sourceCommit = $env:GITHUB_SHA; runId = $env:GITHUB_RUN_ID; artifact = $installer.Name; bytes = $installer.Length; sha256 = $hash; signing = 'unsigned-test'; tests = @('NSIS silent installation', 'installed Harness sessions and task states', 'installed desktop pet interactions', 'uninstall preserves community home', 'installed update notifications') } | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $artifacts 'qualification.json')
