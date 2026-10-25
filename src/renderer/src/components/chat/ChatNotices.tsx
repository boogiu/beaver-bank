import { RotateCcw } from 'lucide-react'
import type { ChatRequest, ChatSetupAction, ChatSnapshot, ChatStatus } from '@shared/chat'
import { Icon } from '../Ui'
import { useChatCopy } from '../../hooks/useChatCopy'
import { ChatCommandBox, ChatCopyButton, ChatCopyFailed } from './ChatCommandBox'

export function ChatNotices({
  status,
  action,
  sequence,
  request,
  onCheck
}: {
  status: ChatStatus
  action?: ChatSetupAction
  sequence: number
  request: (request: ChatRequest) => Promise<ChatSnapshot>
  onCheck: () => void
}): React.JSX.Element | null {
  const { result, copy } = useChatCopy(request, sequence)
  if (status.state === 'ready') return null
  const title = {
    missing: 'Claude Code를 찾지 못했습니다.',
    login: 'Claude Code에 로그인되어 있지 않습니다.',
    unknown: 'Claude Code의 상태를 확인하지 못했습니다.',
    checking: 'Claude Code의 상태를 확인하는 중입니다.'
  }[status.state]
  // 작업 창을 열 수 없으면 설명 대신 명령 복사(CS-81). 막히면 설명 끝에 CS-39 이유를 붙인다.
  const copyAction = action?.mode === 'copy' ? action : undefined
  const reason = action && !copyAction ? action.reason : undefined
  const recheck = (
    <button className="chat-recheck" disabled={status.state === 'checking'} onClick={onCheck}>
      <Icon icon={RotateCcw} size={14} />
      다시 확인
    </button>
  )
  return (
    <div className="chat-notice">
      <strong aria-live="polite">{title}</strong>
      {copyAction ? (
        <>
          <ChatCommandBox action={copyAction} />
          <div className="chat-notice-actions">
            <ChatCopyButton
              action={copyAction}
              copied={result?.task === copyAction.task && result.ok}
              onCopy={() => {
                void copy(copyAction.task)
              }}
            />
            {recheck}
          </div>
          {result?.task === copyAction.task && !result.ok && <ChatCopyFailed />}
        </>
      ) : (
        <>
          <p>
            {status.state === 'missing' ? (
              <>
                Claude Code를 설치하고 터미널에서 <code>claude</code>를 한 번 실행해 로그인한 뒤
                [다시 확인]을 눌러 주세요.
              </>
            ) : status.state === 'login' ? (
              <>
                터미널에서 <code>claude</code>를 실행해 로그인한 뒤 [다시 확인]을 눌러 주세요.
              </>
            ) : status.state === 'unknown' ? (
              '잠시 뒤 [다시 확인]을 눌러 주세요.'
            ) : (
              '잠시 기다려 주세요.'
            )}
            {reason && ` ${reason}`}
          </p>
          {recheck}
        </>
      )}
    </div>
  )
}
