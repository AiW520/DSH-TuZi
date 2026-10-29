import { detectPlatform } from './release-platform.js';
import { loadReleases } from './release-manifest.js';
import { downloadHelp } from './download-help.js';

const list = document.getElementById('release-list');
const status = document.getElementById('release-status');
const detected = detectPlatform(navigator);
const system = document.getElementById('release-system');
const architecture = document.getElementById('release-architecture');
const detection = document.getElementById('release-detection');
let ready = [];
let loaded = false;
let loading = false;
const chipName = (platform, arch) => platform === 'macOS'
  ? arch === 'arm64' ? 'Apple Silicon（M 系列）' : 'Intel'
  : arch === 'arm64' ? 'ARM64' : 'x64（Intel / AMD）';

system.value = ['Windows', 'macOS', 'Linux'].includes(detected) ? detected : '';
detection.textContent = detected === 'mobile' ? '这是桌面应用，请选择电脑的系统后下载。'
  : detected ? `已识别 ${detected}，请确认芯片类型；也可以为其他电脑选择系统。`
    : '暂时无法识别系统，请手动选择你的电脑。';

function render() {
  if (!loaded) return;
  list.replaceChildren();
  if (!system.value) {
    status.textContent = '请选择系统';
    const message = document.createElement('p'); message.className = 'release-empty';
    message.textContent = '选择 Windows、macOS 或 Linux，查看对应的安装包。'; list.append(message);
    return;
  }
  const matches = ready.filter(entry => entry.platform === system.value && (!architecture.value || entry.arch === architecture.value));
  if (!matches.length) {
    status.textContent = '暂未发布';
    const title = document.createElement('h3'); title.textContent = system.value + (architecture.value ? ' · ' + chipName(system.value, architecture.value) : '');
    const message = document.createElement('p'); message.className = 'release-empty';
    message.textContent = '这个系统或芯片的安装包暂未通过发布验收。准备好后会在这里提供下载。';
    const hint = document.createElement('p'); hint.className = 'release-hint'; hint.textContent = '可以切换系统查看其他平台；其他平台的安装包不能用于当前电脑。';
    list.append(title, message, hint);
    return;
  }
  status.textContent = `${system.value} 可下载`;
  for (const entry of matches) {
    const article = document.createElement('article'); article.className = 'release-entry';
    const title = document.createElement('h3'); title.textContent = `${entry.platform} · ${chipName(entry.platform, entry.arch)}`;
    const version = document.createElement('p'); version.className = 'release-version'; version.textContent = `版本 ${entry.version} · ${(entry.bytes / 1024 / 1024).toFixed(1)} MiB`;
    const note = document.createElement('p');
    note.textContent = entry.signing === 'unsigned-test'
      ? entry.platform === 'macOS' ? '未公证预览版，安装时可能出现系统安全提示。' : '未签名预览版，Windows 可能提示未知发布者。'
      : entry.signing === 'notarized' ? '已签名并公证' : '已签名';
    if (entry.signing === 'unsigned-test') note.className = 'release-warning';
    const link = document.createElement('a'); link.className = 'button primary'; link.href = entry.url; link.rel = 'noopener noreferrer'; link.target = '_blank';
    link.textContent = `下载 ${entry.platform} ${entry.arch === 'arm64' && entry.platform === 'macOS' ? 'Apple Silicon' : entry.arch} 安装包 ↓`;
    const feedback = document.createElement('p'); feedback.className = 'download-feedback'; feedback.setAttribute('role', 'status');
    link.addEventListener('click', () => {
      feedback.textContent = '已请求 GitHub 下载，请查看浏览器下载列表。若没有开始或发生中断，请展开下方帮助；此页面无法读取下载进度。';
    });
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'SHA-256 校验值';
    const code = document.createElement('code'); code.textContent = entry.sha256; details.append(summary, code);
    article.append(title, version, note, link, feedback, downloadHelp(entry), details); list.append(article);
  }
}
system.addEventListener('change', () => { architecture.value = ''; render(); });
architecture.addEventListener('change', render);

async function load() {
  if (loading) return;
  loading = true;
  status.textContent = '加载版本信息';
  list.replaceChildren();
  const message = document.createElement('p'); message.className = 'release-empty'; message.textContent = '正在获取已验收的安装包…'; list.append(message);
  try {
    ready = await loadReleases({ onRetry: attempt => { message.textContent = `连接暂时不稳定，正在第 ${attempt}/3 次获取版本信息…`; } });
    loaded = true;
    render();
  } catch (error) {
    status.textContent = '下载信息暂不可用';
    message.textContent = '版本信息加载失败，可以重新加载，或通过下方 GitHub 查看已发布版本。';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'download-action'; retry.textContent = '重新加载版本信息';
    retry.addEventListener('click', load);
    list.append(retry);
    console.warn('Could not load the release manifest.', error);
  } finally {
    loading = false;
  }
}
await load();
