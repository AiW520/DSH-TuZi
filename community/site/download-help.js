import { downloadTools } from './download-tools.js';

/** Attach selectable text even when clipboard access is unavailable or denied. */
function copyControl(label, value, multiline = false) {
  const wrapper = document.createElement('div'); wrapper.className = 'download-copy';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'download-action'; button.textContent = label;
  const field = document.createElement('textarea'); field.readOnly = true; field.value = value;
  field.rows = multiline ? 7 : 2; field.setAttribute('aria-label', label.replace('复制', '') + '内容');
  const feedback = document.createElement('span'); feedback.className = 'download-feedback'; feedback.setAttribute('role', 'status');
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value);
      feedback.textContent = '已复制';
    } catch (error) {
      // Clipboard permissions vary; keep the exact text available for manual copying.
      field.focus(); field.select();
      feedback.textContent = '请复制已选中的内容';
    }
  });
  wrapper.append(button, feedback, field);
  return wrapper;
}

/** Create download recovery help for a qualified asset without proxying its bytes.
 * @param {object} entry A qualified release.
 * @returns {HTMLElement} A collapsed help panel.
 */
export function downloadHelp(entry) {
  const details = document.createElement('details'); details.className = 'download-help';
  const summary = document.createElement('summary'); summary.textContent = '下载慢或中断？试试这些办法';
  const hint = document.createElement('p');
  hint.textContent = '先在浏览器下载列表中尝试“继续”。也可以复制原始链接到支持续传的下载工具；链接始终来自本项目的 GitHub Release。';
  details.append(summary, hint, copyControl('复制下载链接', entry.url));
  const tools = downloadTools(entry);
  if (!tools) return details;
  const release = document.createElement('a'); release.href = tools.releaseUrl; release.target = '_blank'; release.rel = 'noopener noreferrer';
  release.className = 'download-release'; release.textContent = '打开此版本的 GitHub 页面 ↗';
  details.append(release);
  const advanced = document.createElement('details'); advanced.className = 'download-advanced';
  const title = document.createElement('summary'); title.textContent = '进阶：断点续传与多连接下载';
  const explanation = document.createElement('p');
  explanation.textContent = `${entry.platform === 'Windows' ? '在 PowerShell' : '在终端'}的下载目录运行以下命令。临时错误最多重试 8 次；中断后在同一目录再次运行可续传，SHA-256 校验通过才生成安装包。校验失败时请删除对应 .part 文件后重试。同名安装包已存在时会停止。`;
  const parallelHint = document.createElement('p'); parallelHint.textContent = '已安装 aria2 的用户可选下面的 4 连接下载命令，包含续传、重试与完整性校验。请勿与上面的命令同时运行。是否提速取决于网络，不能绕过 GitHub 无法访问的问题。';
  advanced.append(title, explanation, copyControl('复制续传命令', tools.resume, true), parallelHint, copyControl('复制 aria2 命令', tools.parallel, true));
  details.append(advanced);
  return details;
}
