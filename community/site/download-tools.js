/** Build optional recovery commands only for versioned assets in this community repository.
 * @param {object} entry A qualified release from the page manifest.
 * @returns {object|null} Commands and the release page, or null for an unsupported URL.
 */
export function downloadTools(entry) {
  const url = new URL(entry.url);
  const prefix = '/AiW520/DSH-TuZi/releases/download/';
  const parts = url.pathname.slice(prefix.length).split('/');
  if (url.origin !== 'https://github.com' || url.username || url.password || !url.pathname.startsWith(prefix)
    || url.search || url.hash || parts.length !== 2
    || !/^[\w.-]+$/.test(parts[0]) || !/^[\w][\w.-]+$/.test(parts[1])
    || !/^[a-f0-9]{64}$/.test(entry.sha256)) return null;
  const filename = parts[1];
  const windows = entry.platform === 'Windows';
  // All interpolated values are restricted to shell-literal-safe characters above.
  const curl = `${windows ? 'curl.exe' : 'curl'} --location --fail --proto '=https' --proto-redir '=https' --connect-timeout 30 --speed-limit 1024 --speed-time 90 --retry 8 --retry-delay 3 --retry-max-time 1800 --continue-at - --output '${filename}.part' '${url.href}'`;
  const resume = windows ? `& {
  $ErrorActionPreference = 'Stop'
  if (Test-Path -LiteralPath '${filename}') { throw 'File already exists. Keep or move it before downloading.' }
  ${curl}
  if ($LASTEXITCODE -ne 0) { throw 'Download interrupted. Run this command again in the same folder to resume.' }
  if ((Get-FileHash -LiteralPath '${filename}.part' -Algorithm SHA256).Hash -ine '${entry.sha256}') { throw 'SHA-256 mismatch. Do not install. Remove the .part file before retrying.' }
  Move-Item -LiteralPath '${filename}.part' -Destination '${filename}'
  Write-Host 'SHA-256 verified: ${filename}'
}` : `(
  if [ -e '${filename}' ]; then printf '%s\\n' 'File already exists. Keep or move it before downloading.'; exit 1; fi
  ${curl} &&
  printf '%s  %s\\n' '${entry.sha256}' '${filename}.part' | ${entry.platform === 'macOS' ? 'shasum -a 256' : 'sha256sum'} -c - &&
  mv -n '${filename}.part' '${filename}'
)`;
  return {
    filename,
    releaseUrl: `https://github.com/AiW520/DSH-TuZi/releases/tag/${parts[0]}`,
    resume,
    parallel: `aria2c --continue=true --split=4 --max-connection-per-server=4 --min-split-size=8M --max-tries=8 --retry-wait=5 --connect-timeout=30 --timeout=90 --check-integrity=true --auto-file-renaming=false --allow-overwrite=false --checksum=sha-256=${entry.sha256} --out='${filename}' '${url.href}'`,
  };
}
