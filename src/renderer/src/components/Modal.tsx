import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { ApiError } from '@shared/ipc'
import type { LucideIcon } from 'lucide-react'
import { Button, Icon } from './Ui'
import { getReducedMotion } from '../hooks/useReducedMotion'

// 호출부는 닫는 즉시 기능과 상태를 끝낸다. 남기는 복제는 입력·역할 없는 모습뿐이다.
function leaveAppearance(backdrop: HTMLElement): void {
  if (getReducedMotion()) return
  const copy = backdrop.cloneNode(true) as HTMLElement
  const originals = backdrop.querySelectorAll<HTMLElement>('*')
  const copies = copy.querySelectorAll<HTMLElement>('*')
  copies.forEach((element, index) => {
    const original = originals[index]
    element.removeAttribute('id')
    element.removeAttribute('role')
    element.removeAttribute('aria-modal')
    element.removeAttribute('autofocus')
    element.scrollTop = original.scrollTop
    if (element instanceof HTMLInputElement && original instanceof HTMLInputElement) {
      element.value = original.value
      element.checked = original.checked
    } else if (element instanceof HTMLTextAreaElement && original instanceof HTMLTextAreaElement)
      element.value = original.value
  })
  copy.classList.add('modal-leaving')
  copy.setAttribute('aria-hidden', 'true')
  copy.inert = true
  document.body.append(copy)
  window.setTimeout(() => copy.remove(), 200)
}

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
  onSubmit: () => void | Promise<void>
  submitLabel?: string
  error?: ApiError | null
  small?: boolean
}): React.JSX.Element {
  const modal = useRef<HTMLDivElement>(null)
  const active = useRef(true)
  const submitting = useRef(false)
  const close = useCallback((): void => {
    if (!active.current) return
    active.current = false
    modal.current?.removeAttribute('role')
    onClose()
  }, [onClose])
  const submit = useCallback((): void => {
    if (!active.current || submitting.current) return
    submitting.current = true
    void Promise.resolve(onSubmit()).finally(() => {
      submitting.current = false
    })
  }, [onSubmit])
  useLayoutEffect(() => {
    active.current = true
    const backdrop = modal.current?.parentElement
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = modal.current?.querySelector<HTMLElement>(
      'input, textarea, .custom-select-button, button:not(.close-button)'
    )
    first?.focus()
    return () => {
      active.current = false
      if (backdrop) leaveAppearance(backdrop)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  useEffect(() => {
    if (!error?.field) return
    const field = modal.current?.querySelector<HTMLElement>(`[data-field="${error.field}"]`)
    field?.scrollIntoView({ block: 'nearest', behavior: getReducedMotion() ? 'instant' : 'smooth' })
    field?.querySelector<HTMLElement>('input, textarea, button')?.focus()
  }, [error])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (!active.current || dialogs[dialogs.length - 1] !== modal.current || event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
      if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        if (event.target instanceof Element && event.target.closest('[data-enter-inert]')) return
        submit()
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
  }, [close, submit])
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
          <button className="button icon-button close-button" aria-label="닫기" onClick={close}>
            <Icon icon={X} size={16} />
          </button>
        </div>
        <div className="modal-body">
          {children}
          {error && !error.field && <p className="error-banner">{error.message}</p>}
        </div>
        <div className="modal-foot">
          <Button onClick={close}>취소</Button>
          <Button variant="primary" onClick={submit}>
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
  onConfirm: () => void | Promise<void>
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
