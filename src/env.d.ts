import type { HromadaHRApi } from '../shared/ipc'

declare global {
  interface Window {
    readonly hromadaHR: HromadaHRApi
  }
}
