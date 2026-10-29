// Only explicitly listed operations may cross the privilege boundary.
export const ipcChannels = { systemGetInfo: 'system:getInfo' } as const

export interface SystemInfo {
  name: string
  version: string
  mode: 'dev' | 'built'
}

export type IpcErrorCode = 'FORBIDDEN' | 'INVALID_ARGUMENTS' | 'INTERNAL_ERROR' | 'UNAVAILABLE'
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode } }

export interface IpcOperations {
  [ipcChannels.systemGetInfo]: { args: []; result: SystemInfo }
}

export interface HromadaHRApi {
  readonly system: {
    readonly getInfo: (...args: IpcOperations[typeof ipcChannels.systemGetInfo]['args']) => Promise<IpcResult<SystemInfo>>
  }
}
