import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { cancelCloseConfirmation, confirmModalClose } from '../closeConfirmation'
import { createCloseGuards } from '../../employees/closeGuards.ts'
import type { CloseLayer } from '../../employees/closeGuards.ts'

export type NavigationGuard = (proceed: () => void) => void
type GuardRef = RefObject<NavigationGuard>
const controllers = new WeakMap<GuardRef, { guards: ReturnType<typeof createCloseGuards>; users: number; unload: (event: BeforeUnloadEvent) => void }>()

export default function useUnsavedChanges(dirty: boolean, inFlight: RefObject<boolean>, navigationGuard: GuardRef, owner: RefObject<HTMLElement | null>) {
  const latest = useRef({ dirty })
  latest.current = { dirty }
  const layer = useRef<CloseLayer>({
    dirty: () => latest.current.dirty,
    busy: () => inFlight.current,
    confirm: (changed, proceed) => confirmModalClose(changed, proceed, owner.current),
  })
  useEffect(() => {
    let controller = controllers.get(navigationGuard)
    if (!controller) {
      const guards = createCloseGuards()
      const unload = (event: BeforeUnloadEvent) => {
        // Electron beforeunload cannot await a React confirmation.
        if (guards.isBusy() || (guards.shouldBlockUnload() && !window.confirm('Є незбережені зміни. Закрити без збереження?'))) {
          event.preventDefault(); event.returnValue = ''
        }
      }
      controller = { guards, users: 0, unload }
      controllers.set(navigationGuard, controller)
      window.addEventListener('beforeunload', unload)
      navigationGuard.current = proceed => guards.requestAll(proceed)
    }
    controller.users++
    const unregister = controller.guards.register(layer.current)
    const element = owner.current
    return () => {
      if (element) cancelCloseConfirmation(element)
      unregister()
      if (--controller.users === 0) {
        window.removeEventListener('beforeunload', controller.unload)
        controllers.delete(navigationGuard)
        navigationGuard.current = proceed => proceed()
      }
    }
  }, [navigationGuard, owner])
  return (proceed: () => void) => controllers.get(navigationGuard)?.guards.request(layer.current, proceed)
}
