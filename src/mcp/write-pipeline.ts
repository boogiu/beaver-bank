import type { WriteInput, WriteName } from './write-tools'
import { writeTool, type WriteCapture } from './writes'
import { attempt } from '../main/db/service'
import type { Options } from './options'
import type { WriteSession } from './session'
import { writeSchemas } from './write-tools'
import { withWriteDatabase } from './database'
import { BackupError, ensureBackup, isBusy } from './backup'
import { appendWriteLog, type WriteError, type WriteResult } from './write-log'

function writeError(error: unknown): WriteError {
  if (isBusy(error))
    return {
      kind: 'busy',
      message: '다른 프로그램이 데이터를 쓰는 중입니다. 잠시 뒤 다시 시도해 주세요.'
    }
  if (error instanceof BackupError) return { kind: 'backup_failed', message: error.message }
  const result = attempt(() => {
    throw error
  })
  if (!result.ok) return result.error
  throw new Error('오류를 변환하지 못했습니다.')
}

// 공개 등록은 백업·기록·동시 사용 안전까지 완성한 뒤 연결한다.
export function executeWrite<N extends WriteName>(
  name: N,
  input: WriteInput<N>,
  memos: boolean,
  capture: WriteCapture
): object {
  return writeTool(name, input, memos, capture)
}

export function runWrite<N extends WriteName>(
  name: N,
  input: WriteInput<N>,
  options: Options,
  session: WriteSession
): object {
  const time = session.now()
  const originalInput = structuredClone(input)
  const parsed = writeSchemas[name].safeParse(input)
  if (!parsed.success)
    return { source: options.source, error: { kind: 'validation', message: parsed.error.message } }
  let backup: string | null = null
  try {
    return withWriteDatabase(options, (state, sqlite) => {
      if (state.state !== 'ready' || sqlite === null)
        return { source: options.source, error: { kind: state.state, message: state.message } }
      backup = ensureBackup(sqlite, options, session)
      const capture: WriteCapture = { before: null, after: null }
      let result: WriteResult
      let invoked = false
      try {
        result = {
          ok: true,
          data: sqlite
            .transaction(() => {
              invoked = true
              return executeWrite(name, parsed.data as WriteInput<N>, options.memos, capture)
            })
            .immediate()
        }
      } catch (error) {
        result = { ok: false, error: writeError(error) }
      }
      const warning = invoked
        ? appendWriteLog(options, session, name, originalInput, result, capture, backup, time)
        : undefined
      return {
        source: options.source,
        ...(result.ok ? result.data : { error: result.error }),
        ...(backup ? { backup: { file: backup } } : {}),
        ...(warning ? { warning } : {})
      }
    })
  } catch (error) {
    const failure = writeError(error)
    return {
      source: options.source,
      error: failure,
      ...(backup ? { backup: { file: backup } } : {})
    }
  }
}
