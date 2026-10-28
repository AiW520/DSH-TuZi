# DSH-TuZi community preview 1

English | [中文](README.zh.md)

Independent community distribution based on DeepSeek Harness 0.2.1-rc.3. This project is not endorsed by DeepSeek or TuZi. The first artifact targets macOS Apple Silicon and is ad-hoc signed, without Developer ID signing or Apple notarization. It is a preview for testing, not a general stable release.

- Custom model entries suggest image input from explicit provider metadata, exact catalog matches and TuZi descriptions; manual choices are preserved. A stale response from a previous endpoint cannot change the new configuration.
- Default stream idle timeout increases to ten minutes and transient-error retry allowance to eight. Existing explicit settings are preserved. TuZi capacity failures are treated as transient server failures; authentication failures remain authentication failures.
- Cloud Bunny reuses dsh-pet's MIT event and interaction code with separate artwork and the application's own Electron. Actual Harness sessions drive thinking, working, completion, waiting, error and cancellation feedback.
- Independent application identity, protocol, settings and data directory let the community desktop coexist with upstream. Upstream telemetry is disabled. Automatic updates remain disabled for this unsigned preview.

On October 28, 2026, the macOS DMG was built, mounted, copied to a separate installation, verified with `codesign --verify --deep --strict`, and launched. The installed application passed real session/tool/pet integration with a local mock provider and no renderer errors. Packaged CLI plugin installation/removal and DOCX/XLSX/PPTX-to-PDF smoke checks passed. The full build and its aggregate TypeScript checks passed. Targeted model detection, configuration, conversion, cancellation and packaging tests passed.

A real TuZi custom-route image request using `gpt-6.1-terra` correctly identified a QR code; the test took about 76 seconds. The supplied account's model listing returned no Claude routes, so live Claude compatibility is unverified. A single successful request does not establish long-run availability or every model's compatibility. Windows, Intel Mac and Linux packages are not qualified here.

Documentation synchronization initially reported three failures; translation pairs and the generated configuration catalog were repaired and rechecked. One pre-existing reference check still flags the numeric wheel size at `python/sdk/uv.lock:113` as a commit abbreviation. It is recorded as a known check failure, not reported as passing.
