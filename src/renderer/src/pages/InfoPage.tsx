import { useEffect, useState } from 'react'
import type { DbStatus } from '@shared/ipc'

const TABLE_LABELS: Record<string, string> = {
  purposes: '용도',
  accounts: '계좌',
  savings_details: '적금·예금 정보',
  cards: '결제 카드',
  flows: '정기 흐름',
  flow_overrides: '회차 예외',
  balance_snapshots: '잔액 보정'
}

export default function InfoPage(): React.JSX.Element {
  const [status, setStatus] = useState<DbStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.api
      .getDbStatus()
      .then((result) => (result.ok ? setStatus(result.data) : setError(result.error.message)))
      .catch(() => setError('DB 상태를 읽지 못했습니다.'))
  }, [])
  return (
    <>
      <header className="page-head">
        <div>
          <h1>정보</h1>
          <p>데이터베이스와 앱의 현재 상태</p>
        </div>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {status && (
        <div className="panel info-panel">
          <div>
            <span className="muted">DB 파일 {status.isDev && '(개발용)'}</span>
            <p className="path-text">{status.path}</p>
          </div>
          <p>적용된 마이그레이션: {status.migrations}개</p>
          <div className="status-grid">
            {status.tables.map((table) => (
              <div className="status-item" key={table.name}>
                <span>{TABLE_LABELS[table.name] ?? table.name}</span>
                <strong>{table.rows}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
