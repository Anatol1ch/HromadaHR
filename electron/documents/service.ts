import { formatDocumentNumber, parseDocumentOrdinal, MAX_DOCUMENT_ORDINAL } from '../../shared/document-numbering.js'
import type { AutoNumberedDocumentInput, DocumentSeriesInput, DocumentSeriesUpdateInput, DocumentNumberingSeries } from '../../shared/documents.js'
import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import { documentNumberKey, type DocumentsErrorCode, type DocumentLeaveLinkInput, type DocumentLeaveLinks, type LeaveDocumentLink, type PersonnelDocument, type PersonnelDocumentCreateInput, type PersonnelDocumentUpdateInput, type PersonnelDocumentInput, type PersonnelDocumentSummary } from '../../shared/documents.js'
import * as schemas from './schemas.js'

export class DocumentsError extends Error { constructor(readonly code: DocumentsErrorCode) { super(code) } }
const columns = `id,kind,custom_kind AS customKind,number,series_id AS seriesId,issued_on AS issuedOn,title,note,revision,created_at AS createdAt,updated_at AS updatedAt`
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
    if (db.prepare(`SELECT 1 FROM personnel_documents WHERE ((? IS NULL AND series_id IS NULL AND kind=?) OR series_id=?) AND substr(issued_on,1,4)=? AND number_key=? AND id!=?`)
      .get(value.seriesId??null,value.kind,value.seriesId??null,value.issuedOn.slice(0,4),documentNumberKey(value.number),exclude)) throw new DocumentsError('DOCUMENT_NUMBER_CONFLICT')
  }
  private series(db:Database.Database,id:string):DocumentNumberingSeries {
    const row=db.prepare(`SELECT id,kind,code,name,pattern,min_digits AS minDigits,start_at AS startAt,active,revision,created_at AS createdAt,updated_at AS updatedAt,
      EXISTS(SELECT 1 FROM personnel_document_number_claims c WHERE c.series_id=s.id) AS used FROM personnel_document_series s WHERE id=?`).get(id) as (Omit<DocumentNumberingSeries,'active'|'used'>&{active:number;used:number})|undefined
    if(!row)throw new DocumentsError('SERIES_NOT_FOUND')
    return {...row,active:!!row.active,used:!!row.used}
  }
  private eligibleSeries(db:Database.Database,id:string,kind:string) {
    const series=this.series(db,id)
    if(!series.active)throw new DocumentsError('SERIES_INACTIVE')
    if(series.kind!==kind)throw new DocumentsError('SERIES_KIND_MISMATCH')
    return series
  }
  private claim(db:Database.Database,value:PersonnelDocumentInput,id:string,now:string) {
    if(!value.seriesId)return
    const series=this.eligibleSeries(db,value.seriesId,value.kind),year=Number(value.issuedOn.slice(0,4))
    const ordinal=parseDocumentOrdinal(series,value.number,year)
    if(ordinal===null)throw new DocumentsError('SERIES_PATTERN_MISMATCH')
    if(db.prepare('SELECT 1 FROM personnel_document_number_claims WHERE series_id=? AND calendar_year=? AND (ordinal=? OR number_key=?)').get(series.id,year,ordinal,documentNumberKey(value.number)))throw new DocumentsError('SERIES_NUMBER_TAKEN')
    db.prepare('INSERT INTO personnel_document_number_claims(series_id,calendar_year,ordinal,number_key,document_id,assigned_at) VALUES (?,?,?,?,?,?)').run(series.id,year,ordinal,documentNumberKey(value.number),id,now)
  }
  listSeries=()=>this.run(false,db=>db.prepare('SELECT id FROM personnel_document_series ORDER BY name,code,id').all().map(row=>this.series(db,(row as {id:string}).id)))
  createSeries=(input:DocumentSeriesInput)=>{
    const value=this.parse(schemas.seriesInput,input)
    return this.run(true,db=>{
      if(db.prepare('SELECT 1 FROM personnel_document_series WHERE kind=? AND code_key=?').get(value.kind,documentNumberKey(value.code)))throw new DocumentsError('SERIES_CODE_CONFLICT')
      const id=randomUUID(),now=new Date().toISOString()
      db.prepare('INSERT INTO personnel_document_series(id,kind,code,code_key,name,pattern,min_digits,start_at,active,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,0,?,?)').run(id,value.kind,value.code,documentNumberKey(value.code),value.name,value.pattern,value.minDigits,value.startAt,now,now)
      return this.series(db,id)
    })
  }
  updateSeries=(input:DocumentSeriesUpdateInput)=>{
    const {id,expectedRevision,...value}=this.parse(schemas.seriesUpdate,input)
    return this.run(true,db=>{
      const current=this.series(db,id)
      if(current.revision!==expectedRevision)throw new DocumentsError('STALE_REVISION')
      if(current.revision===Number.MAX_SAFE_INTEGER)throw new DocumentsError('CONFLICT')
      if(current.used&&(['kind','code','pattern','minDigits','startAt'] as const).some(key=>current[key]!==value[key]))throw new DocumentsError('SERIES_USED')
      if(db.prepare('SELECT 1 FROM personnel_document_series WHERE kind=? AND code_key=? AND id!=?').get(value.kind,documentNumberKey(value.code),id))throw new DocumentsError('SERIES_CODE_CONFLICT')
      db.prepare('UPDATE personnel_document_series SET kind=?,code=?,code_key=?,name=?,pattern=?,min_digits=?,start_at=?,revision=revision+1,updated_at=? WHERE id=?').run(value.kind,value.code,documentNumberKey(value.code),value.name,value.pattern,value.minDigits,value.startAt,new Date().toISOString(),id)
      return this.series(db,id)
    })
  }
  setSeriesActive=(id:string,expectedRevision:number,active:boolean)=>{
    this.parse(schemas.id,id);this.parse(schemas.revision,expectedRevision)
    if(typeof active!=='boolean')throw new DocumentsError('INVALID_ARGUMENTS')
    return this.run(true,db=>{
      const current=this.series(db,id)
      if(current.revision!==expectedRevision)throw new DocumentsError('STALE_REVISION')
      if(current.active===active)return current
      if(current.revision===Number.MAX_SAFE_INTEGER)throw new DocumentsError('CONFLICT')
      db.prepare('UPDATE personnel_document_series SET active=?,revision=revision+1,updated_at=? WHERE id=?').run(Number(active),new Date().toISOString(),id)
      return this.series(db,id)
    })
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
  createDocument = (input: PersonnelDocumentCreateInput) => this.create(this.parse(schemas.createInput,input),false)
  createAutoNumberedDocument=(input:AutoNumberedDocumentInput)=>this.create(this.parse(schemas.autoInput,input),true)
  private create(input:PersonnelDocumentCreateInput|AutoNumberedDocumentInput,automatic:boolean) {
    const {requestId,...intent}=input
    // Keep the v19/v20 fingerprint for manual documents without a series.
    const {seriesId,...legacy}=intent
    const payload=automatic?{automatic:true,...intent}:seriesId?intent:legacy
    const fingerprint=createHash('sha256').update(JSON.stringify({...payload,employeeIds:[...intent.employeeIds].sort()})).digest('hex')
    return this.run(true,db=>{
      const existing=db.prepare<[string],{id:string;fingerprint:string}>('SELECT id,request_fingerprint AS fingerprint FROM personnel_documents WHERE request_id=?').get(requestId)
      if(existing){
        if(existing.fingerprint!==fingerprint)throw new DocumentsError('DOCUMENT_REQUEST_CONFLICT')
        return this.document(db,existing.id)
      }
      this.references(db,intent.employeeIds)
      let number='number' in intent?intent.number:''
      if(automatic){
        const series=this.eligibleSeries(db,seriesId!,intent.kind),year=Number(intent.issuedOn.slice(0,4))
        const max=db.prepare('SELECT max(ordinal) AS value FROM personnel_document_number_claims WHERE series_id=? AND calendar_year=?').get(series.id,year) as {value:number|null}
        const ordinal=Math.max(series.startAt,(max.value??0)+1)
        if(ordinal>MAX_DOCUMENT_ORDINAL)throw new DocumentsError('SERIES_EXHAUSTED')
        number=formatDocumentNumber(series,ordinal,year)
      }
      const value:PersonnelDocumentInput={...intent,number,seriesId:seriesId??null}
      this.number(db,value)
      const id=randomUUID(),now=new Date().toISOString()
      db.prepare(`INSERT INTO personnel_documents(id,kind,custom_kind,number,number_key,issued_on,title,note,revision,created_at,updated_at,request_id,request_fingerprint,series_id)
        VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?)`).run(id,value.kind,value.customKind,value.number,documentNumberKey(value.number),value.issuedOn,value.title,value.note,now,now,requestId,fingerprint,value.seriesId)
      this.claim(db,value,id,now)
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
      if (db.prepare('SELECT 1 FROM personnel_document_leave_records WHERE document_id=? LIMIT 1').get(id) &&
        ((current.seriesId??null)!==value.seriesId || current.kind!==value.kind || current.customKind!==value.customKind || current.number!==value.number || current.issuedOn!==value.issuedOn ||
         JSON.stringify([...current.employeeIds].sort())!==JSON.stringify([...value.employeeIds].sort()))) throw new DocumentsError('DOCUMENT_HAS_LEAVE_LINKS')
      this.references(db,value.employeeIds); this.number(db,value,id)
      const reassigned=(current.seriesId??null)!==value.seriesId||current.number!==value.number||current.issuedOn.slice(0,4)!==value.issuedOn.slice(0,4)||current.kind!==value.kind
      if(reassigned){
        db.prepare('UPDATE personnel_document_number_claims SET document_id=NULL WHERE document_id=?').run(id)
        this.claim(db,value,id,new Date().toISOString())
      }
      db.prepare(`UPDATE personnel_documents SET kind=?,custom_kind=?,number=?,number_key=?,issued_on=?,title=?,note=?,series_id=?,revision=revision+1,updated_at=? WHERE id=?`)
        .run(value.kind,value.customKind,value.number,documentNumberKey(value.number),value.issuedOn,value.title,value.note,value.seriesId,new Date().toISOString(),id)
      this.links(db,id,value.employeeIds)
      return this.document(db,id)
    })
  }
  deleteDocument = (id: string, expectedRevision: number) => {
    this.parse(schemas.id,id); this.parse(schemas.revision,expectedRevision)
    return this.run(true, db => {
      if (this.document(db,id).revision !== expectedRevision) throw new DocumentsError('STALE_REVISION')
      if(db.prepare('SELECT 1 FROM personnel_document_leave_records WHERE document_id=? LIMIT 1').get(id))throw new DocumentsError('DOCUMENT_HAS_LEAVE_LINKS')
      db.prepare('DELETE FROM personnel_documents WHERE id=?').run(id)
      return null
    })
  }
  private linkSnapshot(db:Database.Database,id:string):DocumentLeaveLinks {
    const document=this.document(db,id)
    const links=db.prepare<[string],DocumentLeaveLinks['links'][number]>(`SELECT l.document_id AS documentId,l.leave_record_id AS leaveRecordId,l.linked_at AS linkedAt,
      r.employee_id AS employeeId,r.revision AS leaveRevision,r.leave_type AS leaveType,r.start_date AS startDate,r.end_date AS endDate,
      r.used_days AS usedDays,r.status,r.order_number AS orderNumber,r.order_date AS orderDate
      FROM personnel_document_leave_records l JOIN leave_records r ON r.id=l.leave_record_id WHERE l.document_id=? ORDER BY r.start_date DESC,r.id`).all(id)
    return {document,links}
  }
  listLeaveLinks=(id:string)=>{this.parse(schemas.id,id);return this.run(false,db=>this.linkSnapshot(db,id))}
  getLeaveDocument=(id:string):LeaveDocumentLink|null=>{
    this.parse(schemas.id,id)
    return this.run(false,db=>{
      if(!db.prepare('SELECT 1 FROM leave_records WHERE id=?').get(id))throw new DocumentsError('NOT_FOUND')
      const link=db.prepare<[string],{documentId:string;linkedAt:string}>('SELECT document_id AS documentId,linked_at AS linkedAt FROM personnel_document_leave_records WHERE leave_record_id=?').get(id)
      return link?{document:this.document(db,link.documentId),leaveRecordId:id,linkedAt:link.linkedAt}:null
    })
  }
  private bumpLinkedDocument(db:Database.Database,id:string,revision:number) {
    if(revision===Number.MAX_SAFE_INTEGER)throw new DocumentsError('CONFLICT')
    db.prepare('UPDATE personnel_documents SET revision=revision+1,updated_at=? WHERE id=?').run(new Date().toISOString(),id)
  }
  private mutateLeaveLink(input:DocumentLeaveLinkInput,unlink:boolean):DocumentLeaveLinks {
    const value=this.parse(schemas.linkInput,input)
    return this.run(true,db=>{
      const document=this.document(db,value.documentId)
      const leave=db.prepare<[string],{employeeId:string;revision:number;status:string;number:string|null;date:string|null}>(`SELECT employee_id AS employeeId,revision,status,order_number AS number,order_date AS date FROM leave_records WHERE id=?`).get(value.leaveRecordId)
      if(!leave)throw new DocumentsError('NOT_FOUND')
      const existing=db.prepare<[string],{id:string}>('SELECT document_id AS id FROM personnel_document_leave_records WHERE leave_record_id=?').get(value.leaveRecordId)
      if(existing&&existing.id!==value.documentId)throw new DocumentsError('DOCUMENT_LEAVE_CONFLICT')
      // A factual no-op retry never bumps a revision or writes again.
      if((!unlink&&existing)||(unlink&&!existing))return this.linkSnapshot(db,value.documentId)
      if(document.revision!==value.expectedDocumentRevision||leave.revision!==value.expectedLeaveRevision)throw new DocumentsError('STALE_REVISION')
      if(!unlink){
        if(document.employeeIds.length!==1)throw new DocumentsError('DOCUMENT_EMPLOYEE_REQUIRED')
        if(document.employeeIds[0]!==leave.employeeId)throw new DocumentsError('DOCUMENT_EMPLOYEE_MISMATCH')
        if(leave.status!=='active')throw new DocumentsError('LEAVE_CANCELLED')
        if(!leave.number||!documentNumberKey(leave.number)||!leave.date)throw new DocumentsError('DOCUMENT_REQUISITES_MISSING')
        if(documentNumberKey(leave.number)!==documentNumberKey(document.number)||leave.date!==document.issuedOn)throw new DocumentsError('DOCUMENT_REQUISITES_MISMATCH')
        db.prepare('INSERT INTO personnel_document_leave_records(document_id,leave_record_id,linked_at) VALUES (?,?,?)').run(value.documentId,value.leaveRecordId,new Date().toISOString())
      }else db.prepare('DELETE FROM personnel_document_leave_records WHERE document_id=? AND leave_record_id=?').run(value.documentId,value.leaveRecordId)
      this.bumpLinkedDocument(db,value.documentId,document.revision)
      return this.linkSnapshot(db,value.documentId)
    })
  }
  linkLeaveRecord=(input:DocumentLeaveLinkInput)=>this.mutateLeaveLink(input,false)
  unlinkLeaveRecord=(input:DocumentLeaveLinkInput)=>this.mutateLeaveLink(input,true)

}
