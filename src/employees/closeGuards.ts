/** Explicit owners in registration order: parent first, nested form last. */
export interface CloseLayer {
  dirty: () => boolean
  busy: () => boolean
  confirm: (dirty: boolean, proceed: () => void) => void
}
export function createCloseGuards() {
  const layers: CloseLayer[] = []
  const busy = () => layers.some(layer => layer.busy())
  return {
    register(layer: CloseLayer) {
      layers.push(layer)
      return () => { const index = layers.indexOf(layer); if (index >= 0) layers.splice(index, 1) }
    },
    request(layer: CloseLayer, proceed: () => void) {
      if (!busy() && layers.at(-1) === layer) layer.confirm(layer.dirty(), () => {
        if (!busy() && layers.at(-1) === layer) proceed()
      })
    },
    requestAll(proceed: () => void) {
      const snapshot = [...layers].reverse()
      const next = (index: number) => {
        if (busy() || snapshot.length !== layers.length || snapshot.some((layer, offset) => layers.at(-1 - offset) !== layer)) return
        const layer = snapshot[index]
        if (!layer) { proceed(); return }
        layer.confirm(layer.dirty(), () => next(index + 1))
      }
      next(0)
    },
    shouldBlockUnload: () => busy() || layers.some(layer => layer.dirty()),
    isBusy: busy,
  }
}
