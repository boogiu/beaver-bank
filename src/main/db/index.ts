import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import type { DbStatus } from '../../shared/ipc'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

const TABLES = [
  'purposes',
  'accounts',
  'cards',
  'savings_details',
  'flows',
  'flow_overrides',
  'balance_snapshots'
] as const

let sqlite: Database.Database | null = null
let db: AppDatabase | null = null

// DB는 프로젝트 폴더 밖(%APPDATA%\BeaverBank)에 둔다.
// 개발 중에는 실제 데이터를 건드리지 않도록 별도 파일을 쓴다.
export function getDbPath(): string {
  const fileName = app.isPackaged ? 'beaverbank.sqlite' : 'beaverbank-dev.sqlite'
  return join(app.getPath('userData'), fileName)
}

function getMigrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

export function openDatabase(): AppDatabase {
  if (db) return db

  mkdirSync(app.getPath('userData'), { recursive: true })
  sqlite = new Database(getDbPath())
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: getMigrationsFolder() })
  return db
}

export function closeDatabase(): void {
  sqlite?.close()
  sqlite = null
  db = null
}

export function getDbStatus(): DbStatus {
  if (!sqlite) throw new Error('DB가 열려 있지 않습니다.')
  const conn = sqlite

  const count = (table: string): number =>
    (conn.prepare(`select count(*) as n from "${table}"`).get() as { n: number }).n

  return {
    path: getDbPath(),
    isDev: !app.isPackaged,
    migrations: count('__drizzle_migrations'),
    tables: TABLES.map((name) => ({ name, rows: count(name) }))
  }
}
