// Adapted from HromadaAID 33eca107 electron/copy-assets.mjs (icons only).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'dist-electron', 'electron', 'assets')
mkdirSync(output, { recursive: true })
for (const extension of ['svg', 'png', 'ico']) {
  copyFileSync(join(root, 'assets', `hromadahr.${extension}`), join(output, `hromadahr.${extension}`))
}
