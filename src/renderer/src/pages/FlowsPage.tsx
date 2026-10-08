import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Ban, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type {
  Account,
  ApiError,
  Card,
  Flow,
  FlowInput,
  MonthlyFlows,
  Occurrence,
  Purpose
} from '@shared/ipc'
import type { FlowCategory, FlowKind } from '@shared/domain'
import type { PageProps } from '../App'
import { AddButton, Button, EmptyState, Icon, Switch } from '../components/Ui'
import { ConfirmModal, Field, Modal, Select } from '../components/Modal'
import { FLOW_CATEGORY, FLOW_INFO, money } from '../components/domain-ui'
import MonthlyFlowsView from './MonthlyFlowsView'
import OccurrenceModal from './OccurrenceModal'
import { AmountInput } from '../components/AmountInput'

const categories: Record<FlowKind, FlowCategory[]> = {
  income: ['salary', 'other'],
  transfer: ['savings', 'allocation', 'other'],
  payment: ['subscription', 'insurance', 'telecom', 'utility', 'loan', 'other']
}
const today = (): string => {
  const date = new Date()
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const blank = (): FlowInput => ({
  name: '',
  kind: 'income',
  amount: 0,
  isVariable: false,
  fromAccountId: null,
  toAccountId: null,
  cardId: null,
  category: 'other',
  cycle: 'monthly',
  day: 1,
  month: null,
  startDate: today(),
  endDate: null,
  memo: null
})
const editable = (flow: Flow): FlowInput => ({
  name: flow.name,
  kind: flow.kind,
  amount: flow.amount,
  isVariable: flow.isVariable,
  fromAccountId: flow.fromAccountId,
  toAccountId: flow.toAccountId,
  cardId: flow.cardId,
  category: flow.category,
  cycle: flow.cycle,
  day: flow.day,
  month: flow.month,
  startDate: flow.startDate,
  endDate: flow.endDate,
  memo: flow.memo
})
const conditional = (input: FlowInput, flow: Flow): boolean =>
  input.amount !== flow.amount ||
  input.cycle !== flow.cycle ||
  input.month !== flow.month ||
  input.day !== flow.day ||
  input.fromAccountId !== flow.fromAccountId ||
  input.toAccountId !== flow.toAccountId
const choiceAccount = (account: Account): string =>
  `${account.name} · ${account.bank}${account.isActive ? '' : ' (해지)'}`
const inputNumber = (value: string): number => (/^\d+$/.test(value) ? Number(value) : Number.NaN)

function FlowForm({
  flow,
  accounts,
  cards,
  purposes,
  onClose,
  onSaved
}: {
  flow: Flow | null
  accounts: Account[]
  cards: Card[]
  purposes: Purpose[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [value, setValue] = useState<FlowInput>(flow ? editable(flow) : blank)
  const [amount, setAmount] = useState(flow ? flow.amount.toLocaleString('ko-KR') : '')
  const [day, setDay] = useState(flow ? String(flow.day) : '')
  const [month, setMonth] = useState(flow?.month == null ? '' : String(flow.month))
  const [effective, setEffective] = useState(
    flow ? (today() > flow.startDate ? today() : flow.startDate) : ''
  )
  const [error, setError] = useState<ApiError | null>(null)
  const set = <K extends keyof FlowInput>(key: K, next: FlowInput[K]): void => {
    setValue((old) => ({ ...old, [key]: next }))
    setError(null)
  }
  const ordered = [...accounts].sort((a, b) => {
    const rank = (account: Account): number =>
      account.purposeId === null
        ? Number.MAX_SAFE_INTEGER
        : (purposes.find((p) => p.id === account.purposeId)?.sortOrder ?? Number.MAX_SAFE_INTEGER)
    return rank(a) - rank(b) || a.sortOrder - b.sortOrder || a.id - b.id
  })
  const accountOptions = (
    field: 'fromAccountId' | 'toAccountId'
  ): { value: string; label: string }[] => [
    { value: '', label: '계좌 선택' },
    ...ordered
      .filter((account) => account.isActive || account.id === flow?.[field])
      .map((account) => ({ value: String(account.id), label: choiceAccount(account) }))
  ]
  const cardOptions = [
    { value: '', label: '결제 카드 없음' },
    ...cards
      .filter((card) => card.isActive || card.id === flow?.cardId)
      .map((card) => ({
        value: String(card.id),
        label: `${card.name} · ${card.issuer}${card.isActive ? '' : ' (해지)'}`
      }))
  ]
  const input: FlowInput = {
    ...value,
    amount: amount === '' ? Number.NaN : inputNumber(amount.replaceAll(',', '')),
    day: inputNumber(day),
    month: value.cycle === 'yearly' ? inputNumber(month) : null
  }
  const changesConditions = flow !== null && conditional(input, flow)
  const save = async (): Promise<void> => {
    const result = flow
      ? await window.api.updateFlow(flow.id, input, changesConditions ? effective : null)
      : await window.api.addFlow(input)
    if (result.ok) onSaved()
    else setError(result.error)
  }
  return (
    <Modal title={flow ? '흐름 수정' : '흐름 추가'} onClose={onClose} onSubmit={save} error={error}>
      <div className="form-grid">
        <Field name="name" label="이름" error={error}>
          <input
            value={value.name}
            className={error?.field === 'name' ? 'invalid' : ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field name="kind" label="종류" error={error}>
          {flow ? (
            <div className="read-only-field">{FLOW_INFO[value.kind].label}</div>
          ) : (
            <Select
              value={value.kind}
              invalid={error?.field === 'kind'}
              options={(Object.keys(FLOW_INFO) as FlowKind[]).map((kind) => ({
                value: kind,
                label: FLOW_INFO[kind].label,
                icon: FLOW_INFO[kind].icon
              }))}
              onChange={(next) => {
                const kind = next as FlowKind
                setValue((old) => ({
                  ...old,
                  kind,
                  category: categories[kind].includes(old.category) ? old.category : 'other',
                  fromAccountId: kind === 'income' ? null : old.fromAccountId,
                  toAccountId: kind === 'payment' ? null : old.toAccountId,
                  cardId: kind === 'payment' ? old.cardId : null
                }))
                setError(null)
              }}
            />
          )}
        </Field>
        <Field name="category" label="분류" error={error}>
          <Select
            value={value.category}
            invalid={error?.field === 'category'}
            options={categories[value.kind].map((item) => ({
              value: item,
              label: FLOW_CATEGORY[item]
            }))}
            onChange={(next) => set('category', next as FlowCategory)}
          />
        </Field>
        <Field name="amount" label="금액 (원)" error={error}>
          <AmountInput
            value={amount}
            invalid={error?.field === 'amount'}
            onChange={(next) => {
              setAmount(next)
              setError(null)
            }}
          />
        </Field>
        <Field name="cycle" label="주기" error={error}>
          <Select
            value={value.cycle}
            invalid={error?.field === 'cycle'}
            options={[
              { value: 'monthly', label: '매월' },
              { value: 'yearly', label: '매년' }
            ]}
            onChange={(next) => set('cycle', next as FlowInput['cycle'])}
          />
        </Field>
        {value.cycle === 'yearly' && (
          <Field name="month" label="지정 월" error={error}>
            <input
              value={month}
              inputMode="numeric"
              placeholder="1~12"
              className={error?.field === 'month' ? 'invalid' : ''}
              onChange={(e) => {
                setMonth(e.target.value)
                setError(null)
              }}
            />
          </Field>
        )}
        <Field name="day" label="지정일" error={error}>
          <input
            value={day}
            inputMode="numeric"
            placeholder="1~31"
            className={error?.field === 'day' ? 'invalid' : ''}
            onChange={(e) => {
              setDay(e.target.value)
              setError(null)
            }}
          />
        </Field>
        {value.kind !== 'income' && (
          <Field name="fromAccountId" label="보내는 계좌" error={error}>
            <Select
              value={String(value.fromAccountId ?? '')}
              options={accountOptions('fromAccountId')}
              invalid={error?.field === 'fromAccountId'}
              onChange={(next) => set('fromAccountId', next ? Number(next) : null)}
            />
          </Field>
        )}
        {value.kind !== 'payment' && (
          <Field name="toAccountId" label="받는 계좌" error={error}>
            <Select
              value={String(value.toAccountId ?? '')}
              options={accountOptions('toAccountId')}
              invalid={error?.field === 'toAccountId'}
              onChange={(next) => set('toAccountId', next ? Number(next) : null)}
            />
          </Field>
        )}
        {value.kind === 'payment' && (
          <Field name="cardId" label="결제 카드" error={error}>
            <Select
              value={String(value.cardId ?? '')}
              options={cardOptions}
              invalid={error?.field === 'cardId'}
              onChange={(next) => set('cardId', next ? Number(next) : null)}
            />
          </Field>
        )}
        <Field name="isVariable" label="변동 금액" error={error}>
          <Switch
            label="변동 금액"
            checked={value.isVariable}
            onChange={(next) => set('isVariable', next)}
          />
        </Field>
        <Field name="startDate" label="시작일" error={error}>
          <input
            value={value.startDate}
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            className={error?.field === 'startDate' ? 'invalid' : ''}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
        <Field name="endDate" label="종료일 (선택)" error={error}>
          <input
            value={value.endDate ?? ''}
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            className={error?.field === 'endDate' ? 'invalid' : ''}
            onChange={(e) => set('endDate', e.target.value || null)}
          />
        </Field>
        {changesConditions && (
          <>
            <Field name="effectiveStartDate" label="적용 시작일" error={error}>
              <input
                value={effective}
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                className={error?.field === 'effectiveStartDate' ? 'invalid' : ''}
                onChange={(e) => {
                  setEffective(e.target.value)
                  setError(null)
                }}
              />
            </Field>
            <p className="form-note">
              적용 시작일 전날까지 기존 조건을 유지하고, 그날부터 새 조건이 적용됩니다. 이후 날짜의
              회차 예외는 새 흐름으로 옮겨지지 않습니다.
            </p>
          </>
        )}
        <Field name="memo" label="메모" error={error} wide>
          <textarea
            value={value.memo ?? ''}
            className={error?.field === 'memo' ? 'invalid' : ''}
            onChange={(e) => set('memo', e.target.value || null)}
          />
        </Field>
      </div>
    </Modal>
  )
}

function EndForm({
  flow,
  onClose,
  onSaved
}: {
  flow: Flow
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [endDate, setEndDate] = useState(
    flow.endDate ?? (today() > flow.startDate ? today() : flow.startDate)
  )
  const [error, setError] = useState<ApiError | null>(null)
  const save = async (): Promise<void> => {
    const result = await window.api.endFlow(flow.id, endDate)
    if (result.ok) onSaved()
    else setError(result.error)
  }
  return (
    <Modal title="흐름 종료" onClose={onClose} onSubmit={save} error={error} small>
      <div className="form-grid">
        <Field name="endDate" label="종료일" error={error} wide>
          <input
            value={endDate}
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            className={error?.field === 'endDate' ? 'invalid' : ''}
            onChange={(e) => {
              setEndDate(e.target.value)
              setError(null)
            }}
          />
        </Field>
        <p className="form-note">
          종료일 다음 날부터 회차가 생기지 않습니다. 이후 날짜의 회차 예외도 쓰이지 않습니다.
        </p>
      </div>
    </Modal>
  )
}

export default function FlowsPage({ target, clearTarget }: PageProps): React.JSX.Element {
  const [flows, setFlows] = useState<Flow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [purposes, setPurposes] = useState<Purpose[]>([])
  const [showEnded, setShowEnded] = useState(false)
  const [editing, setEditing] = useState<Flow | 'add' | null>(null)
  const [ending, setEnding] = useState<Flow | null>(null)
  const [deleting, setDeleting] = useState<Flow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'monthly' | 'flows'>(
    target?.kind === 'flow' ? 'flows' : 'monthly'
  )
  const [month, setMonth] = useState(() => ({
    year: Number(today().slice(0, 4)),
    month: Number(today().slice(5, 7))
  }))
  const [monthly, setMonthly] = useState<MonthlyFlows | null>(null)
  const [monthlyRevision, setMonthlyRevision] = useState(0)
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null)
  const targetRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (view === 'flows' && target?.kind === 'flow' && flows.length) {
      targetRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [view, target, flows])
  useEffect(() => {
    let active = true
    void window.api.listMonthlyFlows(month.year, month.month).then((result) => {
      if (!active) return
      if (result.ok) setMonthly(result.data)
      else setError(result.error.message)
    })
    return () => {
      active = false
    }
  }, [month, monthlyRevision])
  const refresh = async (): Promise<void> => {
    const [flowResult, accountResult, cardResult, purposeResult] = await Promise.all([
      window.api.listFlows(true),
      window.api.listAccounts(true),
      window.api.listCards(true),
      window.api.listPurposes()
    ])
    if (flowResult.ok) setFlows(flowResult.data)
    else setError(flowResult.error.message)
    if (accountResult.ok) setAccounts(accountResult.data)
    else setError(accountResult.error.message)
    if (cardResult.ok) setCards(cardResult.data)
    else setError(cardResult.error.message)
    if (purposeResult.ok) setPurposes(purposeResult.data)
    else setError(purposeResult.error.message)
    setMonthlyRevision((value) => value + 1)
  }
  useEffect(() => {
    void Promise.all([
      window.api.listFlows(true),
      window.api.listAccounts(true),
      window.api.listCards(true),
      window.api.listPurposes()
    ]).then(([flowResult, accountResult, cardResult, purposeResult]) => {
      if (flowResult.ok) setFlows(flowResult.data)
      else setError(flowResult.error.message)
      if (accountResult.ok) setAccounts(accountResult.data)
      else setError(accountResult.error.message)
      if (cardResult.ok) setCards(cardResult.data)
      else setError(cardResult.error.message)
      if (purposeResult.ok) setPurposes(purposeResult.data)
      else setError(purposeResult.error.message)
    })
  }, [])
  const saved = (): void => {
    setEditing(null)
    setEnding(null)
    void refresh()
  }
  const resume = async (flow: Flow): Promise<void> => {
    const result = await window.api.resumeFlow(flow.id)
    if (result.ok) void refresh()
    else setError(result.error.message)
  }
  const remove = async (): Promise<void> => {
    if (!deleting) return
    const result = await window.api.deleteFlow(deleting.id)
    if (result.ok) {
      setDeleting(null)
      void refresh()
    } else setError(result.error.message)
  }
  const shown = flows.filter((flow) => showEnded || flow.status !== 'ended')
  const order = (a: Flow, b: Flow): number =>
    (a.cycle === 'monthly' ? 0 : 1) - (b.cycle === 'monthly' ? 0 : 1) ||
    (a.month ?? 0) - (b.month ?? 0) ||
    a.day - b.day ||
    a.sortOrder - b.sortOrder
  const accountText = (account: Flow['fromAccount']): React.ReactNode =>
    account && (
      <>
        {account.name}
        {!account.isActive && <span className="badge">해지</span>}
      </>
    )
  return (
    <>
      <header className="page-head">
        <div>
          <h1>흐름</h1>
          <p>반복되는 돈의 움직임을 관리합니다.</p>
        </div>
        <div className="page-actions">
          <div className="view-switch" role="group" aria-label="흐름 보기 선택">
            <Button
              variant={view === 'monthly' ? 'primary' : undefined}
              onClick={() => {
                setView('monthly')
                clearTarget()
              }}
            >
              월별 보기
            </Button>
            <Button
              variant={view === 'flows' ? 'primary' : undefined}
              onClick={() => {
                setView('flows')
                clearTarget()
              }}
            >
              흐름 보기
            </Button>
          </div>
          {view === 'flows' && (
            <Switch label="종료한 흐름 보기" checked={showEnded} onChange={setShowEnded} />
          )}
          <AddButton
            disabled={!accounts.some((account) => account.isActive)}
            onClick={() => setEditing('add')}
          >
            흐름 추가
          </AddButton>
        </div>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {view === 'monthly' ? (
        <MonthlyFlowsView
          month={month}
          monthly={monthly}
          flows={flows}
          accounts={accounts}
          onMonthChange={setMonth}
          onAdd={() => setEditing('add')}
          onOpen={setOccurrence}
        />
      ) : !accounts.some((account) => account.isActive) ? (
        <EmptyState
          kind="accounts"
          title="사용 중인 계좌가 없습니다"
          description="계좌를 먼저 추가해 주세요."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          kind="accounts"
          title="표시할 흐름이 없습니다"
          description="정기 흐름을 추가해 보세요."
          action={<AddButton onClick={() => setEditing('add')}>흐름 추가</AddButton>}
        />
      ) : (
        (['income', 'transfer', 'payment'] as FlowKind[]).map((kind) => {
          const members = shown.filter((flow) => flow.kind === kind).sort(order)
          if (!members.length) return null
          return (
            <section className="section" key={kind}>
              <h2>
                <Icon icon={FLOW_INFO[kind].icon} size={18} />
                {FLOW_INFO[kind].label}
              </h2>
              <div className="flow-list">
                {members.map((flow) => (
                  <article
                    ref={target?.kind === 'flow' && target.id === flow.id ? targetRef : undefined}
                    className={`item-card flow-card ${flow.status === 'ended' ? 'inactive' : ''} ${target?.kind === 'flow' && target.id === flow.id ? 'highlighted' : ''}`}
                    key={flow.id}
                  >
                    <div className="flow-main">
                      <div className="flow-ident">
                        <Icon icon={FLOW_INFO[flow.kind].icon} size={18} />
                        <strong className="flow-name" title={flow.name}>
                          {flow.name}
                        </strong>
                        <span className="muted">{FLOW_CATEGORY[flow.category]}</span>
                        {flow.isVariable && <span className="badge">변동</span>}
                        {flow.status === 'scheduled' && <span className="badge">예정</span>}
                        {flow.status === 'ended' && <span className="badge">종료</span>}
                      </div>
                      <div className="flow-amount">{money(flow.amount)}</div>
                    </div>
                    <div className="flow-meta">
                      <span>
                        {flow.cycle === 'monthly'
                          ? `매월 ${flow.day}일`
                          : `매년 ${flow.month}월 ${flow.day}일`}
                      </span>
                      {flow.fromAccount && <span>{accountText(flow.fromAccount)}</span>}
                      {flow.kind === 'transfer' && <Icon icon={ArrowRight} size={18} />}
                      {flow.toAccount && <span>{accountText(flow.toAccount)}</span>}
                      {flow.card && (
                        <span>
                          · {flow.card.name}
                          {!flow.card.isActive && <span className="badge">해지</span>}
                        </span>
                      )}
                      {flow.startDate > today() && <span>{flow.startDate}부터</span>}
                      {flow.endDate && <span>{flow.endDate}까지</span>}
                    </div>
                    <div className="card-actions">
                      {flow.status === 'ended' ? (
                        <Button icon={RotateCcw} onClick={() => void resume(flow)}>
                          종료 취소
                        </Button>
                      ) : (
                        <>
                          <Button icon={Pencil} onClick={() => setEditing(flow)}>
                            수정
                          </Button>
                          <Button icon={Ban} onClick={() => setEnding(flow)}>
                            종료
                          </Button>
                        </>
                      )}
                      <Button icon={Trash2} onClick={() => setDeleting(flow)}>
                        삭제
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })
      )}
      {editing && (
        <FlowForm
          flow={editing === 'add' ? null : editing}
          accounts={accounts}
          cards={cards}
          purposes={purposes}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {ending && <EndForm flow={ending} onClose={() => setEnding(null)} onSaved={saved} />}
      {occurrence && (
        <OccurrenceModal
          occurrence={occurrence}
          onClose={() => setOccurrence(null)}
          onSaved={async () => {
            await refresh()
            setOccurrence(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="흐름 삭제"
          confirmLabel="삭제"
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove()}
          message={
            <>
              <strong>{deleting.name}</strong>과(와) 저장된 회차 예외 {deleting.overrideCount}개를
              삭제합니다. 지난 회차까지 지워지고 복구할 수 없습니다. 미래 회차만 멈추려면 종료를
              사용해 주세요.
            </>
          }
        />
      )}
    </>
  )
}
