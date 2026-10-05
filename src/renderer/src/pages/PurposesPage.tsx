import { useEffect, useRef, useState } from 'react'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import type { ApiError, Purpose } from '@shared/ipc'
import type { PageProps } from '../App'
import { AddButton, Button, EmptyState, Icon } from '../components/Ui'
import { ConfirmModal, Field, Modal } from '../components/Modal'

const PALETTE = [
  '#397768',
  '#346D82',
  '#84723E',
  '#4C7865',
  '#566D7B',
  '#8B6256',
  '#9A684B',
  '#4F6F97',
  '#8E5868',
  '#6F7B45',
  '#4A7A83',
  '#9A7244'
]

function PurposeForm({
  value,
  onClose,
  onSaved
}: {
  value: Purpose | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [name, setName] = useState(value?.name ?? '')
  const [color, setColor] = useState(value?.color ?? PALETTE[0])
  const [error, setError] = useState<ApiError | null>(null)
  const save = async (): Promise<void> => {
    const result = value
      ? await window.api.updatePurpose(value.id, { name, color })
      : await window.api.addPurpose({ name, color })
    if (result.ok) onSaved()
    else setError(result.error)
  }
  return (
    <Modal
      title={value ? '용도 수정' : '용도 추가'}
      onClose={onClose}
      onSubmit={save}
      error={error}
      small
    >
      <div className="form-grid">
        <Field name="name" label="이름" error={error} wide>
          <input
            value={name}
            className={error?.field === 'name' ? 'invalid' : ''}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
          />
        </Field>
        <Field name="color" label="색상" error={error} wide>
          <div className="palette">
            {PALETTE.map((item) => (
              <button
                type="button"
                key={item}
                className={color === item ? 'selected' : ''}
                style={{ backgroundColor: item }}
                aria-label={`색상 ${item}`}
                aria-pressed={color === item}
                onClick={() => {
                  setColor(item)
                  setError(null)
                }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}

export default function PurposesPage({ target }: PageProps): React.JSX.Element {
  const [items, setItems] = useState<Purpose[]>([])
  const [editing, setEditing] = useState<Purpose | null | 'add'>(null)
  const [removing, setRemoving] = useState<Purpose | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dragged = useRef<number | null>(null)
  const refresh = async (): Promise<void> => {
    const result = await window.api.listPurposes()
    if (result.ok) setItems(result.data)
    else setError(result.error.message)
  }
  useEffect(() => {
    void window.api.listPurposes().then((result) => {
      if (result.ok) setItems(result.data)
      else setError(result.error.message)
    })
  }, [])
  useEffect(() => {
    if (target?.kind !== 'purpose') return
    document.getElementById(`purpose-${target.id}`)?.scrollIntoView({ block: 'center' })
  }, [target, items])
  const remove = async (): Promise<void> => {
    if (!removing) return
    const result = await window.api.deletePurpose(removing.id)
    if (result.ok) {
      setRemoving(null)
      void refresh()
    } else setError(result.error.message)
  }
  const drop = async (id: number): Promise<void> => {
    if (dragged.current === null || dragged.current === id) return
    const next = [...items]
    const from = next.findIndex((item) => item.id === dragged.current)
    const to = next.findIndex((item) => item.id === id)
    if (from < 0 || to < 0) return
    next.splice(to, 0, next.splice(from, 1)[0])
    setItems(next)
    const result = await window.api.reorderPurposes(next.map((item) => item.id))
    if (!result.ok) {
      setError(result.error.message)
      void refresh()
    }
  }
  return (
    <>
      <header className="page-head">
        <div>
          <h1>용도</h1>
          <p>돈의 쓰임새를 나눕니다.</p>
        </div>
        <AddButton onClick={() => setEditing('add')}>용도 추가</AddButton>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {items.length === 0 ? (
        <EmptyState
          kind="purposes"
          title="등록된 용도가 없습니다"
          description="첫 용도를 추가해 보세요."
          action={<AddButton onClick={() => setEditing('add')}>용도 추가</AddButton>}
        />
      ) : (
        <div className="purpose-list">
          {items.map((item) => (
            <div
              id={`purpose-${item.id}`}
              key={item.id}
              className={`purpose-row ${target?.kind === 'purpose' && target.id === item.id ? 'highlighted' : ''}`}
              draggable
              onDragStart={(event) => {
                dragged.current = item.id
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void drop(item.id)
              }}
              onDragEnd={() => {
                dragged.current = null
              }}
            >
              <Icon icon={GripVertical} size={16} />
              <span className="color-dot" style={{ backgroundColor: item.color }} />
              <span className="purpose-name">{item.name}</span>
              <Button
                icon={Pencil}
                aria-label={`${item.name} 수정`}
                onClick={() => setEditing(item)}
              >
                수정
              </Button>
              <Button
                icon={Trash2}
                variant="danger"
                aria-label={`${item.name} 삭제`}
                onClick={() => setRemoving(item)}
              >
                삭제
              </Button>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <PurposeForm
          value={editing === 'add' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          title="용도 삭제"
          message={
            <>
              {removing.name}을(를) 사용하는 계좌 {removing.accountCount}개(해지 포함)가 용도
              없음으로 바뀝니다. 계좌는 그대로 남습니다.
            </>
          }
          confirmLabel="삭제"
          onClose={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </>
  )
}
