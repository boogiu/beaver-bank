import { app } from 'electron'
import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readMigrationRecords } from './db/status'
import type { ChatSource } from '../shared/chat'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './db/schema'
import { withDatabase, listPurposes, listAccounts, listCards, listFlows } from './db/service'

export function checkChatData(source: ChatSource): string | null {
  const path = join(
    app.getPath('appData'),
    source === 'demo' ? 'BeaverBank-demo' : 'BeaverBank',
    'beaverbank-dev.sqlite'
  )
  if (!existsSync(path))
    return source === 'demo'
      ? '데모 데이터가 없습니다. 저장소에서 npm run demo를 한 번 실행한 뒤 다시 시도해 주세요.'
      : 'BeaverBank 데이터가 없습니다. 앱을 한 번 실행한 뒤 다시 시도해 주세요.'
  const mismatch =
    'DB가 이 서버와 다른 판입니다. 저장소를 최신으로 받아 다시 빌드하고 앱을 한 번 실행한 뒤 다시 시도해 주세요.'
  let database: Database.Database | undefined
  try {
    const folder = join(app.getAppPath(), 'drizzle')
    const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
      entries: { tag: string; when: number }[]
    }
    database = new Database(path, { readonly: true, fileMustExist: true, timeout: 1000 })
    const records = readMigrationRecords(database)
    return records?.length === journal.entries.length &&
      journal.entries.every(
        (entry, index) =>
          records[index].createdAt === entry.when &&
          records[index].hash ===
            createHash('sha256')
              .update(readFileSync(join(folder, `${entry.tag}.sql`), 'utf8'))
              .digest('hex')
      )
      ? null
      : mismatch
  } catch {
    return mismatch
  } finally {
    database?.close()
  }
}

export function readChatNames(source: ChatSource): Record<string, Record<string, string>> {
  let database: Database.Database | undefined
  try {
    database = new Database(
      join(
        app.getPath('appData'),
        source === 'demo' ? 'BeaverBank-demo' : 'BeaverBank',
        'beaverbank-dev.sqlite'
      ),
      { readonly: true, fileMustExist: true, timeout: 1000 }
    )
    return withDatabase(drizzle(database, { schema }), () =>
      Object.fromEntries(
        Object.entries({
          purpose: listPurposes(),
          account: listAccounts(true),
          card: listCards(true),
          flow: listFlows(true)
        }).map(([kind, rows]) => [
          kind,
          Object.fromEntries(rows.map((row) => [String(row.id), row.name]))
        ])
      )
    )
  } catch {
    return {}
  } finally {
    database?.close()
  }
}
