import { useEffect, useState } from 'react'
import type { DashboardData } from '@shared/ipc'
import type { PageProps } from '../App'
import { Button, EmptyState, Icon } from '../components/Ui'
import { ACCOUNT_INFO, FLOW_INFO, money } from '../components/domain-ui'
import DashboardDonut from '../components/DashboardDonut'
import DashboardTrend from '../components/DashboardTrend'

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

function ProgressBar({
  value,
  target = false
}: {
  value: number
  target?: boolean
}): React.JSX.Element {
  return (
    <span className={`dashboard-progress ${target ? 'target' : ''}`} aria-hidden="true">
      <span style={{ width: `${Math.min(100, value)}%` }} />
    </span>
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
            <section className="panel dashboard-panel" aria-labelledby="trend-title">
              <h2 id="trend-title">예상 잔액 추이</h2>
              {data.trend.points.length ? (
                <>
                  <div className="dashboard-trend-summary">
                    <span>
                      오늘 <AssetAmount amount={data.trend.points[0].amount} missingCount={0} />
                    </span>
                    <span>
                      {data.trend.points.at(-1)!.date} <span className="badge">예상</span>{' '}
                      <AssetAmount amount={data.trend.points.at(-1)!.amount} missingCount={0} />
                    </span>
                    <span className="muted">
                      {data.trend.change! > 0 ? '+' : ''}
                      {money(data.trend.change!)}
                    </span>
                  </div>
                  <DashboardTrend points={data.trend.points} />
                </>
              ) : (
                <p className="muted">잔액을 입력하면 예상 잔액 추이가 보입니다</p>
              )}
            </section>
            <section className="panel dashboard-panel" aria-labelledby="savings-title">
              <h2 id="savings-title">적금·예금 진행</h2>
              {data.savings.length === 0 ? (
                <p className="muted">사용 중인 적금·예금 계좌가 없습니다</p>
              ) : (
                <>
                  <div className="dashboard-savings-list">
                    {data.savings.map((item) => (
                      <button
                        type="button"
                        className="dashboard-saving"
                        key={item.accountId}
                        onClick={() =>
                          navigate('accounts', {
                            kind: 'account',
                            id: item.accountId,
                            inactive: false
                          })
                        }
                      >
                        <span className="dashboard-saving-title">
                          <Icon icon={ACCOUNT_INFO[item.type].icon} size={18} />
                          <span className="muted">{ACCOUNT_INFO[item.type].label}</span>
                          <strong className="dashboard-name">{item.name}</strong>
                        </span>
                        <span className="muted dashboard-saving-info">
                          <span>
                            {item.startDate} ~ {item.maturityDate}
                          </span>
                          <span>연 {item.interestRate}%</span>
                          <span>{item.interestType === 'simple' ? '단리' : '복리'}</span>
                          <span>
                            {
                              { normal: '일반과세', preferential: '세금우대', tax_free: '비과세' }[
                                item.taxType
                              ]
                            }
                          </span>
                        </span>
                        <span className="muted dashboard-saving-line">
                          <span>기간 {item.progress}%</span>
                          <span>
                            {item.remainingDays > 0
                              ? `만기까지 ${item.remainingDays}일`
                              : item.remainingDays === 0
                                ? '오늘 만기'
                                : '만기 지남'}
                          </span>
                        </span>
                        <ProgressBar value={item.progress} />
                        <span className="dashboard-saving-line">
                          잔액 <AssetAmount amount={item.balance} missingCount={0} />
                        </span>
                        {item.targetAmount !== null && item.targetAmount > 0 && (
                          <span className="dashboard-saving-target">
                            <span className="dashboard-saving-line">
                              <span>목표 {money(item.targetAmount)}</span>
                              {item.targetProgress !== null && (
                                <span className="muted">{item.targetProgress}%</span>
                              )}
                            </span>
                            {item.targetProgress !== null && (
                              <ProgressBar value={item.targetProgress} target />
                            )}
                          </span>
                        )}
                        <span className="dashboard-saving-line dashboard-maturity">
                          <span>
                            만기 예상 수령액{' '}
                            <AssetAmount amount={item.maturity?.total ?? null} missingCount={0} />
                          </span>
                          {item.maturity && <span className="muted dashboard-estimate">추정</span>}
                        </span>
                        {item.maturity && (
                          <span className="dashboard-saving-info">
                            <span>
                              원금 <AssetAmount amount={item.maturity.principal} missingCount={0} />
                            </span>
                            <span>세후 이자 {money(item.maturity.afterTaxInterest)}</span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="muted dashboard-estimate-note">
                    만기 예상 수령액은 등록된 흐름이 그대로 실행된다고 보고 계산한 추정값이며 실제
                    수령액과 다를 수 있습니다.
                  </p>
                </>
              )}
            </section>
          </div>
        ))}
    </>
  )
}
