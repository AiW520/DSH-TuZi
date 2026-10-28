# Cloud Bunny

English | [中文](README.zh.md)

The desktop helper and task-event adapter are adapted from `PC2005-cloud/dsh-pet` 0.3.8 (MIT). The upstream license is preserved in `LICENSE`. Its original animation, persona, meme and font assets are not included.

The seven cloud-bunny animations are the previously selected DSH-TuZi artwork. Configuration uses system fonts, disables unsolicited model calls and balance polling, and maps real Harness events to thinking, working, waiting, completion and error feedback. Click and drag feedback remain available.

Community changes: use the application's installed Electron executable, load a fixed bundled helper entry, open `dsh-tuzi://open`, use absolute helper document paths, and remove runtime downloads. Packaging compiles `src/index.ts` and inventories the resulting plugin before signing. The normal Harness profile loads the bundle; recovery can disable it with other optional plugins.

The upstream package archive SHA-256 is `475316d988c8acd48237ed10514e73b331b852f952ff11659f4250c439f85a27`. The macOS arm64 preview was tested against Harness 0.2.1-rc.3 through real installed-app sessions, including a tool call, waiting, failure and cancellation. Other operating systems are not covered by that result.

Clicking the desktop bunny adds a small hop without changing the current task or desktop position. It blinks while idle; the right-click menu offers blinking, hopping and reduced motion. Reduced motion is saved locally and also follows the system preference: task pictures and messages still update while videos stay paused. Dragging, task transitions, freezing and disposal cancel cosmetic reactions. Restarting the helper restores the current task without replaying old commands. The closed-eye WebP is derived from generated cloud-bunny artwork.

Run `node community/tests/desktop-pet-interactions.mjs <electron-executable>` to check the helper, or append `--installed` with an installed DSH-TuZi executable to check the packaged plugin. The fixture uses an isolated profile and local task-state server; it does not call a model provider.
