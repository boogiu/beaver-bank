import { useEffect, useState } from 'react'
import type { DbStatus } from '@shared/ipc'

const TABLE_LABELS: Record<string, string> = {
  purposes: '용도',
  accounts: '계좌',
  savings_details: '적금·예금 정보',
  flows: '정기 흐름',
  flow_overrides: '회차 예외',
  balance_snapshots: '잔액 보정'
}

function App(): React.JSX.Element {
  const [status, setStatus] = useState<DbStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getDbStatus()
      .then(setStatus)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  return (
    <main className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-xl rounded-2xl border border-amber-900/40 bg-stone-900/80 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-amber-200">🦫 BeaverBank</h1>
        <p className="mt-1 text-sm text-stone-400">1단계: 프로젝트 뼈대와 DB 준비</p>

        {error && <p className="mt-6 rounded-lg bg-red-950 p-4 text-sm text-red-300">{error}</p>}

        {status && (
          <div className="mt-6 space-y-4">
            <div className="text-sm">
              <div className="text-stone-400">
                DB 파일 {status.isDev && <span className="text-amber-400">(개발용)</span>}
              </div>
              <div className="mt-1 font-mono text-xs break-all text-stone-300">{status.path}</div>
            </div>

            <div className="text-sm text-stone-400">적용된 마이그레이션: {status.migrations}개</div>

            <ul className="grid grid-cols-2 gap-2">
              {status.tables.map((t) => (
                <li
                  key={t.name}
                  className="flex items-center justify-between rounded-lg bg-stone-800/70 px-4 py-2 text-sm"
                >
                  <span>{TABLE_LABELS[t.name] ?? t.name}</span>
                  <span className="font-mono text-stone-400">{t.rows}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}

export default App
