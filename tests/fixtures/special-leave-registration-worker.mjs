import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { LeaveService } from '../../dist-electron/electron/leave/service.js'

const db = new Database(workerData.file, { timeout: 10_000 })
try {
  const service = new LeaveService({ getDatabase: () => db }, () => false, () => '2026-11-26')
  const record = service.registerLeave(workerData.input)
  parentPort.postMessage({ ok: true, id: record.id })
} catch (error) {
  parentPort.postMessage({ ok: false, code: error?.code ?? 'UNKNOWN' })
} finally {
  db.close()
}
