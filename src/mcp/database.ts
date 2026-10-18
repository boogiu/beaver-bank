import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { statSync } from 'node:fs'
import { withDatabase } from '../main/db/service'
import { readMigrationRecords, readTableCounts } from '../main/db/status'
import * as schema from '../main/db/schema'
import { mismatchMessage, noDatabaseMessage } from './messages'
import type { Options } from './options'

export interface DatabaseState {
  state: 'ready' | 'no_database' | 'schema_mismatch'
  message: string | null
  migrations: { applied: number; expected: number }
  counts: Record<string, number> | null
}
function withConnection<T>(
  options: Options,
  writable: boolean,
  work: (state: DatabaseState, sqlite: Database.Database | null) => T
): T {
  const state: DatabaseState = {
    state: 'no_database',
    message: noDatabaseMessage(options.source),
    migrations: { applied: 0, expected: __MCP_MIGRATIONS__.length },
    counts: null
  }
  try {
    statSync(options.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return work(state, null)
    throw error
  }
  const sqlite = new Database(options.path, {
    readonly: !writable,
    fileMustExist: true,
    timeout: 5000
  })
  try {
    if (writable) sqlite.pragma('foreign_keys = ON')
    const records = readMigrationRecords(sqlite)
    state.migrations.applied = records?.length ?? 0
    const matches =
      records !== null &&
      records.length === __MCP_MIGRATIONS__.length &&
      records.every(
        (row, i) =>
          row.hash === __MCP_MIGRATIONS__[i].hash &&
          row.createdAt === __MCP_MIGRATIONS__[i].createdAt
      )
    state.state = matches ? 'ready' : 'schema_mismatch'
    state.message = matches ? null : mismatchMessage
    if (!matches) return work(state, sqlite)
    state.counts = Object.fromEntries(readTableCounts(sqlite).map(({ name, rows }) => [name, rows]))
    return withDatabase(drizzle(sqlite, { schema }), () => work(state, sqlite))
  } finally {
    sqlite.close()
  }
}

export function withReadDatabase<T>(options: Options, work: (state: DatabaseState) => T): T {
  return withConnection(options, false, work)
}
export function withWriteDatabase<T>(
  options: Options,
  work: (state: DatabaseState, sqlite: Database.Database | null) => T
): T {
  return withConnection(options, true, work)
}
