// Main-only names. Legacy snapshots remain valid; new paired files include a content digest.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const pattern = new RegExp(`^hromadahr-(${uuid})-(auto|manual)-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z)-(${uuid}|[0-9a-f]{64})\\.db$`)
export function backupName(name: string) {
  const match = pattern.exec(name)
  if (!match) return null
  const time = match[3].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z')
  if (!Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) return null
  return { instance: match[1], kind: match[2] as 'auto' | 'manual', time, id: match[4], digest: match[4].length === 64 ? match[4] : null }
}
