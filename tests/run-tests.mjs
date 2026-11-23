import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modules = {
  infrastructure: ['storage', 'remove-notes', 'ipc', 'startup', 'zoom'],
  backup: ['backup', 'backup-catalog', 'backup-history', 'backup-reliability', 'paired-backup', 'open-backup-folder'],
  personnel: ['personnel', 'personnel-dictionaries', 'current-appointment'],
  seniority: ['seniority-ranks', 'seniority-ranks-model', 'service-baseline', 'service-accounting-form', 'service-calculations', 'rank-projection', 'rank-projection-ipc', 'profile-indicators'],
  leaves: ['leave', 'leave-ipc', 'leave-rights', 'leave-registration', 'leave-corrections', 'special-leaves', 'service-leave-calculations', 'service-leave-projection', 'leave-draft', 'leave-confirmation', 'leave-presentation', 'leave-usage'],
  documents: ['documents-core', 'document-numbering', 'document-leave-links', 'documents-ui', 'document-leave-links-ui'],
  control: ['personnel-control', 'personnel-control-calculations'],
  ui: ['ui-foundation', 'ui-contracts', 'employee-form-modes', 'sidebar-preference'],
}

// Every existing test file must belong to exactly one module. New/unmapped files
// fail even a targeted invocation, rather than silently disappearing from pnpm test.
const declared = Object.values(modules).flat().map(name => name + '.test.mjs')
const actual = readdirSync(resolve(root, 'tests')).filter(name => name.endsWith('.test.mjs')).sort()
if (new Set(declared).size !== declared.length || JSON.stringify([...declared].sort()) !== JSON.stringify(actual)) {
  throw Error('Test module manifest differs from tests/*.test.mjs; update tests/run-tests.mjs')
}
const args = process.argv.slice(2).filter(arg => arg !== '--')
if (args.length === 1 && args[0] === '--list') {
  for (const [name, files] of Object.entries(modules)) console.log(`${name}: ${files.length} files — ${files.join(', ')}`)
} else {
  const all = !args.length || (args.length === 1 && args[0] === 'all')
  if (!all && args.some(name => !Object.hasOwn(modules, name))) throw Error(`Unknown module. Use all or: ${Object.keys(modules).join(', ')}`)
  const files = all ? declared : [...new Set(args.flatMap(name => modules[name]))].map(name => name + '.test.mjs')
  function run(argv) {
    const result = spawnSync(process.execPath, argv, { cwd: root, stdio: 'inherit', windowsHide: true })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  run(['--test', ...files.map(name => 'tests/' + name)])
  if (all || args.includes('infrastructure')) run(['tests/run-electron-storage.mjs'])
}
