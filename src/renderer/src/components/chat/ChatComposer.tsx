import { useLayoutEffect, useRef } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Icon } from '../Ui'

export function ChatComposer({
  draft,
  onDraft,
  busy,
  disabled,
  onSend,
  onStop
}: {
  draft: string
  onDraft: (value: string) => void
  busy: boolean
  disabled: boolean
  onSend: () => void
  onStop: () => void
}): React.JSX.Element {
  const input = useRef<HTMLTextAreaElement>(null)
  const composing = useRef(false)
  const compositionEnded = useRef(0)
  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    const panel = element.closest<HTMLElement>('.chat-panel')
    const composer = element.closest<HTMLElement>('.chat-composer')
    const header = panel?.querySelector<HTMLElement>('.chat-header')
    const connection = panel?.querySelector<HTMLElement>('.chat-connection')
    const hint = composer?.querySelector<HTMLElement>('.chat-input-hint')
    const resize = (): void => {
      // 안내가 여러 줄이어도 목록 160px과 고정 입력 영역을 먼저 확보한다.
      // 입력은 최대 여섯 줄이며 작은 창의 남는 높이를 넘으면 안에서 스크롤한다.
      const available =
        panel && composer && header && connection
          ? panel.clientHeight -
            header.offsetHeight -
            connection.offsetHeight -
            160 -
            (composer.offsetHeight - element.offsetHeight)
          : 148
      element.style.height = '44px'
      element.style.height = `${Math.max(44, Math.min(148, Math.floor(available), element.scrollHeight + 2))}px`
    }
    resize()
    const observer = new ResizeObserver(resize)
    for (const target of [panel, header, connection, hint]) if (target) observer.observe(target)
    return () => observer.disconnect()
  }, [draft])
  return (
    <div className="chat-composer">
      <div className="chat-input-wrap">
        <textarea
          ref={input}
          aria-label="메시지"
          placeholder="BeaverBank에 대해 물어보세요"
          disabled={disabled}
          maxLength={4000}
          value={draft}
          onChange={(event) => onDraft(event.target.value.slice(0, 4000))}
          onPaste={(event) => {
            event.preventDefault()
            const element = event.currentTarget
            const prefix = draft.slice(0, element.selectionStart)
            const suffix = draft.slice(element.selectionEnd)
            onDraft((prefix + event.clipboardData.getData('text') + suffix).slice(0, 4000))
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
            compositionEnded.current = performance.now()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && composing.current) event.stopPropagation()
            if (event.key === 'Enter' && !event.shiftKey) {
              if (
                composing.current ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229 ||
                performance.now() - compositionEnded.current < 30
              )
                return
              event.preventDefault()
              if (!busy && !disabled && draft.trim()) onSend()
            }
          }}
        />
        {busy ? (
          <button aria-label="멈추기" className="chat-stop" onClick={onStop}>
            <Icon icon={Square} size={12} />
          </button>
        ) : (
          <button
            aria-label="보내기"
            className="chat-send"
            disabled={disabled || !draft.trim()}
            onClick={onSend}
          >
            <Icon icon={ArrowUp} size={16} />
          </button>
        )}
      </div>
      <div className="chat-input-hint">
        <span>Enter 보내기 · Shift+Enter 줄바꿈</span>
        <span>
          {draft.length > 3600
            ? `${draft.length.toLocaleString('ko-KR')} / 4,000`
            : 'Claude 계정 사용량을 씁니다'}
        </span>
      </div>
    </div>
  )
}
