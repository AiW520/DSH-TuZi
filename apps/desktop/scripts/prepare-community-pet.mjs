import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Build the MIT pet adapter and stage the helper before runtime integrity is sealed. */
export async function prepareCommunityPet(dshRoot, runtimeRoot) {
  const source = fileURLToPath(new URL('../../../community/pet/', import.meta.url))
  const destination = join(dshRoot, 'node_modules', 'dsh-tuzi-pet')
  const helper = join(runtimeRoot, 'community-pet')
  await mkdir(join(destination, 'lib'), { recursive: true })
  for (const file of ['package.json', 'cordis.patch.yml', 'LICENSE', 'assets']) {
    await cp(join(source, file), join(destination, file), { recursive: true })
  }
  const require = createRequire(import.meta.url)
  const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild')
  await build({
    entryPoints: [join(source, 'src', 'index.ts')], outfile: join(destination, 'lib', 'index.js'),
    bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external',
    banner: { js: '// Adapted from dsh-pet 0.3.8, Copyright PC2005-cloud. MIT; see adjacent LICENSE.' },
  })
  await mkdir(helper, { recursive: true })
  await cp(join(source, 'runtime'), join(helper, 'runtime'), { recursive: true })
  await mkdir(join(helper, 'assets'), { recursive: true })
  await cp(join(runtimeRoot, 'community-icon.png'), join(helper, 'assets', 'logo.png'))
  await cp(join(source, 'LICENSE'), join(helper, 'LICENSE'))
  const brandSource = fileURLToPath(new URL('../../../community/brand/', import.meta.url))
  const brand = join(dshRoot, 'node_modules', 'dsh-tuzi-brand')
  await mkdir(join(brand, 'lib'), { recursive: true })
  for (const file of ['package.json', 'cordis.patch.yml']) await cp(join(brandSource, file), join(brand, file))
  await writeFile(join(brand, 'lib', 'index.js'), 'export function apply() {}\n')
  const client = await build({
    entryPoints: [join(brandSource, 'client.jsx')], bundle: true, platform: 'browser', format: 'cjs',
    packages: 'external', loader: { '.svg': 'text' }, write: false,
  })
  await writeFile(join(brand, 'lib', 'client.js'),
    `window.__ModuleLoader__.load({id:"dsh-tuzi-brand",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`)
  // The normal profile resolver discovers plugins through declared runtime dependencies.
  for (const manifestPath of [join(dshRoot, 'package.json'), join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')]) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.dependencies['dsh-tuzi-pet'] = '0.1.0'
    manifest.dependencies['dsh-tuzi-brand'] = '0.1.0'
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
}
