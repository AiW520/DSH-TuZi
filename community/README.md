# DSH-TuZi community edition

English | [中文](README.zh.md)

DSH-TuZi is an independent community distribution based on DeepSeek Harness. It is not an official release from DeepSeek or TuZi. Upstream copyright and license notices remain in place.

The community build uses the `DSH-TuZi` application name, application identifier `io.github.aiw520.dsh-tuzi`, `dsh-tuzi://open` protocol and `~/.dsh-tuzi` data directory. Set `DSH_TUZI_HOME` to an absolute directory for isolated testing. An inherited `DSH_HOME` does not redirect the community desktop into an upstream installation. Electron settings are stored under the `DSH-TuZi` application-support directory; `--user-data-dir` can override this for tests. The upstream `dsh` command installer is hidden in the community shell to avoid replacing an existing CLI.

Build an Apple Silicon test package from the repository root:

```sh
DSH_TUZI_COMMUNITY=1 pnpm run package:desktop:mac:arm64:unsigned
```

This command produces an ad-hoc-signed test application, not an Apple-notarized public release. It disables automatic updates and mandatory-update policy. Public releases require separate signing credentials, a community-owned update endpoint and installation qualification. No credentials belong in this directory, source control, build artifacts or the download page.

Model capability detection preserves explicit provider metadata, reads exact unambiguous installed catalog entries, and uses TuZi's public descriptions where available. Text/image capabilities are retained when a directory also declares audio or video. Manual declarations win over detected suggestions. Responses from a previous endpoint are discarded. Unknown aliases still require a manual selection or an explicit real request; model names alone cannot establish a gateway's supported request format.

The default pi-ai stream idle allowance is ten minutes with up to eight transient-error retries. This is not a guarantee against gateway disconnects. Real delayed-response, interruption, cancellation and tool-execution qualification is required before announcing provider stability.

The community shell disables session telemetry and upstream product analytics. The build carries the community title through both local and signed packaging profiles.

The [cloud-bunny adapter](pet/README.md) reuses MIT code from dsh-pet with separate artwork. It is loaded as a normal optional profile bundle and shares the installed Electron runtime. Removing the bundle persists across restarts; native recovery also disables it. The separate `dsh-tuzi-brand` bundle supplies sidebar and conversation branding through the existing slots.

Run `node community/tests/desktop-acceptance.mjs /absolute/path/to/DSH-TuZi` against an installed executable to test actual Harness sessions, tool execution, pet states and cancellation using a local mock provider. This is application integration evidence, not real-provider evidence. The [preview qualification](release-notes/README.md) separates those results.

The `site/` directory contains the standalone download page. Publish only artifacts that have completed qualification. The page reads `releases.json`; only qualified entries become direct installation downloads, and the GitHub releases link remains available when the manifest is empty or unavailable. Each published entry needs platform, architecture, version, HTTPS artifact URL, byte size, SHA-256 and signing status.

The download page reuses six animations from `pet/assets/webm/`, with matching static frames in `site/assets/`. Keep these copies synchronized when replacing the pet artwork. Its state buttons are local previews, not a connection to a running Harness session. Animations pause outside the viewport or when the page is hidden, can be paused manually, and start as static images when the system requests reduced motion. Unsupported video playback retains the static image.

The community qualification workflow builds Windows x64 on a native Windows runner. Its unsigned preview omits upstream mandatory-update policy. After NSIS installation, the workflow runs the installed Harness and desktop-pet tests sequentially and emits an artifact checksum and qualification record only on success. Windows downloads must remain unavailable until that record exists. Run `community/scripts/qualify-windows.ps1` on the disposable runner to repeat installation qualification. Set `DSH_COMMUNITY_EVIDENCE_DIR` to an existing directory to retain isolated test evidence there; otherwise tests use the operating system temporary directory.

The download page detects the operating system and supports manual system and architecture selection. It never infers Apple Silicon from a Mac browser label. Missing platform packages show an unavailable state rather than another system’s primary download. Mobile and unknown browsers require a selection. `node community/tests/download-page.mjs` checks these states with Playwright; `DSH_TEST_BROWSER_CHANNEL=chrome` selects an installed Chrome when bundled Chromium is unavailable.
