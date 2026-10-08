import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { ApiError } from '@shared/ipc'
import type { LucideIcon } from 'lucide-react'
import { Button, Icon } from './Ui'

export function Modal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = '저장',
  error,
  small = false
}: {
  title: string
  children: ReactNode
  onClose: () => void
  onSubmit: () => void
  submitLabel?: string
  error?: ApiError | null
  small?: boolean
}): React.JSX.Element {
  const modal = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = modal.current?.querySelector<HTMLElement>(
      'input, textarea, .custom-select-button, button:not(.close-button)'
    )
    first?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  useEffect(() => {
    if (!error?.field) return
    const field = modal.current?.querySelector<HTMLElement>(`[data-field="${error.field}"]`)
    field?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    field?.querySelector<HTMLElement>('input, textarea, button')?.focus()
  }, [error])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== modal.current || event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        if (event.target instanceof Element && event.target.closest('[data-enter-inert]')) return
        onSubmit()
      }
      if (event.key === 'Tab') {
        const focusable = [
          ...(modal.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'
          ) ?? [])
        ]
        if (!focusable.length) return
        const first = focusable[0],
          last = focusable[focusable.length - 1]
        const outside = !modal.current?.contains(document.activeElement)
        if (event.shiftKey && (outside || document.activeElement === first)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (outside || document.activeElement === last)) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, onSubmit])
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.stopPropagation()}>
      <div
        ref={modal}
        className={`modal ${small ? 'small' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="button icon-button close-button" aria-label="닫기" onClick={onClose}>
            <Icon icon={X} size={16} />
          </button>
        </div>
        <div className="modal-body">
          {children}
          {error && !error.field && <p className="error-banner">{error.message}</p>}
        </div>
        <div className="modal-foot">
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onSubmit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmModal({
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = '확인'
}: {
  title: string
  message: ReactNode
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
}): React.JSX.Element {
  return (
    <Modal title={title} onClose={onClose} onSubmit={onConfirm} submitLabel={confirmLabel} small>
      <div className="form-note">{message}</div>
    </Modal>
  )
}

export function Field({
  name,
  label,
  error,
  wide = false,
  children
}: {
  name: string
  label: string
  error?: ApiError | null
  wide?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className={`field ${wide ? 'wide' : ''}`} data-field={name}>
      <span>{label}</span>
      {children}
      {error?.field === name && <span className="field-error">{error.message}</span>}
    </label>
  )
}

export interface SelectOption {
  value: string
  label: string
  color?: string
  icon?: LucideIcon
}
export function Select({
  value,
  options,
  onChange,
  invalid = false
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  invalid?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const current = options.find((option) => option.value === value)
  return (
    <div className="custom-select" ref={root}>
      <button
        type="button"
        className={`custom-select-button ${invalid ? 'invalid' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="select-label">
          {current?.color && (
            <span className="color-dot" style={{ backgroundColor: current.color }} />
          )}
          {current?.icon && <Icon icon={current.icon} size={18} />}
          {current?.label ?? '선택'}
        </span>
        <Icon icon={ChevronDown} size={16} />
      </button>
      {open && (
        <div
          className="custom-select-options"
          role="listbox"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="custom-select-option"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.color && (
                <span className="color-dot" style={{ backgroundColor: option.color }} />
              )}
              {option.icon && <Icon icon={option.icon} size={18} />}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
