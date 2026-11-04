import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Input, WebContents } from 'electron'
import { z } from 'zod'
import { zoomPercents } from '../shared/zoom.js'
import type { ZoomPercent, ZoomStatus } from '../shared/zoom.js'

export const zoomPercent = z.union([z.literal(80), z.literal(90), z.literal(100), z.literal(110), z.literal(125), z.literal(150)])
export const zoomStatus = z.strictObject({ percent: zoomPercent, saved: z.boolean() })

export function zoomShortcut(input: Pick<Input, 'type' | 'control' | 'alt' | 'meta' | 'isComposing' | 'key' | 'code'>): 'in' | 'out' | 'reset' | null {
  if (input.type !== 'keyDown' || !input.control || input.alt || input.meta || input.isComposing) return null
  if (input.key === '0' || input.code === 'Digit0' || input.code === 'Numpad0') return 'reset'
  if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd' || input.code === 'Equal') return 'in'
  if (input.key === '-' || input.code === 'NumpadSubtract' || input.code === 'Minus') return 'out'
  return null
}

// Main owns the preference. It is independent of SQLite and each other profile.
export class ZoomController {
  private state: ZoomStatus = { percent: 100, saved: true }
  constructor(private file: string, private getContents: () => Pick<WebContents, 'isDestroyed' | 'setZoomFactor'> | null) {
    try {
      if (statSync(file).size > 4096) throw new Error('Settings size limit')
      const data = z.strictObject({ zoom: zoomPercent }).parse(JSON.parse(readFileSync(file, 'utf8')))
      this.state.percent = data.zoom
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) this.state.saved = false
    }
  }
  get = (): ZoomStatus => ({ ...this.state })
  apply = () => {
    const contents = this.getContents()
    if (contents && !contents.isDestroyed()) contents.setZoomFactor(this.state.percent / 100)
  }
  set = (percent: ZoomPercent): ZoomStatus => {
    zoomPercent.parse(percent)
    this.state.percent = percent
    this.apply()
    const temporary = this.file + '.tmp'
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(temporary, JSON.stringify({ zoom: percent }), { mode: 0o600 })
      renameSync(temporary, this.file)
      this.state.saved = true
    } catch { this.state.saved = false }
    finally { try { unlinkSync(temporary) } catch { /* Own temporary preference only. */ } }
    return this.get()
  }
  shortcut = (input: Parameters<typeof zoomShortcut>[0]) => {
    const action = zoomShortcut(input)
    if (!action) return false
    const index = zoomPercents.indexOf(this.state.percent)
    const percent = action === 'reset' ? 100 : zoomPercents[Math.max(0, Math.min(zoomPercents.length - 1, index + (action === 'in' ? 1 : -1)))]!
    if (percent !== this.state.percent || !this.state.saved) this.set(percent)
    return true
  }
}
