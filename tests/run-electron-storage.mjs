import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const root = mkdtempSync(join(tmpdir(), 'hromadahr-electron-storage-'))
try {
  const result = spawnSync(electron, [fileURLToPath(new URL('./electron-storage-smoke.cjs', import.meta.url)), root], {
    env, encoding: 'utf8', timeout: 30000, windowsHide: true,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  assert.ifError(result.error)
  assert.equal(result.status, 0, 'Electron Main storage smoke test must exit successfully')
  assert.match(result.stdout, /ELECTRON_STORAGE_OK/)
} finally {
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-electron-storage-'))
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
