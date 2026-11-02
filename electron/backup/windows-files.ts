// Main-only, deliberately narrow Win32 surface. No generic FFI crosses IPC.
import koffi from 'koffi'
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs'
import { dirname, toNamespacedPath } from 'node:path'
import { createHash } from 'node:crypto'

const kernel = process.platform === 'win32' ? koffi.load('kernel32.dll') : null
const move = kernel?.func('int __stdcall MoveFileExW(str16 source, str16 destination, uint32 flags)')
const create = kernel?.func('void * __stdcall CreateFileW(str16 path, uint32 access, uint32 share, void *security, uint32 disposition, uint32 flags, void *template)')
const read = kernel?.func('int __stdcall ReadFile(void *handle, _Out_ uint8_t *buffer, uint32 size, _Out_ uint32 *count, void *overlapped)')
const close = kernel?.func('int __stdcall CloseHandle(void *handle)')
const renameHandle = kernel?.func('int __stdcall SetFileInformationByHandle(void *handle, int kind, void *info, uint32 size)')
const lastError = kernel?.func('uint32 __stdcall GetLastError()')

function winError(): Error & { code: string; win32Code: number } {
  const win32Code = Number(lastError!())
  const code = [80, 183].includes(win32Code) ? 'EEXIST' : [32, 33].includes(win32Code) ? 'EBUSY' :
    [2, 3].includes(win32Code) ? 'ENOENT' : [39, 112].includes(win32Code) ? 'ENOSPC' : 'EACCES'
  return Object.assign(new Error(code), { code, win32Code })
}

export function moveNoReplace(source: string, destination: string) {
  if (!move || dirname(source).toLowerCase() !== dirname(destination).toLowerCase()) throw new Error('Unsupported publication')
  // WRITE_THROUGH only: no REPLACE_EXISTING and no COPY_ALLOWED fallback.
  if (!move(toNamespacedPath(source), toNamespacedPath(destination), 8)) throw winError()
}

export function openPreservationHandle(path: string) {
  if (!create || !read || !close) throw new Error('Windows required')
  // OPEN_EXISTING; deny other readers/writers/deleters. Rename through this
  // very handle, never by reopening a pathname after releasing protection.
  // An already-open SQLite handle conflicts, including in another process.
  const handle = create(toNamespacedPath(path), 0x80010000, 0, null, 3, 0x80, null)
  if (handle === null || BigInt.asIntN(64, koffi.address(handle)) === -1n) throw winError()
  let disposed = false
  return {
    renameTo(destination: string) {
      if (disposed || !renameHandle || process.arch === 'ia32') throw new Error('Unsupported preservation rename')
      const name = Buffer.from(toNamespacedPath(destination), 'utf16le')
      // FILE_RENAME_INFO on Windows x64/arm64: BOOLEAN ReplaceIfExists=false,
      // aligned HANDLE RootDirectory=null, DWORD FileNameLength, WCHAR[].
      const info = Buffer.alloc(20 + name.length + 2)
      info.writeUInt32LE(name.length, 16); name.copy(info, 20)
      if (!renameHandle(handle, 3, info, info.length)) throw winError()
    },
    copyTo(destination: string) {
      if (disposed) throw new Error('Closed preservation handle')
      const fd = openSync(destination, 'wx')
      const hash = createHash('sha256')
      let size = 0
      try {
        const buffer = Buffer.alloc(64 * 1024)
        for (;;) {
          const count = [0]
          if (!read(handle, buffer, buffer.length, count, null)) throw winError()
          if (!count[0]) break
          hash.update(buffer.subarray(0, count[0])); size += count[0]
          let offset = 0
          while (offset < count[0]) offset += writeSync(fd, buffer, offset, count[0] - offset)
        }
        fsyncSync(fd)
        return { size, sha256: hash.digest('hex') }
      } finally { closeSync(fd) }
    },
    close() { if (!disposed) { close(handle); disposed = true } },
  }
}
