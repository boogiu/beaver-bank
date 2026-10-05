import { useEffect, useState } from 'react'
import { Pencil, RotateCcw, Ban } from 'lucide-react'
import { ACCOUNT_TYPES, INTEREST_TYPES, TAX_TYPES } from '@shared/domain'
import type { Account, AccountInput, ApiError, Purpose } from '@shared/ipc'
import type { PageProps } from '../App'
import { AddButton, Button, EmptyState, Icon, Switch } from '../components/Ui'
import { ConfirmModal, Field, Modal, Select } from '../components/Modal'
import { ACCOUNT_INFO, money } from '../components/domain-ui'

const blank: AccountInput = {
  name: '',
  bank: '',
  numberTail: null,
  type: 'checking',
  purposeId: null,
  memo: null,
  savings: null
}
const initialSavings = {
  startDate: '',
  maturityDate: '',
  interestRate: 0,
  interestType: 'simple' as const,
  taxType: 'normal' as const,
  targetAmount: null
}

function AccountForm({
  account,
  purposes,
  onClose,
  onSaved
}: {
  account: Account | null
  purposes: Purpose[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [value, setValue] = useState<AccountInput>(account ? { ...account } : blank)
  const [saving, setSaving] = useState(account?.savings ?? initialSavings)
  const [rate, setRate] = useState(account?.savings ? String(account.savings.interestRate) : '')
  const [amount, setAmount] = useState(
    account?.savings?.targetAmount == null
      ? ''
      : account.savings.targetAmount.toLocaleString('ko-KR')
  )
  const [error, setError] = useState<ApiError | null>(null)
  const set = <K extends keyof AccountInput>(key: K, next: AccountInput[K]): void => {
    setValue((old) => ({ ...old, [key]: next }))
    setError(null)
  }
  const save = async (): Promise<void> => {
    const savings =
      value.type === 'installment' || value.type === 'deposit'
        ? {
            ...saving,
            interestRate: /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(rate) ? Number(rate) : Number.NaN,
            targetAmount: amount === '' ? null : Number(amount.replaceAll(',', ''))
          }
        : null
    const input = { ...value, savings }
    const result = account
      ? await window.api.updateAccount(account.id, input)
      : await window.api.addAccount(input)
    if (result.ok) onSaved()
    else setError(result.error)
  }
  const savingType = value.type === 'installment' || value.type === 'deposit'
  return (
    <Modal
      title={account ? '계좌 수정' : '계좌 추가'}
      onClose={onClose}
      onSubmit={save}
      error={error}
    >
      <div className="form-grid">
        <Field name="name" label="계좌 이름" error={error}>
          <input
            value={value.name}
            className={error?.field === 'name' ? 'invalid' : ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field name="bank" label="금융기관" error={error}>
          <input
            value={value.bank}
            className={error?.field === 'bank' ? 'invalid' : ''}
            onChange={(e) => set('bank', e.target.value)}
          />
        </Field>
        <Field name="numberTail" label="계좌번호 끝자리" error={error}>
          <input
            value={value.numberTail ?? ''}
            inputMode="numeric"
            className={error?.field === 'numberTail' ? 'invalid' : ''}
            onChange={(e) => set('numberTail', e.target.value || null)}
            placeholder="숫자 1~4자리"
          />
        </Field>
        <Field name="type" label="종류" error={error}>
          <Select
            value={value.type}
            onChange={(next) => set('type', next as AccountInput['type'])}
            invalid={error?.field === 'type'}
            options={ACCOUNT_TYPES.map((type) => ({
              value: type,
              label: ACCOUNT_INFO[type].label,
              icon: ACCOUNT_INFO[type].icon
            }))}
          />
        </Field>
        <Field name="purposeId" label="용도" error={error}>
          <Select
            value={String(value.purposeId ?? '')}
            onChange={(next) => set('purposeId', next ? Number(next) : null)}
            invalid={error?.field === 'purposeId'}
            options={[
              { value: '', label: '용도 없음' },
              ...purposes.map((purpose) => ({
                value: String(purpose.id),
                label: purpose.name,
                color: purpose.color
              }))
            ]}
          />
        </Field>
        {savingType && (
          <>
            <Field name="startDate" label="가입일" error={error}>
              <input
                value={saving.startDate}
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                className={error?.field === 'startDate' ? 'invalid' : ''}
                onChange={(e) => {
                  setSaving({ ...saving, startDate: e.target.value })
                  setError(null)
                }}
              />
            </Field>
            <Field name="maturityDate" label="만기일" error={error}>
              <input
                value={saving.maturityDate}
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                className={error?.field === 'maturityDate' ? 'invalid' : ''}
                onChange={(e) => {
                  setSaving({ ...saving, maturityDate: e.target.value })
                  setError(null)
                }}
              />
            </Field>
            <Field name="interestRate" label="금리 (%)" error={error}>
              <input
                value={rate}
                inputMode="decimal"
                className={error?.field === 'interestRate' ? 'invalid' : ''}
                onChange={(e) => {
                  setRate(e.target.value)
                  setError(null)
                }}
              />
            </Field>
            <Field name="interestType" label="이자 방식" error={error}>
              <Select
                value={saving.interestType}
                onChange={(next) =>
                  setSaving({ ...saving, interestType: next as typeof saving.interestType })
                }
                options={INTEREST_TYPES.map((item) => ({
                  value: item,
                  label: item === 'simple' ? '단리' : '복리'
                }))}
              />
            </Field>
            <Field name="taxType" label="과세 방식" error={error}>
              <Select
                value={saving.taxType}
                onChange={(next) =>
                  setSaving({ ...saving, taxType: next as typeof saving.taxType })
                }
                options={TAX_TYPES.map((item) => ({
                  value: item,
                  label:
                    item === 'normal'
                      ? '일반과세 (15.4%)'
                      : item === 'tax_free'
                        ? '비과세'
                        : '세금우대 (9.5%)'
                }))}
              />
            </Field>
            <Field name="targetAmount" label="목표액 (원)" error={error}>
              <input
                value={amount}
                inputMode="numeric"
                className={error?.field === 'targetAmount' ? 'invalid' : ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  setAmount(digits ? Number(digits).toLocaleString('ko-KR') : '')
                  setError(null)
                }}
              />
            </Field>
          </>
        )}
        {account?.savings && !savingType && (
          <p className="form-note">적금·예금 정보가 지워집니다.</p>
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

export default function AccountsPage({ target }: PageProps): React.JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [purposes, setPurposes] = useState<Purpose[]>([])
  const [showInactive, setShowInactive] = useState(target?.kind === 'account' && target.inactive)
  const [editing, setEditing] = useState<Account | null | 'add'>(null)
  const [closing, setClosing] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = async (): Promise<void> => {
    const [accountResult, purposeResult] = await Promise.all([
      window.api.listAccounts(true),
      window.api.listPurposes()
    ])
    if (accountResult.ok) setAccounts(accountResult.data)
    else setError(accountResult.error.message)
    if (purposeResult.ok) setPurposes(purposeResult.data)
    else setError(purposeResult.error.message)
  }
  useEffect(() => {
    void Promise.all([window.api.listAccounts(true), window.api.listPurposes()]).then(
      ([accountResult, purposeResult]) => {
        if (accountResult.ok) setAccounts(accountResult.data)
        else setError(accountResult.error.message)
        if (purposeResult.ok) setPurposes(purposeResult.data)
        else setError(purposeResult.error.message)
      }
    )
  }, [])
  useEffect(() => {
    if (target?.kind === 'account')
      document.getElementById(`account-${target.id}`)?.scrollIntoView({ block: 'center' })
  }, [target, accounts, showInactive])
  const close = async (): Promise<void> => {
    if (!closing) return
    const result = await window.api.closeAccount(closing.id)
    if (result.ok) {
      setClosing(null)
      void refresh()
    } else setError(result.error.message)
  }
  const restore = async (id: number): Promise<void> => {
    const result = await window.api.restoreAccount(id)
    if (result.ok) void refresh()
    else setError(result.error.message)
  }
  const shown = accounts.filter((account) => showInactive || account.isActive)
  const groups = [
    ...purposes.map((purpose) => ({ id: purpose.id, label: purpose.name, color: purpose.color })),
    { id: null, label: '용도 없음', color: null }
  ]
  return (
    <>
      <header className="page-head">
        <div>
          <h1>계좌</h1>
          <p>용도에 따라 계좌를 관리합니다.</p>
        </div>
        <div className="page-actions">
          <Switch label="해지 계좌 보기" checked={showInactive} onChange={setShowInactive} />
          <AddButton onClick={() => setEditing('add')}>계좌 추가</AddButton>
        </div>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {shown.length === 0 ? (
        <EmptyState
          kind="accounts"
          title="등록된 계좌가 없습니다"
          description="계좌를 추가해 용도별로 정리해 보세요."
          action={<AddButton onClick={() => setEditing('add')}>계좌 추가</AddButton>}
        />
      ) : (
        groups.map((group) => {
          const members = shown.filter((account) => account.purposeId === group.id)
          if (!members.length) return null
          return (
            <section className="section" key={group.id ?? 'none'}>
              <h2>
                {group.color && (
                  <span className="color-dot" style={{ backgroundColor: group.color }} />
                )}
                {group.label}
              </h2>
              <div className="card-grid">
                {members.map((account) => {
                  const info = ACCOUNT_INFO[account.type]
                  return (
                    <article
                      id={`account-${account.id}`}
                      key={account.id}
                      className={`item-card ${!account.isActive ? 'inactive' : ''} ${target?.kind === 'account' && target.id === account.id ? 'highlighted' : ''}`}
                    >
                      <div className="card-top">
                        <div className="card-kind">
                          <Icon icon={info.icon} size={18} />
                          {info.label}
                        </div>
                        {!account.isActive && <span className="badge">해지</span>}
                      </div>
                      <div className="card-title" title={account.name}>
                        {account.name}
                      </div>
                      <div className="card-subtitle">
                        {account.bank}
                        {account.numberTail && ` · ${account.numberTail}`}
                      </div>
                      {group.color && (
                        <div className="card-purpose">
                          <span className="color-dot" style={{ backgroundColor: group.color }} />
                          {group.label}
                        </div>
                      )}
                      {account.savings && (
                        <div className="card-details">
                          {account.monthlyContribution > 0 && (
                            <span>월 납입 {money(account.monthlyContribution)}</span>
                          )}
                          <span>연 {account.savings.interestRate}%</span>
                          <span>{account.savings.maturityDate}</span>
                          {account.savings.targetAmount !== null && (
                            <span>{money(account.savings.targetAmount)}</span>
                          )}
                        </div>
                      )}
                      <div className="card-actions">
                        {account.isActive ? (
                          <>
                            <Button icon={Pencil} onClick={() => setEditing(account)}>
                              수정
                            </Button>
                            <Button icon={Ban} onClick={() => setClosing(account)}>
                              해지
                            </Button>
                          </>
                        ) : (
                          <Button icon={RotateCcw} onClick={() => restore(account.id)}>
                            복구
                          </Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
      {editing && (
        <AccountForm
          account={editing === 'add' ? null : editing}
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
          title="계좌 해지"
          message={
            <>
              {closing.name}을(를) 해지하면 목록에서 숨겨집니다. 계좌와 적금·예금 정보는 보존됩니다.
              {closing.flowCount > 0 && <> 관련 흐름 {closing.flowCount}개는 그대로 남습니다.</>}
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
