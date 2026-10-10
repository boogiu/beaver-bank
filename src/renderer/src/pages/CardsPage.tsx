import { Entrance } from '../components/Entrance'
import { useEffect, useState } from 'react'
import { Ban, Pencil, RotateCcw } from 'lucide-react'
import { CARD_TYPES } from '@shared/domain'
import type { Account, ApiError, Card, CardInput, Purpose } from '@shared/ipc'
import type { PageProps } from '../App'
import { AddButton, Button, EmptyState, Switch } from '../components/Ui'
import { ConfirmModal, Field, Modal, Select } from '../components/Modal'
import { CARD_INFO } from '../components/domain-ui'
import { PaymentCardFace } from '../components/PaymentCardFace'

const blank: CardInput = {
  name: '',
  issuer: '',
  type: 'debit',
  accountId: null,
  paymentDay: null,
  numberTail: null,
  memo: null
}

function CardForm({
  card,
  accounts,
  purposes,
  onClose,
  onSaved
}: {
  card: Card | null
  accounts: Account[]
  purposes: Purpose[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [value, setValue] = useState<CardInput>(card ? { ...card } : blank)
  const [day, setDay] = useState(card?.paymentDay == null ? '' : String(card.paymentDay))
  const [error, setError] = useState<ApiError | null>(null)
  const set = <K extends keyof CardInput>(key: K, next: CardInput[K]): void => {
    setValue((old) => ({ ...old, [key]: next }))
    setError(null)
  }
  const saving = async (): Promise<void> => {
    const input = {
      ...value,
      paymentDay: value.type === 'credit' ? (/^\d+$/.test(day) ? Number(day) : Number.NaN) : null
    }
    const result = card
      ? await window.api.updateCard(card.id, input)
      : await window.api.addCard(input)
    if (result.ok) onSaved()
    else setError(result.error)
  }
  const ordered = [...accounts].sort((a, b) => {
    const order = (account: Account): number =>
      account.purposeId === null
        ? Number.MAX_SAFE_INTEGER
        : (purposes.find((purpose) => purpose.id === account.purposeId)?.sortOrder ??
          Number.MAX_SAFE_INTEGER)
    return order(a) - order(b) || a.id - b.id
  })
  const choices = ordered.filter((account) => account.isActive || account.id === card?.accountId)
  return (
    <Modal
      title={card ? '카드 수정' : '카드 추가'}
      onClose={onClose}
      onSubmit={saving}
      error={error}
    >
      <div className="form-grid">
        <Field name="name" label="카드 이름" error={error}>
          <input
            value={value.name}
            className={error?.field === 'name' ? 'invalid' : ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field name="issuer" label="카드사" error={error}>
          <input
            value={value.issuer}
            className={error?.field === 'issuer' ? 'invalid' : ''}
            onChange={(e) => set('issuer', e.target.value)}
          />
        </Field>
        <Field name="type" label="종류" error={error}>
          <Select
            value={value.type}
            onChange={(next) => {
              set('type', next as CardInput['type'])
              if (next === 'debit') setDay('')
            }}
            invalid={error?.field === 'type'}
            options={CARD_TYPES.map((type) => ({
              value: type,
              label: CARD_INFO[type].label,
              icon: CARD_INFO[type].icon
            }))}
          />
        </Field>
        <Field name="accountId" label="연결 계좌" error={error}>
          <Select
            value={String(value.accountId ?? '')}
            onChange={(next) => set('accountId', next ? Number(next) : null)}
            invalid={error?.field === 'accountId'}
            options={[
              { value: '', label: '연결 계좌 없음' },
              ...choices.map((account) => ({
                value: String(account.id),
                label: `${account.name} · ${account.bank}${account.isActive ? '' : ' (해지)'}`
              }))
            ]}
          />
        </Field>
        {value.type === 'credit' && (
          <Field name="paymentDay" label="결제일" error={error}>
            <input
              value={day}
              inputMode="numeric"
              className={error?.field === 'paymentDay' ? 'invalid' : ''}
              onChange={(e) => {
                setDay(e.target.value)
                setError(null)
              }}
              placeholder="1~31"
            />
          </Field>
        )}
        <Field name="numberTail" label="번호 끝 4자리" error={error}>
          <input
            value={value.numberTail ?? ''}
            inputMode="numeric"
            className={error?.field === 'numberTail' ? 'invalid' : ''}
            onChange={(e) => set('numberTail', e.target.value || null)}
          />
        </Field>
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

export default function CardsPage({ target }: PageProps): React.JSX.Element {
  let entranceIndex = 0

  const [loaded, setLoaded] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [purposes, setPurposes] = useState<Purpose[]>([])
  const [showInactive, setShowInactive] = useState(target?.kind === 'card' && target.inactive)
  const [editing, setEditing] = useState<Card | null | 'add'>(null)
  const [closing, setClosing] = useState<Card | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = async (): Promise<void> => {
    const [cardResult, accountResult, purposeResult] = await Promise.all([
      window.api.listCards(true),
      window.api.listAccounts(true),
      window.api.listPurposes()
    ])
    if (cardResult.ok) setCards(cardResult.data)
    else setError(cardResult.error.message)
    if (accountResult.ok) setAccounts(accountResult.data)
    else setError(accountResult.error.message)
    if (purposeResult.ok) setPurposes(purposeResult.data)
    else setError(purposeResult.error.message)
    if (cardResult.ok && accountResult.ok && purposeResult.ok) setLoaded(true)
  }
  useEffect(() => {
    void Promise.all([
      window.api.listCards(true),
      window.api.listAccounts(true),
      window.api.listPurposes()
    ]).then(([cardResult, accountResult, purposeResult]) => {
      if (cardResult.ok) setCards(cardResult.data)
      else setError(cardResult.error.message)
      if (accountResult.ok) setAccounts(accountResult.data)
      else setError(accountResult.error.message)
      if (purposeResult.ok) setPurposes(purposeResult.data)
      else setError(purposeResult.error.message)
      if (cardResult.ok && accountResult.ok && purposeResult.ok) setLoaded(true)
    })
  }, [])
  useEffect(() => {
    if (target?.kind === 'card')
      document.getElementById(`card-${target.id}`)?.scrollIntoView({ block: 'center' })
  }, [target, cards, showInactive])
  const close = async (): Promise<void> => {
    if (!closing) return
    const result = await window.api.closeCard(closing.id)
    if (result.ok) {
      setClosing(null)
      void refresh()
    } else setError(result.error.message)
  }
  const restore = async (id: number): Promise<void> => {
    const result = await window.api.restoreCard(id)
    if (result.ok) void refresh()
    else setError(result.error.message)
  }
  const shown = cards.filter((card) => showInactive || card.isActive)
  return (
    <>
      <Entrance order={entranceIndex++}>
        <header className="page-head">
          <div>
            <h1>카드</h1>
            <p>결제 카드를 관리합니다.</p>
          </div>
          <div className="page-actions">
            <Switch label="해지 카드 보기" checked={showInactive} onChange={setShowInactive} />
            <AddButton onClick={() => setEditing('add')}>카드 추가</AddButton>
          </div>
        </header>
      </Entrance>
      {error && <p className="error-banner">{error}</p>}
      {loaded &&
        (shown.length === 0 ? (
          <Entrance order={entranceIndex++}>
            <EmptyState
              kind="cards"
              title="등록된 카드가 없습니다"
              description="결제 카드를 추가해 보세요."
              action={<AddButton onClick={() => setEditing('add')}>카드 추가</AddButton>}
            />
          </Entrance>
        ) : (
          <div className="payment-card-grid">
            {shown.map((card) => {
              const account = accounts.find((account) => account.id === card.accountId)
              const purpose = purposes.find((purpose) => purpose.id === account?.purposeId)
              return (
                <Entrance order={entranceIndex++} wrap key={card.id}>
                  <article
                    id={`card-${card.id}`}

                    className="payment-card-unit"
                  >
                    <PaymentCardFace
                      card={card}
                      purposeColor={purpose?.color}
                      highlighted={target?.kind === 'card' && target.id === card.id}
                    />
                    <div className="payment-card-actions">
                      {card.isActive ? (
                        <>
                          <Button icon={Pencil} onClick={() => setEditing(card)}>
                            수정
                          </Button>
                          <Button icon={Ban} onClick={() => setClosing(card)}>
                            해지
                          </Button>
                        </>
                      ) : (
                        <Button icon={RotateCcw} onClick={() => restore(card.id)}>
                          복구
                        </Button>
                      )}
                    </div>
                  </article>
                </Entrance>
              )
            })}
          </div>
        ))}
      {editing && (
        <CardForm
          card={editing === 'add' ? null : editing}
          accounts={accounts}
          purposes={purposes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      )}
      {closing && (
        <ConfirmModal
          title="카드 해지"
          message={
            <>
              {closing.name}을(를) 해지하면 목록에서 숨겨집니다. 결제 카드 정보는 보존됩니다.
              {closing.flowCount > 0 && (
                <> 관련 정기 결제 {closing.flowCount}개는 그대로 남습니다.</>
              )}
            </>
          }
          confirmLabel="해지"
          onClose={() => setClosing(null)}
          onConfirm={close}
        />
      )}
    </>
  )
}
