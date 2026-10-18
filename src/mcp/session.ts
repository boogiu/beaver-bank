import { randomUUID } from 'node:crypto'

export interface WriteSession {
  id: string
  sessionFile: string | null
  now: () => Date
}
export function createSession(now = (): Date => new Date()): WriteSession {
  return { id: randomUUID().replaceAll('-', '').slice(0, 16), sessionFile: null, now }
}
export const pad = (value: number): string => String(value).padStart(2, '0')
