import { join } from 'node:path'
import { todayDate } from '../shared/balances'
import type { DatabaseState } from './database'
import { notice } from './messages'
import type { Options } from './options'

interface Status {
  source: Options['source']
  server: { name: string; version: string }
  write: false
  memos: boolean
  today: string
  database: DatabaseState & { path: string }
  backup: { folder: string; keep: number; sessionFile: null }
  log: { folder: string }
  notice: string
}

export function getStatus(options: Options, state: DatabaseState): Status {
  return {
    source: options.source,
    server: { name: 'beaverbank', version: __MCP_VERSION__ },
    write: false,
    memos: options.memos,
    today: todayDate(),
    database: { path: join(options.displayFolder, 'beaverbank-dev.sqlite'), ...state },
    backup: { folder: join(options.displayFolder, 'mcp', 'backups'), keep: 20, sessionFile: null },
    log: { folder: join(options.displayFolder, 'mcp') },
    notice
  }
}
