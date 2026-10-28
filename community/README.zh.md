# DSH-TuZi 社区版

[English](README.md) | 中文

DSH-TuZi 是基于 DeepSeek Harness 的独立社区发行版，不是 DeepSeek 或 TuZi 的官方版本。保留上游版权及许可声明。

社区版使用 `DSH-TuZi` 应用名称、`io.github.aiw520.dsh-tuzi` 应用标识、`dsh-tuzi://open` 协议和 `~/.dsh-tuzi` 数据目录。独立测试时可将 `DSH_TUZI_HOME` 设为绝对路径。继承的 `DSH_HOME` 不会将社区桌面版指向原版数据。Electron 设置保存于应用支持目录下的 `DSH-TuZi`，测试时可用 `--user-data-dir` 覆盖。社区版隐藏上游 `dsh` 命令安装入口，避免覆盖已有 CLI。

在仓库根目录构建 Apple Silicon 测试包：

```sh
DSH_TUZI_COMMUNITY=1 pnpm run package:desktop:mac:arm64:unsigned
```

此命令生成临时签名的测试应用，不是经过 Apple 公证的正式发行版。测试包关闭自动升级及强制升级策略。正式发布需要独立签名凭据、社区自有升级地址以及安装验收。不得将凭据写入本目录、版本控制、安装产物或下载页。

模型能力识别保留供应商明确提供的元数据，使用内置目录中无歧义的完整模型标识，并在可用时读取 TuZi 的公开模型说明。模型目录同时声明音频或视频时，仍保留文本和图片能力。用户手动选择优先于检测建议；旧接口地址的异步返回会被丢弃。未知别名仍需手动选择或明确的真实请求验证，仅凭名称无法确定网关支持的请求格式。

pi-ai 默认允许流式连接空闲十分钟，并对临时错误最多重试八次。这不保证网关永不断线。宣布供应商稳定性前，仍需验收真实延迟、中断、取消及工具执行行为。

社区外壳关闭会话遥测及上游产品统计。本地和签名打包流程均保留社区版标题。

[云朵兔适配器](pet/README.zh.md) 复用 dsh-pet 的 MIT 代码，使用独立素材。它作为正常的可选配置组合包加载，共用应用内置的 Electron。移除组合包后重启不会重新添加，原生恢复流程也可将其禁用。独立的 `dsh-tuzi-brand` 组合包通过现有插槽提供侧边栏和会话品牌样式。

运行 `node community/tests/desktop-acceptance.mjs /absolute/path/to/DSH-TuZi`，指定已安装的可执行文件，可通过本地模拟供应商测试真实 Harness 会话、工具执行、桌宠状态及取消行为。这是应用集成证据，不等于真实供应商证据。[预览版验收说明](release-notes/README.zh.md) 分别记录两类结果。

`site/` 目录包含独立下载页。只发布通过验收的产物。页面读取 `releases.json`，只有通过验收的条目才显示安装包直链；清单为空或无法获取时，仍保留 GitHub 版本页面入口。每个发布条目必须包含平台、架构、版本、HTTPS 下载地址、字节大小、SHA-256 及签名状态。

下载页复用 `pet/assets/webm/` 中的六段动画，并在 `site/assets/` 中保存对应静态帧。更换桌宠素材时需同步这些副本。状态按钮仅供本地预览，不连接正在运行的 Harness 会话。动画在移出视口或页面隐藏时暂停，也可手动暂停；系统要求减少动态效果时默认显示静态图片。不支持视频播放时保留静态图片。

社区验收工作流在原生 Windows runner 上构建 Windows x64 安装包。未签名预览版不包含上游强制更新策略。完成 NSIS 安装后，工作流依次运行安装后的 Harness 和桌宠测试，只有全部成功才生成安装包校验值与验收记录。在出现该记录之前，Windows 下载必须保持不可用。在临时 runner 上运行 `community/scripts/qualify-windows.ps1` 可重新执行安装验收。将 `DSH_COMMUNITY_EVIDENCE_DIR` 设为已有目录，可在其中保留隔离的测试记录；不设置时使用系统临时目录。

下载页识别操作系统，并支持手动选择系统与芯片。不会根据 Mac 浏览器标识猜测 Apple Silicon。缺少对应安装包时显示暂未发布，不将其他系统的安装包作为主下载按钮；手机与未知浏览器需要手动选择。`node community/tests/download-page.mjs` 使用 Playwright 检查这些状态；没有内置 Chromium 时，可设置 `DSH_TEST_BROWSER_CHANNEL=chrome` 使用已安装的 Chrome。
