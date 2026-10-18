import type Database from 'better-sqlite3'

const TABLES = [
  'purposes',
  'accounts',
  'cards',
  'savings_details',
  'flows',
  'flow_overrides',
  'balance_snapshots'
] as const

export function readMigrationRecords(
  conn: Database.Database
): { hash: string; createdAt: number }[] | null {
  const exists = conn
    .prepare(
      "select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'"
    )
    .get()
  if (!exists) return null
  return conn
    .prepare('select hash, created_at as createdAt from __drizzle_migrations order by rowid')
    .all() as { hash: string; createdAt: number }[]
}

export function readTableCounts(conn: Database.Database): { name: string; rows: number }[] {
  return TABLES.map((name) => ({
    name,
    rows: (conn.prepare(`select count(*) as n from "${name}"`).get() as { n: number }).n
  }))
}
