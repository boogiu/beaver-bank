import { useEffect, useRef, useState } from 'react'
import type { Account, ApiError, BalanceBefore, BalanceHistory } from '@shared/ipc'
import { Pencil, Trash2 } from 'lucide-react'
import { todayDate } from '@shared/balances'
import { AmountInput } from '../components/AmountInput'
import { ConfirmModal, Field, Modal } from '../components/Modal'
import { Button } from '../components/Ui'
import { money } from '../components/domain-ui'

export default function BalanceModal({
  account,
  onClose,
  onChanged,
  onSaved
}: {
  account: Account
  onClose: () => void
  onChanged: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayDate)
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [preview, setPreview] = useState<{ date: string; data: BalanceBefore | null } | null>(null)
  const [history, setHistory] = useState<BalanceHistory[]>([])
  const [removing, setRemoving] = useState<BalanceHistory | null>(null)
  const [revision, setRevision] = useState(0)
  const fields = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    void window.api.getBalanceBefore(account.id, date).then((result) => {
      if (active) setPreview({ date, data: result.ok ? result.data : null })
    })
    return () => {
      active = false
    }
  }, [account.id, date, revision])
  useEffect(() => {
    let active = true
    void window.api.listBalanceSnapshots(account.id).then((result) => {
      if (!active) return
      if (result.ok) setHistory(result.data)
      else setError({ ...result.error, field: undefined })
    })
    return () => {
      active = false
    }
  }, [account.id, revision])
  const focusInput = (): void => {
    requestAnimationFrame(() => {
      fields.current?.scrollIntoView({ block: 'nearest' })
      fields.current?.querySelector<HTMLInputElement>('input')?.focus()
    })
  }
  const edit = (row: BalanceHistory): void => {
    setAmount(row.balance.toLocaleString('ko-KR'))
    setDate(row.date)
    setMemo(row.memo ?? '')
    setError(null)
    focusInput()
  }
  const askRemove = async (id: number): Promise<void> => {
    const result = await window.api.listBalanceSnapshots(account.id)
    if (!result.ok) {
      setError({ ...result.error, field: undefined })
      return
    }
    setHistory(result.data)
    const latest = result.data.find((row) => row.id === id)
    if (latest) setRemoving(latest)
  }
  const cancelRemove = (): void => {
    setRemoving(null)
    focusInput()
  }
  const remove = async (): Promise<void> => {
    if (!removing || busy.current) return
    busy.current = true
    try {
      const result = await window.api.deleteBalanceSnapshot(removing.id)
      if (result.ok) {
        setRemoving(null)
        setRevision((value) => value + 1)
        setError(null)
        onChanged()
        focusInput()
      } else {
        setRemoving(null)
        setError({ ...result.error, field: undefined })
        focusInput()
      }
    } finally {
      busy.current = false
    }
  }
  const save = async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    try {
      const result = await window.api.saveBalanceSnapshot({
        accountId: account.id,
        date,
        balance: amount === '' || amount === '-' ? Number.NaN : Number(amount.replaceAll(',', '')),
        memo: memo || null
      })
      if (result.ok) {
        onChanged()
        onSaved()
      } else
        setError(
          ['balance', 'date', 'memo'].includes(result.error.field ?? '')
            ? result.error
            : { ...result.error, field: undefined }
        )
    } finally {
      busy.current = false
    }
  }
  const data = preview?.date === date ? preview.data : null
  return (
    <>
      <Modal title={`${account.name} 잔액 보정`} onClose={onClose} onSubmit={save} error={error}>
        <div className="form-grid balance-form" ref={fields}>
          <Field name="balance" label="실제 잔액 (원)" error={error}>
            <AmountInput
              value={amount}
              allowNegative
              invalid={error?.field === 'balance'}
              onChange={(value) => {
                setAmount(value)
                setError(null)
              }}
            />
          </Field>
          <Field name="date" label="보정 날짜" error={error}>
            <input
              value={date}
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              className={error?.field === 'date' ? 'invalid' : ''}
              onChange={(event) => {
                setDate(event.target.value)
                setError(null)
              }}
            />
          </Field>
          <Field name="memo" label="메모" error={error}>
            <textarea
              value={memo}
              className={error?.field === 'memo' ? 'invalid' : ''}
              onChange={(event) => {
                setMemo(event.target.value)
                setError(null)
              }}
            />
          </Field>
        </div>
        <p className="form-note">
          입력한 잔액은 보정 날짜가 끝난 시점의 잔액입니다. 그 다음 날의 회차부터 더하고 뺍니다.
        </p>
        {data && (
          <div className="balance-preview">
            <p className="muted">
              보정 전 잔액 {data.beforeBalance === null ? '없음' : money(data.beforeBalance)}
            </p>
            {data.occurrenceCount > 0 && (
              <p className="form-note">
                이 날짜의 관련 회차 {data.occurrenceCount}개는 입력한 잔액에 이미 반영된 것으로
                봅니다.
              </p>
            )}
            {data.existing && (
              <p className="form-note">
                이 날짜에 보정이 있습니다. 저장하면 기존 보정의 잔액과 메모가 바뀝니다.
              </p>
            )}
          </div>
        )}
        <section className="balance-history">
          <h3>보정 이력</h3>
          {history.length === 0 ? (
            <p className="muted">보정 이력이 없습니다</p>
          ) : (
            history.map((row) => (
              <div className="balance-history-row" key={row.id}>
                <span className="history-date">{row.date}</span>
                <span className="history-balance">{money(row.balance)}</span>
                <span className="history-difference muted">
                  {row.difference === null ? (
                    <span className="badge">시작 잔액</span>
                  ) : (
                    `${row.difference > 0 ? '+' : ''}${money(row.difference)}`
                  )}
                </span>
                {row.memo && <span className="history-memo">{row.memo}</span>}
                <div className="history-actions">
                  <Button
                    icon={Pencil}
                    data-enter-inert
                    aria-label={`${row.date} 보정 수정`}
                    onClick={() => edit(row)}
                  >
                    수정
                  </Button>
                  <Button
                    icon={Trash2}
                    data-enter-inert
                    aria-label={`${row.date} 보정 삭제`}
                    onClick={() => {
                      void askRemove(row.id)
                    }}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>
      </Modal>
      {removing && (
        <ConfirmModal
          title="보정 삭제"
          confirmLabel="삭제"
          onClose={cancelRemove}
          onConfirm={remove}
          message={
            <>
              {removing.date}의 보정 잔액 {money(removing.balance)}을(를) 삭제합니다. 지우면 되돌릴
              수 없습니다. 삭제 뒤에는 그보다 앞선 보정을 기준으로 잔액을 다시 계산하며, 앞선 보정이
              없으면 잔액 미입력이 됩니다.
            </>
          }
        />
      )}
    </>
  )
}
