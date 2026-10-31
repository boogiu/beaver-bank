import { useEffect, useRef, useState } from 'react'
import type { ChatRequest, ChatSetupTask, ChatSnapshot, ChatSource } from '@shared/chat'
import { ChatHeader } from './ChatHeader'
import { ChatConnection } from './ChatConnection'
import { ChatDialog } from './ChatDialogs'
import { ChatTranscript } from './ChatTranscript'
import { ChatComposer } from './ChatComposer'
import { ChatEmpty } from './ChatEmpty'
import { ChatNotices } from './ChatNotices'
import { ChatTools } from './ChatTools'
import { ChatSetupConfirm } from './ChatSetupConfirm'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export function ChatPanel({
  chat,
  request,
  onClose,
  docked
}: {
  chat: ChatSnapshot
  request: (request: ChatRequest) => Promise<ChatSnapshot>
  onClose: () => void
  docked: boolean
}): React.JSX.Element {
  const panel = useRef<HTMLElement>(null)
  const [draft, setDraft] = useState('')
  const [dialog, setDialog] = useState<'new' | 'real' | 'write' | null>(null)
  // AI 도구 팝업. waiting은 팝업이 보낸 확인 요청의 답을 기다리는 동안이다.
  const [tools, setTools] = useState<{ waiting: boolean } | null>(null)
  // 실행 확인 팝업(CS-25). from은 연 곳: 안내 상자, AI 도구 팝업, 연결 영역의 "업데이트"
  const [setup, setSetup] = useState<{
    task: ChatSetupTask
    from: 'notice' | 'tools' | 'link'
  } | null>(null)
  const approvedFocus = useRef(false)
  const [nextSource, setNextSource] = useState<ChatSource | undefined>()
  const sending = useRef(false)
  const wasOpen = useRef(false)
  const reduced = useReducedMotion()
  useEffect(() => {
    // Mode changes keep the same panel and never replay its opening animation.
    const element = panel.current
    if (chat.settings.open && !wasOpen.current && docked && !reduced)
      element?.classList.add('dock-opening')
    wasOpen.current = chat.settings.open
    const timer = window.setTimeout(() => element?.classList.remove('dock-opening'), 150)
    return () => {
      window.clearTimeout(timer)
      element?.classList.remove('dock-opening')
    }
  }, [chat.settings.open, docked, reduced])
  const busy = chat.replies.some((reply) => reply.state === 'running')
  // Claude 작업 창이 열려 있으면 Claude는 "작업 중"이고 보낼 수 없다(CS-49).
  const claudeRunning = chat.setup.running?.client === 'claude' ? chat.setup.running : undefined
  // 포커스는 사용자 조작으로만 옮긴다(CH-151 패널 열기). 상태 확인이 끝난 것만으로는 옮기지 않는다.
  // 이어지는 두 경우만 그 조작의 끝으로 본다: 패널을 열 때 확인 중이라 미룬 이동(그사이 포커스가 그대로일 때),
  // 패널 안에서 누른 요소가 막히거나 사라져 포커스가 빠진 경우(예: [다시 확인] 뒤 입력창이 열림).
  // 빠진 때를 lost에 남겨, 갈 곳이 나중에 생겨도(다시 풀린 [다시 확인]) 포커스가 그대로 빠져 있으면 돌려놓는다.
  const focusedOpen = useRef(false)
  const openFocus = useRef<Element | null>(null)
  const lastInside = useRef<Element | null>(null)
  const lost = useRef(false)
  useEffect(() => {
    const outside = (event: Event): void => {
      // 사용자가 포커스를 어디로든 옮기거나 눌렀으면 빠진 포커스를 되찾지 않는다.
      lost.current = false
      const target = event.target instanceof Element ? event.target : null
      if (!panel.current?.contains(target) && !target?.closest('[role="dialog"]'))
        lastInside.current = null
    }
    document.addEventListener('focusin', outside)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('focusin', outside)
      document.removeEventListener('pointerdown', outside)
    }
  }, [])
  useEffect(() => {
    const opened = chat.settings.open && !focusedOpen.current
    focusedOpen.current = chat.settings.open
    if (!chat.settings.open || document.querySelector('[role="dialog"]')) {
      openFocus.current = null
      lost.current = false
      return
    }
    const target = panel.current?.querySelector<HTMLElement>(
      'textarea:not(:disabled), .chat-recheck:not(:disabled)'
    )
    const active = document.activeElement
    const last = lastInside.current
    // 막힌 요소(단추·입력창)는 이 효과가 돈 뒤에야 포커스를 잃기도 하므로, 아직 그 요소에 있어도 빠진 것으로 본다.
    const gone = !!last && (!last.isConnected || last.matches(':disabled'))
    const adrift = !active || active === document.body || (active === last && gone)
    lost.current = adrift && (lost.current || gone)
    if (target && (opened || active === openFocus.current || lost.current)) {
      target.focus()
      lost.current = false
    }
    openFocus.current = target ? null : opened ? active : openFocus.current
  }, [chat.settings.open, chat.status.state])
  // AI 도구 팝업을 열 때와 그 [다시 확인]에서 두 클라이언트를 확인한다(CS-15, CS-16).
  // 답을 받기 전에는 팝업이 두 행을 "확인 중"으로 그린다(확인한 적 없는 Codex가 다른 상태로 먼저 보이지 않게).
  const checkTools = (): void => {
    setTools({ waiting: true })
    void request({ kind: 'tools-check' }).finally(() =>
      setTools((current) => current && { waiting: false })
    )
  }
  // 작업 단추 → 실행 확인 팝업. main이 판정을 다시 하고 창 명령 줄을 준비해 snapshot에 싣는다(프로세스 없음).
  const openConfirm = (task: ChatSetupTask, from: 'notice' | 'tools' | 'link'): void => {
    if (from === 'tools') setTools(null)
    setSetup({ task, from })
    void request({ kind: 'setup-prepare', task })
  }
  const cancelConfirm = (): void => {
    void request({ kind: 'setup-cancel' })
    // AI 도구 팝업에서 열었으면 그 팝업으로 돌아간다. 새로 확인하지 않고 마지막 상태로 그린다.
    if (setup?.from === 'tools') setTools({ waiting: false })
    setSetup(null)
  }
  const approveConfirm = (token: string): void => {
    if (!setup) return
    void request({ kind: 'setup-start', task: setup.task, token })
    approvedFocus.current = true
    setSetup(null)
  }
  // 승인 뒤 포커스: 안내 상자의 [다시 확인], 없으면 "AI 도구"(CS-25). 팝업이 처음 기억한 단추로 돌아가지 않게 닫힌 뒤 옮긴다.
  useEffect(() => {
    if (setup || !approvedFocus.current) return
    approvedFocus.current = false
    const target =
      panel.current?.querySelector<HTMLElement>('.chat-notice .chat-recheck:not(:disabled)') ??
      panel.current?.querySelector<HTMLElement>('.chat-tools-button')
    target?.focus()
  }, [setup])
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
    if (sending.current || busy || claudeRunning || chat.status.state !== 'ready' || !draft.trim())
      return
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
      className={`chat-panel ${chat.settings.open ? 'is-open' : ''} ${docked ? 'is-docked' : ''} ${chat.source}`}
      aria-label="AI 대화"
      aria-hidden={!chat.settings.open}
      inert={!chat.settings.open}
      onFocus={(event) => {
        lastInside.current = event.target
      }}
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
        working={!!chat.setup.running}
        onModel={(model) => {
          void request({ kind: 'settings', model })
        }}
        onTools={checkTools}
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
        onTools={checkTools}
        onUpdate={() => openConfirm('claude-update', 'link')}
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
            action={chat.setup.claude}
            running={claudeRunning}
            result={chat.setup.results?.claude}
            onTask={(task) => openConfirm(task, 'notice')}
            sequence={chat.setup.copy?.sequence ?? 0}
            request={request}
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
            action={chat.setup.claude}
            running={claudeRunning}
            result={chat.setup.results?.claude}
            onTask={(task) => openConfirm(task, 'notice')}
            sequence={chat.setup.copy?.sequence ?? 0}
            request={request}
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
        disabled={chat.status.state !== 'ready' || !!claudeRunning}
        onSend={send}
        onStop={() => {
          void request({ kind: 'stop' })
        }}
      />
      {tools && (
        <ChatTools
          chat={chat}
          waiting={tools.waiting}
          onCheck={checkTools}
          request={request}
          onClose={() => setTools(null)}
          onTask={(task) => openConfirm(task, 'tools')}
        />
      )}
      {setup && (
        <ChatSetupConfirm
          key={setup.task}
          task={setup.task}
          action={chat.setup[setup.task.startsWith('claude') ? 'claude' : 'codex']}
          pending={chat.setup.pending}
          version={chat.status.version}
          onCancel={cancelConfirm}
          onApprove={approveConfirm}
        />
      )}
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
