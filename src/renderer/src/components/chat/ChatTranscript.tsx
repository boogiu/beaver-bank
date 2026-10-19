import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, CircleAlert, RotateCcw } from 'lucide-react'
import type { ChatReply, ChatWriteCard as WriteCard } from '@shared/chat'
import { Icon } from '../Ui'
import { useReducedMotion, getReducedMotion } from '../../hooks/useReducedMotion'
import { ChatRichText } from './ChatRichText'
import { ChatToolRow } from './ChatToolRow'
import { ChatWriteCard } from './ChatWriteCard'

export function ChatTranscript({
  replies,
  onRetry,
  onReceived,
  onDecision,
  open,
  children
}: {
  replies: ChatReply[]
  onRetry: (id: string) => void
  onReceived: (card: WriteCard) => void
  onDecision: (card: WriteCard, decision: 'approve' | 'reject') => void
  open: boolean
  children?: React.ReactNode
}): React.JSX.Element {
  const viewport = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [above, setAbove] = useState(false)
  const reduced = useReducedMotion()
  const previousCount = useRef(0)
  useLayoutEffect(() => {
    if (previousCount.current !== replies.length) following.current = true
    previousCount.current = replies.length
    if (following.current && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight
  }, [replies])
  useLayoutEffect(() => {
    if (!open || !viewport.current) return
    const first = viewport.current.querySelector<HTMLElement>('[data-state="pending"]')
    if (first) {
      viewport.current.scrollTop +=
        first.getBoundingClientRect().top - viewport.current.getBoundingClientRect().top
      following.current = false
    }
  }, [open])
  const lastDone = [...replies].reverse().find((reply) => reply.state !== 'running')
  return (
    <div className="chat-transcript-shell">
      <div
        ref={viewport}
        className="chat-transcript"
        role="log"
        aria-live="off"
        onScroll={() => {
          const element = viewport.current!
          following.current = element.scrollHeight - element.clientHeight - element.scrollTop < 24
          setAbove(!following.current)
        }}
      >
        {replies.map((reply) => (
          <div className="chat-exchange" key={reply.id}>
            <div className="chat-user">{reply.prompt}</div>
            <article className="chat-answer">
              <div className="chat-answer-name">
                <span />
                Claude
                {reply.model !== 'default' &&
                  ` · ${reply.model[0].toUpperCase() + reply.model.slice(1)}`}
              </div>
              {reply.blocks.map((block, index) =>
                block.kind === 'text' ? (
                  <ChatRichText key={index} text={block.text} />
                ) : block.kind === 'write' ? (
                  <ChatWriteCard
                    key={block.cardId}
                    card={block}
                    onReceived={onReceived}
                    onDecision={onDecision}
                  />
                ) : (
                  <ChatToolRow key={block.id} tool={block} />
                )
              )}
              {reply.state === 'running' && reply.blocks.some((block) => block.kind === 'text') && (
                <span className="chat-cursor" />
              )}
              {reply.state === 'running' && reply.waiting && (
                <div className="chat-thinking">
                  <span />
                  <span />
                  <span />
                  {reduced && '응답을 기다리는 중'}
                  {reply.elapsed >= 10 && ` ${reply.elapsed}초`}
                  {reply.retry && ` ${reply.retry}`}
                </div>
              )}
              {reply.state === 'stopped' && <small className="chat-stopped">멈춤</small>}
              {reply.state === 'error' && (
                <div className="chat-error">
                  <div>
                    <Icon icon={CircleAlert} size={16} />
                    <span>{reply.error}</span>
                  </div>
                  <button onClick={() => onRetry(reply.id)}>
                    <Icon icon={RotateCcw} size={14} />
                    다시 시도
                  </button>
                  {reply.detail && (
                    <details>
                      <summary>자세히</summary>
                      <pre>{reply.detail}</pre>
                    </details>
                  )}
                </div>
              )}
            </article>
          </div>
        ))}
        {children}
      </div>
      {above && (
        <button
          className="chat-bottom"
          aria-label="맨 아래로"
          onClick={() => {
            following.current = true
            viewport.current?.scrollTo({
              top: viewport.current.scrollHeight,
              behavior: getReducedMotion() ? 'instant' : 'smooth'
            })
            setAbove(false)
          }}
        >
          <Icon icon={ArrowDown} size={16} />
        </button>
      )}
      <div className="chat-announcement" role="status" aria-live="polite" aria-atomic="true">
        {lastDone
          ? `Claude: ${lastDone.blocks
              .filter((block) => block.kind === 'text')
              .map((block) => block.text)
              .join('\n')}${lastDone.error || ''}${lastDone.state === 'stopped' ? ' 멈춤' : ''}`
          : ''}
      </div>
    </div>
  )
}
