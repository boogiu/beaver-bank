import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleAlert, FlaskConical, ShieldAlert } from 'lucide-react'
import type { ChatSnapshot, ChatSource } from '@shared/chat'
import { Icon } from '../Ui'

export function ChatSelect({
  label,
  title,
  value,
  options,
  disabled,
  onChange,
  className = ''
}: {
  label: string
  title?: string
  value: string
  options: { value: string; label: string; description?: string; disabled?: boolean }[]
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  return (
    <div
      className={`chat-select ${className}`}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault()
          setOpen(true)
          const buttons = [
            ...(root.current?.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)') ||
              [])
          ]
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          buttons[
            (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
          ]?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        title={title}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {className.includes('data') && (
          <Icon icon={value === 'demo' ? FlaskConical : ShieldAlert} size={14} />
        )}
        {options.find((option) => option.value === value)?.label.split(' — ')[0]}
        <Icon icon={ChevronDown} size={className.includes('data') ? 14 : 12} />
      </button>
      {open && !disabled && (
        <div className="chat-select-options" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              {option.label}
              {option.description && <small>{option.description}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatConnection({
  chat,
  busy,
  onSource
}: {
  chat: ChatSnapshot
  busy: boolean
  onSource: (source: ChatSource) => void
}): React.JSX.Element {
  const status = chat.status
  const reason = {
    missing: '없음',
    login: '로그인 필요',
    unknown: '확인하지 못함',
    checking: '',
    ready: status.verified ? '' : '검증되지 않은 판'
  }[status.state]
  return (
    <section className="chat-connection">
      <div className="chat-clients" role="radiogroup" aria-label="클라이언트">
        <button
          className="selected"
          role="radio"
          aria-checked="true"
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key.startsWith('Arrow')) event.preventDefault()
          }}
        >
          <span className={`chat-status-dot ${status.state}`} />
          Claude
          {reason && (
            <small className={status.state === 'ready' ? 'chat-warning' : ''}> · {reason}</small>
          )}
        </button>
        <button
          role="radio"
          aria-checked="false"
          aria-disabled="true"
          aria-label="Codex, 준비 중, 사용할 수 없음"
          tabIndex={-1}
          title="Codex 연결은 준비 중입니다."
        >
          Codex <small>· 준비 중</small>
        </button>
      </div>
      <div className="chat-data-row">
        <ChatSelect
          className={`chat-data ${chat.source}`}
          label={`데이터 대상: ${chat.source === 'demo' ? '데모 데이터' : '실제 데이터'}`}
          value={chat.source}
          disabled={busy}
          options={[
            { value: 'demo', label: '데모 데이터 — 가짜 데이터' },
            {
              value: 'real',
              label: '실제 데이터 — 이 앱의 데이터',
              disabled: chat.demo,
              description: chat.demo ? '데모로 실행한 앱에서는 고를 수 없습니다.' : undefined
            }
          ]}
          onChange={(value) => onSource(value as ChatSource)}
        />
      </div>
      {!chat.demo && chat.source === 'demo' && (
        <p className="chat-demo-notice">
          <Icon icon={FlaskConical} size={14} />
          AI는 데모 데이터를 봅니다. 지금 화면의 데이터와 다릅니다.
        </p>
      )}
      {chat.source === 'real' && (
        <p className="chat-warning">
          <Icon icon={ShieldAlert} size={14} />
          실제 데이터가 AI 서비스로 전송됩니다.
        </p>
      )}
      {status.state === 'ready' && !status.verified && (
        <p className="chat-warning">
          <Icon icon={CircleAlert} size={14} />
          검증되지 않은 Claude Code 판({status.version || '알 수 없음'})입니다. 2.1.284 이상에서
          확인했습니다.
        </p>
      )}
    </section>
  )
}
