/** Package terminal launch scripts that reuse the installed Electron runtime. */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { desktopBrand } from '../src/community-brand.ts'

/**
 * Copy the platform launcher into the application's public command directory.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 */
export function prepareDesktopCli(destination: string, platform: 'darwin' | 'win32'): void {
  const name = platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const command = join(destination, 'bin', name)
  mkdirSync(join(destination, 'bin'), { recursive: true })
  let launcher = readFileSync(join(import.meta.dirname, '..', 'cli', name), 'utf8')
  if (process.env.DSH_TUZI_COMMUNITY === '1') {
    launcher = launcher.replaceAll('DeepSeek Harness', desktopBrand(true).name)
    launcher = platform === 'darwin'
      ? launcher.replace('set -e', 'set -e\nexport DSH_HOME="${DSH_TUZI_HOME:-$HOME/.dsh-tuzi}"\nexport DSH_TELEMETRY_DISABLED=1')
      : launcher.replace('@echo off', '@echo off\r\nset "DSH_HOME=%USERPROFILE%\\.dsh-tuzi"\r\nif defined DSH_TUZI_HOME set "DSH_HOME=%DSH_TUZI_HOME%"\r\nset "DSH_TELEMETRY_DISABLED=1"')
  }
  writeFileSync(command, launcher)
  if (platform === 'darwin') chmodSync(command, 0o755)
}
