# DSH-TuZi 社区预览版验收

[English](README.md) | 中文

DSH-TuZi 是基于 DeepSeek Harness 0.2.1-rc.3 的独立发行版，未经 DeepSeek 或 TuZi 官方背书。这些安装包用于预览测试，不属于面向所有用户的稳定版。自动更新保持关闭；每项下载均标明系统、架构、签名状态和 SHA-256。

- 自定义模型的图片输入建议依据供应商明确元数据、完整目录匹配和 TuZi 说明，保留手动选择。旧接口地址的异步响应不会修改新接口配置。
- 流式空闲超时为十分钟，临时错误最多重试八次；已有明确配置保持优先。TuZi 容量不足作为临时服务器错误处理，认证失败仍归为认证错误。
- 云朵兔复用 dsh-pet 的 MIT 事件和交互代码，采用独立素材，共用应用内置 Electron。Harness 会话驱动思考、工作、完成、等待、错误和取消反馈；本地眨眼和轻跳保留任务反馈，并支持减少动作。
- 应用标识、协议、设置及数据目录独立，可与原版共存。关闭上游遥测。下载页按操作系统选择，支持手动选择架构；没有匹配安装包时，不会用其他平台的包替代。

2026 年 10 月 28 日已挂载 macOS Apple Silicon DMG，复制到独立安装目录，执行 `codesign --verify --deep --strict` 后启动。安装后的 Harness 会话、工具调用和桌宠互动测试通过。该安装包使用临时签名，尚未经过 Apple 公证。

Windows x64 预览版通过[社区工作流](../../.github/workflows/community-build.yml)在原生 GitHub Windows runner 上构建并验收。NSIS 安装、安装后的 Harness 会话、工具调用、思考/工作/完成/错误/等待/取消、桌宠互动，以及卸载保留社区数据目录均通过。安装界面采用社区版名称与云朵兔图标，尚无发布者证书签名。此证据覆盖 runner 环境，不代表所有 Windows 硬件或安全软件配置。

两个平台的构建均通过包内 CLI 插件安装与移除、DOCX/XLSX/PPTX 转 PDF 冒烟测试。安装后的会话测试使用本地模拟供应商，未发现渲染页面脚本错误。完整构建、聚合 TypeScript 检查及相关打包环境测试通过。Windows ARM64、Intel Mac 和 Linux 安装包仍未完成验收。

此前经 TuZi 使用 `gpt-6.1-terra` 发送真实图片请求，约 76 秒成功识别二维码。该账户的模型列表未返回 Claude 路由，因此 Claude 真实兼容性尚未验证。Windows 打包验收没有重复该供应商请求，也不能证明网关长期稳定性。

文档同步有 42 项检查通过，仍有一项已有引用检查失败：`python/sdk/uv.lock:113` 的 wheel 文件大小被识别为提交号缩写。该项不宣称通过。

[Windows 发布工作流](../../.github/workflows/community-publish-windows.yml)接收已成功的社区验收运行和新的预览版标签。创建草稿前会核对源提交、必需测试、包版本、文件大小及 SHA-256，公开发布前还会比对上传产物的哈希。`node --test community/tests/publish-windows.mjs` 验证失败或不匹配的证据不能发布安装包。
