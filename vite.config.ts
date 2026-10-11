import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Every file in public/, as site paths (/dict/…, /favicon.svg). */
function publicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? publicFiles(p, root) : ['/' + relative(root, p).replaceAll('\\', '/')]
  })
}

/**
 * Writes /sw.js at build time with this build's files baked in, so the first visit saves the
 * whole app on the phone and Ops and pass & play still open with no internet.
 * The template is src/sw.js; its cache name changes with every build that changes a file.
 */
function offline(): Plugin {
  return {
    name: 'offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['/', ...Object.keys(bundle).map((f) => '/' + f), ...publicFiles('public')]
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10)
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(files))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), offline()],
})
