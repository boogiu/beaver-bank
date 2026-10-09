import { useEffect, useState } from 'react'
import type { DashboardData } from '@shared/ipc'
import type { PageProps } from '../App'
import { Button, EmptyState, Icon } from '../components/Ui'
import { FLOW_INFO, money } from '../components/domain-ui'
import DashboardDonut from '../components/DashboardDonut'

function AssetAmount({
  amount,
  missingCount
}: {
  amount: number | null
  missingCount: number
}): React.JSX.Element {
  return amount === null ? (
    <span className="muted">잔액 미입력</span>
  ) : (
    <>
      <span className={amount < 0 ? 'negative' : ''}>{money(amount)}</span>
      {missingCount > 0 && <span className="muted dashboard-missing">미입력 {missingCount}개</span>}
    </>
  )
}

export default function DashboardPage({ navigate }: PageProps): React.JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    window.api
      .getDashboard()
      .then((result) => {
        if (!active) return
        if (result.ok) setData(result.data)
        else setError(result.error.message)
      })
      .catch(() => {
        if (active) setError('대시보드를 불러오지 못했습니다. 다시 시도해 주세요.')
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <header className="page-head dashboard-head">
        <div>
          <h1>대시보드</h1>
          <p>자산과 이번 달의 돈 흐름을 한눈에 확인하세요.</p>
        </div>
        {data && <span className="muted dashboard-date">{data.date} 기준</span>}
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="muted" role="status">
          불러오는 중입니다.
        </p>
      )}
      {data &&
        (data.accountCount === 0 ? (
          <EmptyState
            kind="accounts"
            title="사용 중인 계좌가 없습니다"
            description="사용 중인 계좌가 없습니다. 계좌를 등록하면 자산과 흐름을 볼 수 있습니다."
            action={<Button onClick={() => navigate('accounts')}>계좌 페이지로 이동</Button>}
          />
        ) : (
          <div className="dashboard-panels">
            <section className="panel dashboard-panel" aria-labelledby="assets-title">
              <h2 id="assets-title">자산 요약</h2>
              <div className="dashboard-total">
                <span className="muted">전체 잔액</span>
                <div className="dashboard-total-value">
                  <AssetAmount amount={data.assets.total} missingCount={data.missingCount} />
                </div>
              </div>
              <div className="dashboard-assets">
                <div className="dashboard-composition">
                  {data.assets.composition.map((item) => (
                    <button
                      type="button"
                      className="dashboard-composition-row"
                      key={item.purposeId ?? 'none'}
                      onClick={() =>
                        item.purposeId === null
                          ? navigate('accounts')
                          : navigate('purposes', {
                              kind: 'purpose',
                              id: item.purposeId,
                              inactive: false
                            })
                      }
                    >
                      <span
                        className="dashboard-color"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="dashboard-name">{item.name}</span>
                      <span className="dashboard-composition-value">
                        <AssetAmount amount={item.amount} missingCount={item.missingCount} />
                      </span>
                      {item.share !== null && (
                        <span className="muted dashboard-share">{item.share.toFixed(1)}%</span>
                      )}
                    </button>
                  ))}
                </div>
                {data.assets.composition.some((item) => item.share !== null) ? (
                  <DashboardDonut items={data.assets.composition} />
                ) : (
                  <p className="muted dashboard-no-chart">표시할 금액이 없습니다</p>
                )}
              </div>
              {data.missingCount > 0 && (
                <div className="dashboard-missing-note">
                  <p>잔액 미입력 계좌 {data.missingCount}개는 합계와 추이에 포함되지 않습니다.</p>
                  <Button onClick={() => navigate('accounts')}>계좌 페이지로 이동</Button>
                </div>
              )}
            </section>
            <section className="panel dashboard-panel" aria-labelledby="month-title">
              <h2 id="month-title">이번 달 흐름</h2>
              <p className="muted dashboard-month">
                {data.month.year}년 {data.month.month}월
              </p>
              <dl className="dashboard-month-totals">
                <div className="dashboard-income">
                  <dt>수입 합계</dt>
                  <dd>{money(data.month.income)}</dd>
                  <dd className="muted dashboard-planned">
                    들어올 예정 {money(data.month.incoming)}
                  </dd>
                </div>
                <div className="dashboard-payment">
                  <dt>정기 결제 합계</dt>
                  <dd>{money(data.month.payment)}</dd>
                  <dd className="muted dashboard-planned">
                    나갈 예정 {money(data.month.outgoing)}
                  </dd>
                </div>
                <div className="dashboard-remaining">
                  <dt>남는 금액</dt>
                  <dd>{money(data.month.remaining)}</dd>
                </div>
              </dl>
              <h3>다가오는 회차</h3>
              {data.upcoming.total === 0 ? (
                <p className="muted">다가오는 회차가 없습니다</p>
              ) : (
                <div className="dashboard-upcoming">
                  {data.upcoming.items.map((item) => (
                    <button
                      type="button"
                      className="dashboard-occurrence"
                      key={`${item.flowId}:${item.date}`}
                      onClick={() =>
                        navigate('flows', { kind: 'flow', id: item.flowId, inactive: false })
                      }
                    >
                      <Icon icon={FLOW_INFO[item.kind].icon} size={18} />
                      <span className="sr-only">{FLOW_INFO[item.kind].label}</span>
                      <span className="dashboard-occurrence-detail">
                        <span className="dashboard-name">{item.name}</span>
                        <span className="muted dashboard-occurrence-date">
                          {item.date}
                          <span>{item.days}일 뒤</span>
                        </span>
                      </span>
                      <span className="dashboard-occurrence-value">{money(item.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
              {data.upcoming.total > 5 && (
                <p className="muted dashboard-more">
                  외 {data.upcoming.total - data.upcoming.items.length}건
                </p>
              )}
              <Button onClick={() => navigate('flows')}>흐름 페이지로 이동</Button>
            </section>
          </div>
        ))}
    </>
  )
}
