export function moveDictionaryEntry(ids: string[], source: string, target: string) {
  const from = ids.indexOf(source)
  const to = ids.indexOf(target)
  if (from < 0 || to < 0 || from === to) return ids
  const reordered = [...ids]
  reordered.splice(from, 1)
  reordered.splice(to, 0, source)
  return reordered
}
