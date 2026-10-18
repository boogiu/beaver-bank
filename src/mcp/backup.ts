import type Database from 'better-sqlite3'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  unlinkSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { Options } from './options'
import { pad, type WriteSession } from './session'

export function isBusy(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: string; cause?: unknown }
  return value.code?.startsWith('SQLITE_BUSY') === true || isBusy(value.cause)
}
export class BackupError extends Error {
  constructor(public cause: unknown) {
    super('백업을 만들지 못해 기입하지 않았습니다.')
  }
}
const pattern = /^beaverbank-dev-(\d{8}-\d{6})(?:-([2-9]|[1-9]\d+))?\.sqlite$/
function removeOwn(file: string): void {
  try {
    unlinkSync(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
function prune(folder: string): void {
  const files = readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) => {
      const match = entry.isFile() && pattern.exec(entry.name)
      return match ? [{ name: entry.name, time: match[1], suffix: Number(match[2] ?? 1) }] : []
    })
    .sort((a, b) => b.time.localeCompare(a.time) || b.suffix - a.suffix)
  for (const file of files.slice(20)) removeOwn(join(folder, file.name))
}
export function ensureBackup(
  sqlite: Database.Database,
  options: Options,
  session: WriteSession
): string | null {
  if (session.sessionFile !== null) return null
  const folder = join(dirname(options.path), 'mcp', 'backups')
  let reservation: string | null = null
  let temporary: string | null = null
  try {
    mkdirSync(folder, { recursive: true })
    const d = session.now()
    const stem = `beaverbank-dev-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    let file = ''
    // 보관 정리로 앞 번호가 없어져도 같은 초의 새 백업이 오래된 것으로
    // 정렬되지 않도록 현재 가장 큰 접미사 다음부터 예약한다.
    const suffixes = readdirSync(folder).flatMap((name) => {
      const match = pattern.exec(name.replace(/\.reserve$/, ''))
      return match && name.startsWith(`${stem}`) ? [Number(match[2] ?? 1)] : []
    })
    for (let suffix = Math.max(0, ...suffixes) + 1; ; suffix++) {
      file = `${stem}${suffix === 1 ? '' : `-${suffix}`}.sqlite`
      const candidate = join(folder, file)
      const lock = `${candidate}.reserve`
      try {
        closeSync(openSync(lock, 'wx'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw error
      }
      if (existsSync(candidate)) {
        removeOwn(lock)
        continue
      }
      reservation = lock
      break
    }
    temporary = join(folder, `.backup-${randomUUID()}.tmp`)
    sqlite.prepare('VACUUM INTO ?').run(temporary)
    renameSync(temporary, join(folder, file))
    temporary = null
    // 완성 파일만 보관 수에 넣는다. 예약 파일은 다른 세션의 정리 대상이 아니다.
    prune(folder)
    session.sessionFile = file
    return file
  } catch (error) {
    if (isBusy(error)) throw error
    throw new BackupError(error)
  } finally {
    if (temporary !== null) removeOwn(temporary)
    if (reservation !== null) removeOwn(reservation)
  }
}
