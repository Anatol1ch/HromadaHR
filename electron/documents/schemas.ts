import { validNumberPattern, MAX_DOCUMENT_ORDINAL } from '../../shared/document-numbering.js'
import { z } from 'zod'
import { personnelDocumentKinds, documentNumberKey } from '../../shared/documents.js'
import { leaveTypes } from '../../shared/leave.js'
import { calendarDate, id } from '../personnel/schemas.js'
export { id }
export const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const optionalText = (max: number) => z.string().trim().max(max).nullable().transform(value => value || null)
const fields = {
  seriesId:id.nullable().optional().transform(value=>value??null),
  kind: z.enum(personnelDocumentKinds), customKind: optionalText(120),
  number: z.string().trim().min(1).max(80).transform(value => value.replace(/\s+/gu, ' ')).refine(value => documentNumberKey(value).length > 0 && documentNumberKey(value).length <= 80),
  issuedOn: calendarDate, title: z.string().trim().min(1).max(500), note: optionalText(2000),
  employeeIds: z.array(id).refine(ids => new Set(ids).size === ids.length),
}
const kindValid = (value: {kind: string; customKind: string | null}) => value.kind === 'other' ? value.customKind !== null : value.customKind === null
export const input = z.strictObject(fields).refine(kindValid, { path: ['customKind'] })
export const createInput = z.strictObject({...fields, requestId: id}).refine(kindValid, { path: ['customKind'] })
export const updateInput = z.strictObject({...fields, id, expectedRevision: revision}).refine(kindValid, { path: ['customKind'] })
const outputFields = {...fields, id, revision, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime()}
export const document = z.strictObject(outputFields).refine(kindValid)
export const summary = z.strictObject(outputFields).omit({note: true}).refine(kindValid)

export const linkInput=z.strictObject({documentId:id,leaveRecordId:id,expectedDocumentRevision:revision,expectedLeaveRevision:revision})
export const leaveLink=z.strictObject({documentId:id,leaveRecordId:id,linkedAt:z.iso.datetime(),employeeId:id,leaveRevision:revision,
 leaveType:z.enum(leaveTypes),
 startDate:calendarDate,endDate:calendarDate,usedDays:z.number().int().positive(),status:z.enum(['active','cancelled']),orderNumber:z.string().nullable(),orderDate:calendarDate.nullable()})
export const documentLinks=z.strictObject({document,links:z.array(leaveLink)})
export const leaveDocument=z.strictObject({document,leaveRecordId:id,linkedAt:z.iso.datetime()})

const seriesFields={kind:z.enum(personnelDocumentKinds),code:z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}_-]+$/u),name:z.string().trim().min(1).max(120),pattern:z.string().max(60).refine(validNumberPattern),minDigits:z.number().int().min(1).max(9),startAt:z.number().int().min(1).max(MAX_DOCUMENT_ORDINAL)}
export const seriesInput=z.strictObject(seriesFields)
export const seriesUpdate=z.strictObject({...seriesFields,id,expectedRevision:revision})
export const series=z.strictObject({...seriesFields,id,active:z.boolean(),used:z.boolean(),revision,createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()})
export const autoInput=z.strictObject({...fields,number:z.never().optional(),seriesId:id,requestId:id}).refine(kindValid).transform(({number:_number,...value})=>value)
