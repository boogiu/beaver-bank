import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Options } from './options'
import { pad, type WriteSession } from './session'
import type { WriteName } from './write-tools'
import type { WriteCapture } from './writes'

export interface WriteError {
  kind: string
  message: string
  field?: string
}
export type WriteResult = { ok: true; data: object } | { ok: false; error: WriteError }
function localTime(date: Date): string {
  const offset = -date.getTimezoneOffset()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}
export function appendWriteLog(
  options: Options,
  session: WriteSession,
  tool: WriteName,
  input: unknown,
  result: WriteResult,
  capture: WriteCapture,
  backup: string | null,
  time: Date
): string | undefined {
  const folder = join(dirname(options.path), 'mcp')
  const timestamp = localTime(time)
  const record = {
    time: timestamp,
    session: session.id,
    source: options.source,
    tool,
    input,
    ok: result.ok,
    error: result.ok ? null : result.error,
    before: capture.before,
    after: result.ok ? capture.after : null,
    backup
  }
  try {
    mkdirSync(folder, { recursive: true })
    appendFileSync(
      join(folder, `writes-${timestamp.slice(0, 7)}.jsonl`),
      `${JSON.stringify(record)}\n`,
      'utf8'
    )
  } catch (error) {
    console.error('기입 기록을 남기지 못했습니다:', error)
    return '기입 기록을 남기지 못했습니다. 기입 결과를 확인해 주세요.'
  }
  return undefined
}
