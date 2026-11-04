export const zoomPercents = [80, 90, 100, 110, 125, 150] as const
export type ZoomPercent = typeof zoomPercents[number]
export interface ZoomStatus { percent: ZoomPercent; saved: boolean }
