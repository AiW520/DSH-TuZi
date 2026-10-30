# DSH-TuZi community preview qualification

English | [中文](README.zh.md)

DSH-TuZi is an independent distribution based on DeepSeek Harness 0.2.1-rc.3, without endorsement from DeepSeek or TuZi. These are preview packages, not a general stable release. Automatic download and installation remain disabled; each download identifies its platform, architecture, signing status and SHA-256.

- Update reminders check after startup and every six hours, with manual checks, a 24-hour snooze and per-version ignore. Background failures retry quietly. Downloads open only after a click and match the installed OS and architecture. The installer embeds its full community version; older packages need one manual upgrade to obtain notifications.
- Custom-model image input suggestions use explicit provider metadata, unambiguous catalog matches and TuZi descriptions while preserving manual choices. Stale endpoint responses cannot change the new endpoint's configuration.
- Stream idle allowance is ten minutes with up to eight transient-error retries. Existing explicit settings remain authoritative. TuZi capacity failures are transient server failures; authentication failures remain authentication failures.
- Cloud Bunny reuses dsh-pet's MIT event and interaction code with separate artwork and the application's own Electron. Harness sessions drive thinking, working, completion, waiting, error and cancellation. Local blinking and hopping preserve task feedback; reduced motion remains available.
- Independent application identity, protocol, settings and data directory let the community desktop coexist with upstream. Upstream telemetry is disabled. The download page selects by operating system, supports manual architecture selection and never substitutes another platform's package when a matching download is unavailable.

On October 30, 2026, the macOS Apple Silicon DMG was mounted, copied to an independent installation, checked with `codesign --verify --deep --strict` and launched. Installed Harness sessions, tool calls and desktop-pet interactions passed. This package is ad-hoc signed and not Apple-notarized.

The Windows x64 preview is built and qualified on a native GitHub Windows runner through the [community workflow](../../.github/workflows/community-build.yml). NSIS installation, installed Harness sessions, tool calls, thinking/working/completion/error/waiting/cancellation, desktop-pet interactions and uninstall with community-home preservation passed. The installer carries the community name and bunny icon. It has no publisher certificate signature. This evidence covers the runner environment, not every Windows hardware or security-software configuration.

Both platform builds passed bundled CLI plugin installation/removal and DOCX/XLSX/PPTX-to-PDF smoke checks. Installed session tests use a local mock provider and report no renderer errors. Full build and aggregate TypeScript checks passed; targeted packaging environment tests passed. Windows ARM64, Intel Mac and Linux packages remain unqualified.

A prior real TuZi image request using `gpt-6.1-terra` correctly identified a QR code in about 76 seconds. The account's model listing returned no Claude routes, so live Claude compatibility is unverified. Windows packaging qualification does not repeat that provider request or establish long-run gateway availability.

Documentation synchronization has 42 passing checks and one pre-existing reference-check failure: the numeric wheel size at `python/sdk/uv.lock:113` is detected as a commit abbreviation. That check is not reported as passing.

The [Windows publication workflow](../../.github/workflows/community-publish-windows.yml) accepts a successful community qualification run and a new preview tag. It checks the source commit, required tests, package version, file length and SHA-256 before creating a draft, then compares the uploaded asset digest before publishing. `node --test community/tests/publish-windows.mjs` verifies that failed or mismatched evidence cannot publish an installer.
