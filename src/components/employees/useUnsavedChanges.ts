import { useEffect } from 'react'
import type { RefObject } from 'react'

export default function useUnsavedChanges(dirty: boolean, inFlight: RefObject<boolean>, navigationGuard: RefObject<() => boolean>) {
  useEffect(() => {
    const canLeave = () => !inFlight.current && (!dirty || window.confirm('Є незбережені зміни. Вийти з форми без збереження?'))
    navigationGuard.current = canLeave
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!canLeave()) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { navigationGuard.current = () => true; window.removeEventListener('beforeunload', beforeUnload) }
  }, [dirty, inFlight, navigationGuard])
}
