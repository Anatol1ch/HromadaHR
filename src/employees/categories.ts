/** UI choices only; the SQLite/IPC category remains a nullable string.
 * Historical strings are preserved verbatim, without rewriting assignments.
 */
export function categoryOptions(current = '') {
  const options = [
    { value: '', label: 'Не зазначено' },
    ...['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].map(roman => ({ value: `${roman} категорія`, label: `${roman} категорія` })),
  ]
  if (current && !options.some(option => option.value === current)) {
    options.push({ value: current, label: `${current} (збережене значення)` })
  }
  return options
}
