import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Account, Flow, MonthlyFlows, Occurrence } from '@shared/ipc'
import { AddButton, Button, EmptyState, Icon } from '../components/Ui'
import { FLOW_INFO, money } from '../components/domain-ui'
import { HOLIDAYS } from '@shared/holidays'

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

export default function MonthlyFlowsView({
  month,
  monthly,
  flows,
  accounts,
  onMonthChange,
  onAdd,
  onOpen
}: {
  month: Month
  monthly: MonthlyFlows | null
  flows: Flow[]
  accounts: Account[]
  onMonthChange: (next: Month) => void
  onAdd: () => void
  onOpen: (item: Occurrence) => void
}): React.JSX.Element {
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
      {(month.year < 2026 || month.year > 2030) && (
        <p className="form-note">{month.year}년 공휴일 정보는 앱에 없습니다.</p>
      )}
      {flows.length === 0 ? (
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
            <AddButton disabled={!accounts.some((account) => account.isActive)} onClick={onAdd}>
              흐름 추가
            </AddButton>
          }
        />
      ) : (
        <>
          <div className="month-totals">
            {(
              [
                ['수입 합계', totals?.income],
                ['이체 합계', totals?.transfer],
                ['정기 결제 합계', totals?.payment],
                ['남는 금액', totals?.remaining]
              ] as const
            ).map(([label, amount]) => (
              <div className="panel month-total" key={label}>
                <span>{label}</span>
                <strong>{money(amount ?? 0)}</strong>
              </div>
            ))}
          </div>
          {items.length === 0 ? (
            <div className="panel month-empty">이 달에는 회차가 없습니다.</div>
          ) : (
            <div className="month-days">
              {[...groups].map(([date, occurrences]) => {
                const weekday = new Date(`${date}T00:00:00`).getDay()
                return (
                  <section className="section month-day" key={date}>
                    <h2>
                      {month.month}월 {Number(date.slice(8))}일 ({weekdays[weekday]})
                      {(weekday === 0 || weekday === 6) && (
                        <span className="badge amber">주말</span>
                      )}
                      {HOLIDAYS[date] && <span className="badge amber">{HOLIDAYS[date]}</span>}
                      {date === currentDate() && <span className="badge today">오늘</span>}
                    </h2>
                    <div className="flow-list">
                      {occurrences.map((item) => (
                        <button
                          key={item.flow.id}
                          className={`item-card occurrence-card ${item.action === 'skip' ? 'inactive' : ''}`}
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
                            {item.flow.toAccount && <span>{accountName(item.flow.toAccount)}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
          {totals && totals.accounts.length > 0 && (
            <section className="section account-totals">
              <h2>계좌별 합계</h2>
              <div className="flow-list">
                {totals.accounts.map((total) => {
                  const account = accounts.find((item) => item.id === total.id)
                  return (
                    <div className="item-card account-total" key={total.id}>
                      <strong>
                        {account?.name ?? '계좌'}{' '}
                        {!account?.isActive && <span className="badge">해지</span>}
                      </strong>
                      <span>들어오는 돈 {money(total.incoming)}</span>
                      <span>나가는 돈 {money(total.outgoing)}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
