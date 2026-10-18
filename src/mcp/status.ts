import { join } from 'node:path'
import { todayDate } from '../shared/balances'
import type { DatabaseState } from './database'
import { notice } from './messages'
import type { Options } from './options'
import type { WriteSession } from './session'

interface Status {
  source: Options['source']
  server: { name: string; version: string }
  write: boolean
  memos: boolean
  today: string
  database: DatabaseState & { path: string }
  backup: { folder: string; keep: number; sessionFile: string | null }
  log: { folder: string }
  notice: string
}

export function getStatus(options: Options, state: DatabaseState, session?: WriteSession): Status {
  return {
    source: options.source,
    server: { name: 'beaverbank', version: __MCP_VERSION__ },
    write: options.write,
    memos: options.memos,
    today: todayDate(),
    database: { path: join(options.displayFolder, 'beaverbank-dev.sqlite'), ...state },
    backup: {
      folder: join(options.displayFolder, 'mcp', 'backups'),
      keep: 20,
      sessionFile: session?.sessionFile ?? null
    },
    log: { folder: join(options.displayFolder, 'mcp') },
    notice
  }
}
