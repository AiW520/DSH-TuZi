/** Community shell and pet helper share the installed Electron executable. */
import { app } from 'electron'
import { createRequire } from 'node:module'
import { join } from 'node:path'

async function start(): Promise<void> {
  if (process.env.DSH_TUZI_PET_HELPER === '1') {
    // Only load our packaged helper; argv never chooses executable JavaScript.
    const helper = join(process.resourcesPath, 'runtime', 'community-pet', 'runtime', 'electron-helper', 'main.js')
    createRequire(import.meta.url)(helper)
  } else {
    await import('./main.ts')
  }
}

void start().catch((error: unknown) => {
  console.error('DSH-TuZi startup failed', error)
  app.exit(1)
})
