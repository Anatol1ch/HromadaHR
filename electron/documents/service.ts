import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import { documentNumberKey, type DocumentsErrorCode, type PersonnelDocument, type PersonnelDocumentCreateInput, type PersonnelDocumentUpdateInput, type PersonnelDocumentInput, type PersonnelDocumentSummary } from '../../shared/documents.js'
import * as schemas from './schemas.js'

export class DocumentsError extends Error { constructor(readonly code: DocumentsErrorCode) { super(code) } }
const columns = `id,kind,custom_kind AS customKind,number,issued_on AS issuedOn,title,note,revision,created_at AS createdAt,updated_at AS updatedAt`
type Row = Omit<PersonnelDocument, 'employeeIds'>
export class DocumentsService {
  constructor(private readonly storage: Pick<Storage, 'getDatabase'>, private readonly isBusy: () => boolean) {}
  private parse<T>(schema: {parse:(value:unknown)=>T}, value:unknown): T {
    try { return schema.parse(value) } catch { throw new DocumentsError('INVALID_ARGUMENTS') }
  }
  private run<T>(write: boolean, operation: (db: Database.Database) => T): T {
    if (this.isBusy()) throw new DocumentsError('BUSY')
    let db: Database.Database
    try { db = this.storage.getDatabase() } catch { throw new DocumentsError('STORAGE_UNAVAILABLE') }
    try {
      const transaction = db.transaction(() => operation(db))
      return write ? transaction.immediate() : transaction()
    } catch (error) {
      if (error instanceof DocumentsError) throw error
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (/^SQLITE_(BUSY|LOCKED)/.test(code)) throw new DocumentsError('BUSY')
      if (code.startsWith('SQLITE_CONSTRAINT')) throw new DocumentsError('CONFLICT')
      throw new DocumentsError('INTERNAL_ERROR')
    }
  }
  private document(db: Database.Database, id: string): PersonnelDocument {
    const row = db.prepare<[string], Row>(`SELECT ${columns} FROM personnel_documents WHERE id=?`).get(id)
    if (!row) throw new DocumentsError('NOT_FOUND')
    const ids = db.prepare<[string], {id:string}>('SELECT employee_id AS id FROM personnel_document_employees WHERE document_id=? ORDER BY employee_id').all(id)
    return {...row, employeeIds: ids.map(value => value.id)}
  }
  private references(db: Database.Database, ids: string[]) {
    const employee = db.prepare('SELECT 1 FROM employees WHERE id=?')
    if (ids.some(id => !employee.get(id))) throw new DocumentsError('DOCUMENT_EMPLOYEE_NOT_FOUND')
  }
  private number(db: Database.Database, value: PersonnelDocumentInput, exclude = '') {
    if (db.prepare(`SELECT 1 FROM personnel_documents WHERE kind=? AND substr(issued_on,1,4)=? AND number_key=? AND id!=?`)
      .get(value.kind, value.issuedOn.slice(0,4), documentNumberKey(value.number), exclude)) throw new DocumentsError('DOCUMENT_NUMBER_CONFLICT')
  }
  private links(db: Database.Database, id: string, employeeIds: string[]) {
    db.prepare('DELETE FROM personnel_document_employees WHERE document_id=?').run(id)
    const insert = db.prepare('INSERT INTO personnel_document_employees(document_id,employee_id) VALUES (?,?)')
    employeeIds.forEach(employeeId => insert.run(id, employeeId))
  }
  listDocuments = (): PersonnelDocumentSummary[] => this.run(false, db =>
    db.prepare<[], {id:string}>('SELECT id FROM personnel_documents ORDER BY issued_on DESC,number_key,id').all().map(({id}) => {
      const {note: _note, ...summary} = this.document(db, id)
      return summary
    }))
  getDocument = (id: string) => { this.parse(schemas.id,id); return this.run(false, db => this.document(db,id)) }
  createDocument = (input: PersonnelDocumentCreateInput) => {
    const {requestId, ...value} = this.parse(schemas.createInput,input)
    const fingerprint = createHash('sha256').update(JSON.stringify({...value, employeeIds:[...value.employeeIds].sort()})).digest('hex')
    return this.run(true, db => {
      const existing = db.prepare<[string], {id:string; fingerprint:string}>('SELECT id,request_fingerprint AS fingerprint FROM personnel_documents WHERE request_id=?').get(requestId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new DocumentsError('DOCUMENT_REQUEST_CONFLICT')
        return this.document(db,existing.id)
      }
      this.references(db,value.employeeIds); this.number(db,value)
      const id = randomUUID(), now = new Date().toISOString()
      db.prepare(`INSERT INTO personnel_documents(id,kind,custom_kind,number,number_key,issued_on,title,note,revision,created_at,updated_at,request_id,request_fingerprint)
        VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?)`).run(id,value.kind,value.customKind,value.number,documentNumberKey(value.number),value.issuedOn,value.title,value.note,now,now,requestId,fingerprint)
      this.links(db,id,value.employeeIds)
      return this.document(db,id)
    })
  }
  updateDocument = (input: PersonnelDocumentUpdateInput) => {
    const {id, expectedRevision, ...value} = this.parse(schemas.updateInput,input)
    return this.run(true, db => {
      const current = this.document(db,id)
      if (current.revision !== expectedRevision) throw new DocumentsError('STALE_REVISION')
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new DocumentsError('CONFLICT')
      this.references(db,value.employeeIds); this.number(db,value,id)
      db.prepare(`UPDATE personnel_documents SET kind=?,custom_kind=?,number=?,number_key=?,issued_on=?,title=?,note=?,revision=revision+1,updated_at=? WHERE id=?`)
        .run(value.kind,value.customKind,value.number,documentNumberKey(value.number),value.issuedOn,value.title,value.note,new Date().toISOString(),id)
      this.links(db,id,value.employeeIds)
      return this.document(db,id)
    })
  }
  deleteDocument = (id: string, expectedRevision: number) => {
    this.parse(schemas.id,id); this.parse(schemas.revision,expectedRevision)
    return this.run(true, db => {
      if (this.document(db,id).revision !== expectedRevision) throw new DocumentsError('STALE_REVISION')
      db.prepare('DELETE FROM personnel_documents WHERE id=?').run(id)
      return null
    })
  }
}
