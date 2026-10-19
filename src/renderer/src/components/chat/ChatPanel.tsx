import { useEffect, useRef, useState } from 'react'
import type { ChatRequest, ChatSnapshot, ChatSource } from '@shared/chat'
import { ChatHeader } from './ChatHeader'
import { ChatConnection } from './ChatConnection'
import { ChatDialog } from './ChatDialogs'
import { ChatTranscript } from './ChatTranscript'
import { ChatComposer } from './ChatComposer'
import { ChatEmpty } from './ChatEmpty'
import { ChatNotices } from './ChatNotices'

export function ChatPanel({
  chat,
  request,
  onClose
}: {
  chat: ChatSnapshot
  request: (request: ChatRequest) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const panel = useRef<HTMLElement>(null)
  const [draft, setDraft] = useState('')
  const [dialog, setDialog] = useState<'new' | 'real' | 'write' | null>(null)
  const [nextSource, setNextSource] = useState<ChatSource | undefined>()
  const sending = useRef(false)
  const busy = chat.replies.some((reply) => reply.state === 'running')
  useEffect(() => {
    if (chat.settings.open)
      panel.current?.querySelector<HTMLElement>('textarea:not(:disabled), .chat-recheck')?.focus()
  }, [chat.settings.open, chat.status.state])
  const reset = (value?: ChatSource): void => {
    if (value === chat.source) return
    if (!value && chat.replies.length === 0) return
    setNextSource(value)
    if (chat.replies.length) setDialog('new')
    else if (value === 'real') setDialog('real')
    else void request({ kind: 'reset', source: value }).then(() => setDraft(''))
  }
  const confirm = async (): Promise<void> => {
    if (dialog === 'write') {
      await request({ kind: 'write-enabled', enabled: true, epoch: chat.epoch })
      setDialog(null)
      return
    }
    if (dialog === 'new' && nextSource === 'real') {
      setDialog('real')
      return
    }
    await request({ kind: 'reset', source: nextSource })
    setDraft('')
    setDialog(null)
  }
  const send = (): void => {
    if (sending.current || busy || chat.status.state !== 'ready' || !draft.trim()) return
    sending.current = true
    const text = draft
    setDraft('')
    void request({ kind: 'send', text, epoch: chat.epoch }).finally(() => {
      sending.current = false
    })
  }
  return (
    <aside
      ref={panel}
      id="chat-panel"
      className={`chat-panel ${chat.settings.open ? 'is-open' : ''} ${chat.source}`}
      aria-label="AI 대화"
      aria-hidden={!chat.settings.open}
      inert={!chat.settings.open}
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !event.nativeEvent.isComposing &&
          !document.querySelector('[role="dialog"]')
        ) {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <ChatHeader
        model={chat.settings.model}
        busy={busy}
        onModel={(model) => {
          void request({ kind: 'settings', model })
        }}
        onNew={() => reset()}
        onClose={onClose}
      />
      <ChatConnection
        chat={chat}
        busy={busy}
        onSource={reset}
        onWrite={() => {
          if (busy) return
          if (!chat.writeEnabled && chat.source === 'real') setDialog('write')
          else
            void request({ kind: 'write-enabled', enabled: !chat.writeEnabled, epoch: chat.epoch })
        }}
      />
      <ChatTranscript
        replies={chat.replies}
        open={chat.settings.open}
        onReceived={(card) => {
          void request({
            kind: 'card-received',
            epoch: card.epoch,
            runId: card.runId,
            cardId: card.cardId
          })
        }}
        onDecision={(card, decision) => {
          void request({
            kind: 'card-decision',
            epoch: card.epoch,
            runId: card.runId,
            cardId: card.cardId,
            decision
          })
        }}
        onRetry={(id) => {
          void request({ kind: 'retry', id, epoch: chat.epoch })
        }}
      >
        {chat.replies.length === 0 ? (
          <ChatEmpty
            status={chat.status}
            source={chat.source}
            onCheck={() => {
              void request({ kind: 'check' })
            }}
            onSuggestion={(text) => {
              setDraft(text)
              panel.current?.querySelector('textarea')?.focus()
            }}
          />
        ) : (
          <ChatNotices
            status={chat.status}
            onCheck={() => {
              void request({ kind: 'check' })
            }}
          />
        )}
      </ChatTranscript>
      <ChatComposer
        draft={draft}
        onDraft={setDraft}
        busy={busy}
        disabled={chat.status.state !== 'ready'}
        onSend={send}
        onStop={() => {
          void request({ kind: 'stop' })
        }}
      />
      {dialog && (
        <ChatDialog
          key={dialog}
          kind={dialog}
          onClose={() => setDialog(null)}
          onConfirm={confirm}
        />
      )}
    </aside>
  )
}
