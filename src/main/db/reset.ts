import Database from 'better-sqlite3'
import { rmSync } from 'fs'

// DB 파일(-wal, -shm 포함)을 지워 빈 상태로 만든다. electron을 불러오지 않는다.
// 다른 프로세스(MCP 서버의 조회)가 파일을 열고 있으면 Windows는 삭제를 EPERM/EBUSY로 막는다.
// 본 파일은 0.3초 동안 다시 시도하고, 그래도 지우지 못하면 파일을 둔 채 안의 내용만 비운다.
// 내용 비우기는 SQLite 잠금으로 조회와 차례를 맞추므로 연속 조회 중에도 끝난다.
// 본 파일을 지운 뒤의 -wal, -shm은 전체 약 2초 안에서 다시 시도한다.
export function clearDatabaseFiles(file: string, retryMs = 2000, emptyAfterMs = 300): void {
  const started = Date.now()
  const deadline = started + retryMs
  const pause = new Int32Array(new SharedArrayBuffer(4))
  for (const suffix of ['', '-wal', '-shm']) {
    for (;;) {
      try {
        rmSync(file + suffix, { force: true })
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EBUSY' && code !== 'EPERM') throw error
        if (suffix === '' && Date.now() - started >= emptyAfterMs) {
          emptyDatabase(file)
          return
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw error
        Atomics.wait(pause, 0, 0, Math.min(5, remaining))
      }
    }
  }
}

// 모든 테이블·뷰·트리거·인덱스를 지운다(마이그레이션 기록 포함). 다음 migrate가 처음부터 다시 만든다.
function emptyDatabase(file: string): void {
  const sqlite = new Database(file, { fileMustExist: true, timeout: 5000 })
  try {
    sqlite.pragma('foreign_keys = OFF')
    sqlite
      .transaction(() => {
        const rows = sqlite
          .prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
          .all() as { type: string; name: string }[]
        for (const type of ['view', 'trigger', 'index', 'table'])
          for (const row of rows)
            if (row.type === type)
              sqlite.exec(`DROP ${type} IF EXISTS "${row.name.replace(/"/g, '""')}"`)
      })
      .immediate()
  } finally {
    sqlite.close()
  }
}
