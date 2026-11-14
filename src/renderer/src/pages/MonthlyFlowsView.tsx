import { Entrance } from '../components/Entrance'
import { Fragment } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Account, Flow, MonthlyFlows, Occurrence } from '@shared/ipc'
import { AddButton, Button, EmptyState, Icon } from '../components/Ui'
import { FLOW_INFO, money } from '../components/domain-ui'
import { HOLIDAYS } from '@shared/holidays'
import { useVisibleValue } from '../hooks/useVisibleOnce'

type Month = { year: number; month: number }
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const currentDate = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const moveMonth = (value: Month, delta: number): Month => {
  const date = new Date(value.year, value.month - 1 + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

// 이 달의 합계 한 장: 수입이 정기 결제와 남는 금액으로 나뉘는 모습을 막대 하나로 보인다.
// 이체는 내 계좌 사이의 이동이라 나눔에 넣지 않고 옆에 따로 둔다.
function MonthSplit({ totals }: { totals: MonthlyFlows['totals'] }): React.JSX.Element {
  const { ref, value: progress } = useVisibleValue<HTMLDivElement>(100)
  const base = Math.max(totals.income, totals.payment)
  const width = (amount: number): string =>
    `${base > 0 ? (Math.max(0, amount) / base) * progress : 0}%`
  const percent = (amount: number): string | null =>
    totals.income > 0 && amount >= 0 ? `${((amount / totals.income) * 100).toFixed(1)}%` : null
  return (
    <section className="panel month-split" aria-label="이 달의 합계">
      <div className="month-split-head">
        <div>
          <span className="muted">수입 합계</span>
          <strong className="month-split-income">{money(totals.income)}</strong>
        </div>
        <div className="month-split-side">
          <span className="muted">
            <Icon icon={FLOW_INFO.transfer.icon} size={14} />
            이체 합계
          </span>
          <strong>{money(totals.transfer)}</strong>
        </div>
      </div>
      <div ref={ref} className="month-split-bar" aria-hidden="true">
        <span className="payment" style={{ width: width(totals.payment) }} />
        <span className="remaining" style={{ width: width(totals.remaining) }} />
      </div>
      <dl className="month-split-legend">
        <div className="payment">
          <dt>정기 결제 합계</dt>
          <dd>
            <strong>{money(totals.payment)}</strong>
            {percent(totals.payment) && <span className="muted">{percent(totals.payment)}</span>}
          </dd>
        </div>
        <div className="remaining">
          <dt>남는 금액</dt>
          <dd>
            <strong className={totals.remaining < 0 ? 'negative' : ''}>
              {money(totals.remaining)}
            </strong>
            {percent(totals.remaining) && (
              <span className="muted">{percent(totals.remaining)}</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}

export default function MonthlyFlowsView({
  month,
  monthly,
  flows,
  accounts,
  entranceStart,
  monthVersion,
  onMonthChange,
  onAdd,
  onOpen
}: {
  month: Month
  monthly: MonthlyFlows | null
  flows: Flow[]
  accounts: Account[]
  entranceStart: number
  monthVersion: number
  onMonthChange: (next: Month) => void
  onAdd: () => void
  onOpen: (item: Occurrence) => void
}): React.JSX.Element {
  let entranceIndex = monthVersion === 0 ? entranceStart + 1 : 0

  const items =
    monthly?.year === month.year && monthly.month === month.month ? monthly.occurrences : []
  const totals =
    monthly?.year === month.year && monthly.month === month.month ? monthly.totals : null
  const groups = new Map<string, Occurrence[]>()
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item])
  const accountName = (value: Occurrence['flow']['fromAccount']): React.ReactNode =>
    value && (
      <>
        {value.name}
        {!value.isActive && <span className="badge">해지</span>}
      </>
    )
  return (
    <>
      <Entrance order={entranceStart}>
        <div className="month-nav">
          <Button icon={ChevronLeft} onClick={() => onMonthChange(moveMonth(month, -1))}>
            이전 달
          </Button>
          <h2>
            {month.year}년 {month.month}월
          </h2>
          <Button icon={ChevronRight} onClick={() => onMonthChange(moveMonth(month, 1))}>
            다음 달
          </Button>
          <Button
            onClick={() => {
              const now = new Date()
              onMonthChange({ year: now.getFullYear(), month: now.getMonth() + 1 })
            }}
          >
            이번 달
          </Button>
        </div>
      </Entrance>
      {totals && (
        <Fragment key={`${month.year}-${month.month}`}>
          {(month.year < 2026 || month.year > 2030) && (
            <Entrance order={entranceIndex++}>
              <p className="form-note">{month.year}년 공휴일 정보는 앱에 없습니다.</p>
            </Entrance>
          )}
          {flows.length === 0 ? (
            <Entrance order={entranceIndex++}>
              <EmptyState
                kind="accounts"
                title={
                  accounts.some((account) => account.isActive)
                    ? '등록된 흐름이 없습니다'
                    : '사용 중인 계좌가 없습니다'
                }
                description={
                  accounts.some((account) => account.isActive)
                    ? '정기 흐름을 추가해 보세요.'
                    : '계좌를 먼저 추가해 주세요.'
                }
                action={
                  <AddButton
                    disabled={!accounts.some((account) => account.isActive)}
                    onClick={onAdd}
                  >
                    흐름 추가
                  </AddButton>
                }
              />
            </Entrance>
          ) : (
            <>
              <Entrance order={entranceIndex++}>
                <MonthSplit totals={totals} />
              </Entrance>
              {items.length === 0 ? (
                <Entrance order={entranceIndex++}>
                  <div className="panel month-empty">이 달에는 회차가 없습니다.</div>
                </Entrance>
              ) : (
                <div className="month-days">
                  {[...groups].map(([date, occurrences]) => {
                    const weekday = new Date(`${date}T00:00:00`).getDay()
                    return (
                      <section
                        className={`section month-day ${date === currentDate() ? 'today' : ''}`}
                        key={date}
                      >
                        <Entrance order={entranceIndex++}>
                          <h2>
                            {month.month}월 {Number(date.slice(8))}일 ({weekdays[weekday]})
                            {(weekday === 0 || weekday === 6) && (
                              <span className="badge amber">주말</span>
                            )}
                            {HOLIDAYS[date] && (
                              <span className="badge amber">{HOLIDAYS[date]}</span>
                            )}
                            {date === currentDate() && <span className="badge today">오늘</span>}
                          </h2>
                        </Entrance>
                        <div className="flow-list">
                          {occurrences.map((item) => (
                            <Entrance order={entranceIndex++} wrap key={item.flow.id}>
                              <button
                                className={`item-card occurrence-card kind-${item.kind} ${item.action === 'skip' ? 'inactive' : ''}`}
                                onClick={() => onOpen(item)}
                              >
                                <span className="flow-ident">
                                  <Icon icon={FLOW_INFO[item.kind].icon} size={18} />
                                  <strong className="flow-name">{item.flow.name}</strong>
                                  {item.flow.isVariable && <span className="badge">변동</span>}
                                  {item.action !== 'original' && (
                                    <span className="badge">
                                      {item.action === 'skip' ? '건너뜀' : '금액 변경'}
                                    </span>
                                  )}
                                </span>
                                <span className="flow-amount">{money(item.amount)}</span>
                                <span className="flow-meta">
                                  {item.flow.fromAccount && (
                                    <span>{accountName(item.flow.fromAccount)}</span>
                                  )}
                                  {item.kind === 'transfer' && <Icon icon={ArrowRight} size={18} />}
                                  {item.flow.toAccount && (
                                    <span>{accountName(item.flow.toAccount)}</span>
                                  )}
                                </span>
                              </button>
                            </Entrance>
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
              {totals && totals.accounts.length > 0 && (
                <section className="section account-totals">
                  <Entrance order={entranceIndex++}>
                    <h2>계좌별 합계</h2>
                  </Entrance>
                  <div className="flow-list">
                    {totals.accounts.map((total) => {
                      const account = accounts.find((item) => item.id === total.id)
                      return (
                        <Entrance order={entranceIndex++} key={total.id}>
                          <div className="item-card account-total">
                            <strong>
                              {account?.name ?? '계좌'}{' '}
                              {!account?.isActive && <span className="badge">해지</span>}
                            </strong>
                            <span>들어오는 돈 {money(total.incoming)}</span>
                            <span>나가는 돈 {money(total.outgoing)}</span>
                            <span className="month-end-balance">
                              {total.balance === null ? (
                                <span className="muted">잔액 미입력</span>
                              ) : (
                                <>
                                  월말 잔액{' '}
                                  <span className={total.balance < 0 ? 'negative' : ''}>
                                    {money(total.balance)}
                                  </span>
                                  {total.predicted && <span className="badge">예상</span>}
                                </>
                              )}
                            </span>
                          </div>
                        </Entrance>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </Fragment>
      )}
    </>
  )
}
