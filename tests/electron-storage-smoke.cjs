// Runs as a real Electron Main entry, without BrowserWindow or production profiles.
const { app } = require('electron')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const root = process.argv[2]
assert.ok(root)
app.setPath('userData', join(root, 'electron-profile'))
app.setPath('sessionData', join(root, 'session'))
app.setPath('logs', join(root, 'logs'))
app.setPath('crashDumps', join(root, 'crashes'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const { openStorage } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/storage/index.js')).href)
  assert.ok(process.versions.electron)
  const file = join(root, 'data', 'smoke.db')
  const first = openStorage(file)
  try {
    assert.equal(first.schemaVersion, 1)
    first.database.exec("CREATE TABLE test_smoke(value TEXT); INSERT INTO test_smoke VALUES ('persisted')")
    assert.equal(typeof first.database.backup, 'function')
  } finally { first.close() }
  const second = openStorage(file)
  try {
    assert.equal(second.created, false)
    assert.equal(second.database.prepare('SELECT value FROM test_smoke').get().value, 'persisted')
  } finally { second.close() }
  console.log(`ELECTRON_STORAGE_OK Electron=${process.versions.electron} Node=${process.versions.node} arch=${process.arch}`)
}).catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  // The parent removes the temporary profile after Electron releases its files.
  app.exit(process.exitCode || 0)
})
