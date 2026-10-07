import { useState } from 'react'
import type { ApiError, Occurrence } from '@shared/ipc'
import { Field, Modal, Select } from '../components/Modal'
import { AmountInput } from '../components/AmountInput'
import { money } from '../components/domain-ui'

export default function OccurrenceModal({
  occurrence,
  onClose,
  onSaved
}: {
  occurrence: Occurrence
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [action, setAction] = useState(occurrence.action)
  const [amount, setAmount] = useState(
    occurrence.actualAmount === null ? '' : occurrence.actualAmount.toLocaleString('ko-KR')
  )
  const [memo, setMemo] = useState(occurrence.memo ?? '')
  const [error, setError] = useState<ApiError | null>(null)
  const save = async (): Promise<void> => {
    const result = await window.api.saveFlowOverride({
      flowId: occurrence.flow.id,
      occurrenceDate: occurrence.date,
      action,
      actualAmount:
        action === 'amount'
          ? /^\d+$/.test(amount.replaceAll(',', ''))
            ? Number(amount.replaceAll(',', ''))
            : Number.NaN
          : null,
      memo: action === 'original' ? null : memo || null
    })
    if (result.ok) onSaved()
    else setError(result.error)
  }
  return (
    <Modal
      title={`${occurrence.flow.name} · ${occurrence.date}`}
      onClose={onClose}
      onSubmit={save}
      error={error}
      small
    >
      <div className="form-grid">
        <div className="field wide">
          <span>원래 금액</span>
          <div className="read-only-field">{money(occurrence.originalAmount)}</div>
        </div>
        <Field name="action" label="처리" error={error} wide>
          <Select
            value={action}
            options={[
              { value: 'original', label: '원래대로' },
              { value: 'amount', label: '금액 변경' },
              { value: 'skip', label: '건너뛰기' }
            ]}
            onChange={(value) => {
              setAction(value as typeof action)
              setError(null)
            }}
          />
        </Field>
        {action === 'amount' && (
          <Field name="actualAmount" label="이번 회차 금액 (원)" error={error} wide>
            <AmountInput
              value={amount}
              invalid={error?.field === 'actualAmount'}
              onChange={(next) => {
                setAmount(next)
                setError(null)
              }}
            />
          </Field>
        )}
        {action !== 'original' && (
          <Field name="memo" label="메모" error={error} wide>
            <textarea
              value={memo}
              className={error?.field === 'memo' ? 'invalid' : ''}
              onChange={(event) => {
                setMemo(event.target.value)
                setError(null)
              }}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
