import { useEffect, useRef, useState } from 'react'
import { PencilLine, Check, CircleAlert, X } from 'lucide-react'
import type { ChatWriteCard as WriteCard } from '@shared/chat'
import { writeToolTitles, writeGroup } from '@shared/chat-gate'
import { Icon } from '../Ui'
import { ChatWriteFields } from './ChatWriteFields'

export function ChatWriteCard({
  card,
  onReceived,
  onDecision
}: {
  card: WriteCard
  onReceived: (card: WriteCard) => void
  onDecision: (card: WriteCard, decision: 'approve' | 'reject') => void
}): React.JSX.Element {
  const received = useRef(false)
  const locked = useRef(false)
  const [locking, setLocking] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [expiring, setExpiring] = useState(false)
  const title = writeToolTitles[card.name]
  const pending = card.state === 'pending' || card.state === 'deciding'
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => setExpiring(true), Math.max(0, card.createdAt + 240000 - Date.now()))
    return () => clearTimeout(timer)
  }, [card.createdAt, pending])
  useEffect(() => {
    if (card.state === 'pending' && !received.current) {
      received.current = true
      onReceived(card)
    }
  }, [card, onReceived])
  const decide = (decision: 'approve' | 'reject'): void => {
    if (locked.current || card.state !== 'pending') return
    locked.current = true
    setLocking(true)
    onDecision(card, decision)
  }
  const result =
    card.state === 'success'
      ? `넣었습니다 · ${title}${card.backup ? ` · 백업 ${card.backup}` : ''}`
      : card.state === 'error'
        ? `넣지 못했습니다: ${card.error}`
        : card.state === 'timeout'
          ? '답이 없어 넣지 않았습니다'
          : card.state === 'rejected'
            ? '거절함'
            : '취소됨'
  return (
    <div
      className={`chat-write ${pending ? 'chat-write-pending' : 'chat-tool'}`}
      data-card-id={card.cardId}
      data-state={card.state}
    >
      {pending ? (
        <section className="chat-write-card" role="group" aria-label={`기입 확인: ${title}`}>
          <div className="chat-write-heading">
            <Icon icon={PencilLine} size={16} />
            이대로 넣을까요?
          </div>
          <div className="chat-write-subtitle">
            {title} · {writeGroup(card.name)} ·{' '}
            {card.source === 'demo' ? '데모 데이터' : '실제 데이터'}에 기입
          </div>
          {expiring && (
            <p className="chat-write-warning">1분 안에 답하지 않으면 넣지 않습니다.</p>
          )}
          <ChatWriteFields card={card} />
          {card.name.startsWith('update_') && (
            <p className="chat-write-update">적지 않은 항목은 그대로 둡니다.</p>
          )}
          <div className="chat-write-actions">
            <button
              type="button"
              disabled={locking || card.state !== 'pending'}
              onClick={() => decide('reject')}
            >
              거절
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={locking || card.state !== 'pending'}
              onClick={() => decide('approve')}
            >
              넣기
            </button>
          </div>
        </section>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={expanded}
            title={result}
            onClick={() => setExpanded(!expanded)}
          >
            <span
              className={`chat-tool-${card.state === 'success' ? 'done' : card.state === 'error' ? 'error' : 'cancelled'}`}
            >
              <Icon
                icon={card.state === 'success' ? Check : card.state === 'error' ? CircleAlert : X}
                size={14}
              />
            </span>
            <span className="chat-write-result-text">{result}</span>
          </button>
          {card.warning && <p className="chat-write-warning">{card.warning}</p>}
          {expanded && <ChatWriteFields card={card} />}
        </>
      )}
    </div>
  )
}
