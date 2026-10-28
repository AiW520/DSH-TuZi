# Cloud Bunny

English | [中文](README.zh.md)

The desktop helper and task-event adapter are adapted from `PC2005-cloud/dsh-pet` 0.3.8 (MIT). The upstream license is preserved in `LICENSE`. Its original animation, persona, meme and font assets are not included.

The seven cloud-bunny animations are the previously selected DSH-TuZi artwork. Configuration uses system fonts, disables unsolicited model calls and balance polling, and maps real Harness events to thinking, working, waiting, completion and error feedback. Click and drag feedback remain available.

Community changes: use the application's installed Electron executable, load a fixed bundled helper entry, open `dsh-tuzi://open`, use absolute helper document paths, and remove runtime downloads. Packaging compiles `src/index.ts` and inventories the resulting plugin before signing. The normal Harness profile loads the bundle; recovery can disable it with other optional plugins.

The upstream package archive SHA-256 is `475316d988c8acd48237ed10514e73b331b852f952ff11659f4250c439f85a27`. The macOS arm64 preview was tested against Harness 0.2.1-rc.3 through real installed-app sessions, including a tool call, waiting, failure and cancellation. Other operating systems are not covered by that result.
