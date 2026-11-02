// Tests a candidate OS primitive only, NOT application/SQLite/SMB integration.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

function probeTest(name, run) {
  test(name, { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'hromadahr-lock-probe-'))
    const compilerTemp = join(root, 'compiler')
    mkdirSync(compilerTemp)
    const children = []
    async function acquire(path, hold = false) {
      const executable = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
        fileURLToPath(new URL('./helpers/windows-share-handle.ps1', import.meta.url)), '-Path', path]
      if (hold) args.push('-Hold')
      const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TEMP: compilerTemp, TMP: compilerTemp } })
      children.push(child)
      let stderr = ''
      child.stderr.on('data', chunk => { stderr += chunk })
      const exited = new Promise((accept, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => accept({ code, signal }))
      })
      // Observe startup errors even if ready rejects before exited is awaited.
      void exited.catch(() => {})
      const ready = new Promise((accept, reject) => {
        let stdout = ''
        const timer = setTimeout(() => { child.kill(); reject(new Error('OS handle probe timed out')) }, 30000)
        child.stdout.on('data', chunk => {
          stdout += chunk
          if (stdout.includes('\n')) {
            clearTimeout(timer)
            try { accept(JSON.parse(stdout.split('\n')[0])) } catch (error) { reject(error) }
          }
        })
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', code => {
          clearTimeout(timer)
          if (!stdout.includes('\n')) reject(new Error(`OS handle probe exited ${code}: ${stderr}`))
        })
      })
      const result = await ready
      if (!hold || result.state !== 'acquired') assert.equal((await exited).code, 0, stderr)
      return { ...result, child, exited }
    }
    try { await run({ root, file: join(root, 'session.guard'), acquire }) }
    finally {
      for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill()
      // Wait for OS process handles and compiler temporaries to be released.
      await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? undefined :
        new Promise(accept => child.once('exit', accept))))
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-lock-probe-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
}

probeTest('Windows OS handle denies a second local process without relying on file existence', async ({ file, acquire }) => {
  writeFileSync(file, 'retained guard; not an ownership assertion')
  const first = await acquire(file, true)
  assert.equal(first.state, 'acquired')
  const second = await acquire(file)
  assert.equal(second.state, 'contended')
  assert.equal(second.win32Error, 32)
  first.child.stdin.end('release\n')
  assert.equal((await first.exited).code, 0)
  assert.equal(readFileSync(file, 'utf8'), 'retained guard; not an ownership assertion')
})

probeTest('normal handle closure lets a waiting local contender acquire without deleting the guard', async ({ file, acquire }) => {
  const first = await acquire(file, true)
  assert.equal((await acquire(file)).state, 'contended')
  first.child.stdin.end('release\n')
  await first.exited
  assert.equal(existsSync(file), true)
  assert.equal((await acquire(file)).state, 'acquired')
})

probeTest('Windows releases the local exclusive handle after abrupt process termination', async ({ file, acquire }) => {
  const first = await acquire(file, true)
  assert.equal(first.state, 'acquired')
  assert.equal((await acquire(file)).state, 'contended')
  first.child.kill()
  await first.exited
  assert.equal(existsSync(file), true)
  assert.equal((await acquire(file)).state, 'acquired')
})

probeTest('missing target path is unavailable, not contended, and is not recreated', async ({ root, acquire }) => {
  const missing = join(root, 'absent', 'session.guard')
  const result = await acquire(missing)
  assert.equal(result.state, 'unavailable')
  assert.equal(result.win32Error, 3) // ERROR_PATH_NOT_FOUND, not ERROR_SHARING_VIOLATION.
  assert.equal(existsSync(join(root, 'absent')), false)
})
