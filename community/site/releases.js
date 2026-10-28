/* Render only complete, explicitly qualified downloads from this site's manifest. */
async function showReleases() {
  try {
    const response = await fetch('releases.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Release manifest unavailable');
    const manifest = await response.json();
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.releases)) throw new Error('Invalid release manifest');
    const ready = manifest.releases.filter(entry => {
      if (!entry || entry.qualified !== true || !['notarized', 'signed', 'unsigned-test'].includes(entry.signing)) return false;
      if (!['macOS', 'Windows', 'Linux'].includes(entry.platform) || !['arm64', 'x64'].includes(entry.arch)) return false;
      if (typeof entry.version !== 'string' || !entry.version || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !/^[a-f0-9]{64}$/.test(entry.sha256)) return false;
      try { const url = new URL(entry.url); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
    });
    if (!ready.length) return;
    const list = document.getElementById('release-list');
    list.replaceChildren();
    for (const entry of ready) {
      const article = document.createElement('article'); article.className = 'release-entry';
      const title = document.createElement('h3'); title.textContent = `${entry.platform} · ${entry.arch} · ${entry.version}`;
      const note = document.createElement('p');
      const signing = { notarized: '已签名并公证', signed: '已签名', 'unsigned-test': '未公证测试包，仅供测试' };
      note.textContent = `${(entry.bytes / 1024 / 1024).toFixed(1)} MB · ${signing[entry.signing]}`;
      const link = document.createElement('a'); link.className = 'button primary'; link.href = entry.url; link.rel = 'noopener noreferrer'; link.textContent = `下载 ${entry.platform} 安装包 ↓`;
      const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'SHA-256 校验值';
      const code = document.createElement('code'); code.textContent = entry.sha256; details.append(summary, code);
      article.append(title, note, link, details); list.append(article);
    }
    document.getElementById('release-status').textContent = '版本可下载';
  } catch (error) {
    document.getElementById('release-status').textContent = '下载信息暂不可用';
    console.warn('Could not load the release manifest.', error);
  }
}
void showReleases();
