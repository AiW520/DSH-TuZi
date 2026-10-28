/** Detect only the OS; browser CPU labels cannot reliably distinguish Apple Silicon from Intel. */
export function detectPlatform(navigator) {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (/Android|iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1)) return 'mobile';
  if (/Windows|Win32|Win64/i.test(platform + ' ' + ua)) return 'Windows';
  if (/macOS|Macintosh|MacIntel/i.test(platform + ' ' + ua)) return 'macOS';
  if (/Linux/i.test(platform + ' ' + ua)) return 'Linux';
  return null;
}

/** Accept complete qualified downloads whose file type agrees with their platform. */
export function qualifiedReleases(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.releases)) throw new Error('Invalid release manifest');
  return manifest.releases.filter(entry => {
    if (!entry || entry.qualified !== true || !['notarized', 'signed', 'unsigned-test'].includes(entry.signing)) return false;
    if (!['macOS', 'Windows', 'Linux'].includes(entry.platform) || !['arm64', 'x64'].includes(entry.arch)) return false;
    if (typeof entry.version !== 'string' || !entry.version || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !/^[a-f0-9]{64}$/.test(entry.sha256)) return false;
    try {
      const url = new URL(entry.url);
      const extension = { macOS: /\.dmg$/i, Windows: /\.exe$/i, Linux: /\.(AppImage|deb|rpm)$/i }[entry.platform];
      return url.protocol === 'https:' && !url.username && !url.password && extension.test(url.pathname);
    } catch { return false; }
  });
}
