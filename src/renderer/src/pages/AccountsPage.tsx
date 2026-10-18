import { useExternalRefresh } from '../hooks/useExternalRefresh'
import { Entrance } from '../components/Entrance'
import { AmountInput } from '../components/AmountInput'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ACCOUNT_TYPES, INTEREST_TYPES, TAX_TYPES } from '@shared/domain'
import type {
  Account,
  AccountBalance,
  AccountInput,
  ApiError,
  DashboardData,
  Flow,
  Purpose,
  PurposeAmount
} from '@shared/ipc'
import type { PageProps } from '../App'
import { AddButton, EmptyState, PurposeAmountLabel, Switch } from '../components/Ui'
import { AccountPassbook } from '../components/AccountPassbook'
import { ConfirmModal, Field, Modal, Select } from '../components/Modal'
import { ACCOUNT_INFO } from '../components/domain-ui'
import BalanceModal from './BalanceModal'

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
              <AmountInput
                value={amount}
                invalid={error?.field === 'targetAmount'}
                onChange={(next) => {
                  setAmount(next)
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
  let entranceIndex = 0

  const [opened, setOpened] = useState<Record<number, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [purposes, setPurposes] = useState<Purpose[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [amounts, setAmounts] = useState<PurposeAmount[]>([])
  const [flows, setFlows] = useState<Flow[] | null>(null)
  const [savings, setSavings] = useState<DashboardData['savings']>([])
  const [balancing, setBalancing] = useState<Account | null>(null)
  const [showInactive, setShowInactive] = useState(target?.kind === 'account' && target.inactive)
  const [editing, setEditing] = useState<Account | null | 'add'>(null)
  const [closing, setClosing] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useExternalRefresh(async () => {
    const [accountResult, purposeResult, balanceResult, amountResult, flowResult, dashboardResult] =
      await Promise.all([
        window.api.listAccounts(true),
        window.api.listPurposes(),
        window.api.listBalances(),
        window.api.listPurposeAmounts(),
        window.api.listFlows(),
        window.api.getDashboard()
      ])
    return () => {
      setError(null)
      setFlows(flowResult.ok ? flowResult.data : null)
      if (!flowResult.ok) setError(flowResult.error.message)
      setSavings(dashboardResult.ok ? dashboardResult.data.savings : [])
      if (!dashboardResult.ok) setError(dashboardResult.error.message)
      if (accountResult.ok) setAccounts(accountResult.data)
      else setError(accountResult.error.message)
      if (purposeResult.ok) setPurposes(purposeResult.data)
      else setError(purposeResult.error.message)
      if (balanceResult.ok) setBalances(balanceResult.data)
      else setError(balanceResult.error.message)
      if (amountResult.ok) setAmounts(amountResult.data)
      else setError(amountResult.error.message)
      setLoaded(accountResult.ok && purposeResult.ok && balanceResult.ok && amountResult.ok)
    }
  }, [])
  useEffect(() => {
    if (target?.kind === 'account')
      document.getElementById(`account-${target.id}`)?.scrollIntoView({ block: 'center' })
  }, [target, loaded, showInactive])
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
      <Entrance order={entranceIndex++}>
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
      </Entrance>
      {error && <p className="error-banner">{error}</p>}
      {loaded &&
        (shown.length === 0 ? (
          <Entrance order={entranceIndex++}>
            <EmptyState
              kind="accounts"
              title="등록된 계좌가 없습니다"
              description="계좌를 추가해 용도별로 정리해 보세요."
              action={<AddButton onClick={() => setEditing('add')}>계좌 추가</AddButton>}
            />
          </Entrance>
        ) : (
          <div className="passbook-groups">
            {groups.map((group) => {
              const members = shown.filter((account) => account.purposeId === group.id)
              if (!members.length) return null
              return (
                <section
                  className="passbook-group"
                  key={group.id ?? 'none'}
                  style={{ '--passbook-count': members.length } as CSSProperties}
                >
                  <Entrance order={entranceIndex++}>
                    <h2>
                      {group.color && (
                        <span className="color-dot" style={{ backgroundColor: group.color }} />
                      )}
                      <span className="purpose-heading-name">{group.label}</span>
                      <PurposeAmountLabel
                        value={amounts.find((row) => row.purposeId === group.id)}
                      />
                    </h2>
                  </Entrance>
                  <div className="passbook-grid">
                    {members.map((account) => (
                      <Entrance order={entranceIndex++} wrap key={account.id}>
                        <AccountPassbook
                          open={opened[account.id] ?? false}
                          onOpenChange={(open) =>
                            setOpened((old) => ({ ...old, [account.id]: open }))
                          }
                          account={account}
                          balance={balances.find((row) => row.accountId === account.id)}
                          purpose={purposes.find((purpose) => purpose.id === account.purposeId)}
                          progress={savings.find((row) => row.accountId === account.id)?.progress}
                          flows={flows}
                          highlighted={target?.kind === 'account' && target.id === account.id}
                          onEdit={() => setEditing(account)}
                          onClose={() => setClosing(account)}
                          onBalance={() => setBalancing(account)}
                          onRestore={() => void restore(account.id)}
                        />
                      </Entrance>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ))}
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
      {balancing && (
        <BalanceModal
          account={balancing}
          onClose={() => setBalancing(null)}
          onChanged={() => {
            void refresh()
          }}
          onSaved={() => setBalancing(null)}
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
