import { z } from 'zod'
import { personnelDocumentKinds, documentNumberKey } from '../../shared/documents.js'
import { calendarDate, id } from '../personnel/schemas.js'
export { id }
export const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const optionalText = (max: number) => z.string().trim().max(max).nullable().transform(value => value || null)
const fields = {
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
