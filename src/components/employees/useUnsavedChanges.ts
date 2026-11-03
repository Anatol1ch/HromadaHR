import { useEffect } from 'react'
import type { RefObject } from 'react'
import { cancelCloseConfirmation, confirmModalClose } from '../closeConfirmation'

export type NavigationGuard = (proceed: () => void) => void
export default function useUnsavedChanges(dirty: boolean, inFlight: RefObject<boolean>, navigationGuard: RefObject<NavigationGuard>) {
  useEffect(() => {
    const owner = document.querySelector<HTMLElement>('.employees-workspace form')
    navigationGuard.current = proceed => { if (!inFlight.current) confirmModalClose(dirty, proceed, owner) }
    // beforeunload cannot await an in-page dialog without changing Electron close handling.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (inFlight.current || (dirty && !window.confirm('Є незбережені зміни. Закрити без збереження?'))) {
        event.preventDefault(); event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { if (owner) cancelCloseConfirmation(owner); navigationGuard.current = proceed => proceed(); window.removeEventListener('beforeunload', beforeUnload) }
  }, [dirty, inFlight, navigationGuard])
}
