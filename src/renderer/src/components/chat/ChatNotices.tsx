import { LoaderCircle, RotateCcw } from 'lucide-react'
import { chatWatchNotice, chatWatchRecovery } from '@shared/chat'
import type {
  ChatRequest,
  ChatSetupAction,
  ChatSetupResult,
  ChatSetupRunning,
  ChatSetupTask,
  ChatSnapshot,
  ChatStatus
} from '@shared/chat'
import { Icon } from '../Ui'
import { useChatCopy } from '../../hooks/useChatCopy'
import {
  ChatCommandBox,
  ChatCopyButton,
  ChatCopyFailed,
  ChatResultLine,
  ChatTaskButton
} from './ChatCommandBox'

const working: Record<ChatSetupTask, string> = {
  'claude-install': '터미널 창에서 Claude Code를 설치하는 중입니다.',
  'claude-login': '터미널 창에서 Claude Code를 로그인하는 중입니다.',
  'claude-update': '터미널 창에서 Claude Code를 업데이트하는 중입니다.',
  'codex-install': '터미널 창에서 Codex를 설치하는 중입니다.',
  'codex-login': '터미널 창에서 Codex를 로그인하는 중입니다.'
}

// 채팅창 안내 상자(CS-23). running은 Claude 작업 창이 열려 있을 때만 받는다.
export function ChatNotices({
  status,
  action,
  running,
  result,
  sequence,
  request,
  onCheck,
  onTask
}: {
  status: ChatStatus
  action?: ChatSetupAction
  running?: ChatSetupRunning
  result?: ChatSetupResult
  sequence: number
  request: (request: ChatRequest) => Promise<ChatSnapshot>
  onCheck: () => void
  onTask: (task: ChatSetupTask) => void
}): React.JSX.Element | null {
  const { result: copied, copy } = useChatCopy(request, sequence)
  if (status.state === 'ready' && !running) return null
  const title = running
    ? running.watchFailure
      ? chatWatchNotice
      : working[running.task]
    : {
        missing: 'Claude Code를 찾지 못했습니다.',
        login: 'Claude Code에 로그인되어 있지 않습니다.',
        unknown: 'Claude Code의 상태를 확인하지 못했습니다.',
        checking: 'Claude Code의 상태를 확인하는 중입니다.',
        ready: ''
      }[status.state]
  // 작업 창을 열 수 없으면 설명 대신 명령 복사(CS-81). 선행 조건으로 막으면 단추 없이 설명 끝에 이유(CS-23, CS-39).
  const copyAction = !running && action?.mode === 'copy' ? action : undefined
  const windowAction =
    !running && action?.mode === 'window' && !(action.reason && action.disabled === action.reason)
      ? action
      : undefined
  const reason = action && !copyAction && !running ? action.reason : undefined
  // [다시 확인]은 단추 줄의 마지막 같은 자리에 두어 "작업 중"에서 결과로 바뀌어도 같은 요소로 남게 한다(CS-64).
  const recheck = (
    <button
      key="recheck"
      className="chat-recheck"
      disabled={status.state === 'checking'}
      onClick={onCheck}
    >
      <Icon icon={RotateCcw} size={14} />
      다시 확인
    </button>
  )
  return (
    <div className="chat-notice">
      <div aria-live="polite">
        {result && !running && <ChatResultLine result={result} />}
        <strong
          className={
            running?.watchFailure ? 'chat-warning' : running ? 'chat-working-title' : undefined
          }
        >
          {running && (
            <span className="chat-spinner" aria-hidden="true">
              <Icon icon={LoaderCircle} size={14} />
            </span>
          )}
          {title}
        </strong>
      </div>
      {copyAction ? (
        <ChatCommandBox action={copyAction} />
      ) : (
        <p>
          {running?.watchFailure ? (
            running.watchFailure.elapsedMs >= 10000 ? (
              chatWatchRecovery
            ) : (
              '창 종료를 확인할 때까지 작업을 잠가 둡니다.'
            )
          ) : running ? (
            `창의 안내를 따라 주세요. 창을 닫으면 상태를 다시 확인합니다. 창이 보이지 않으면 작업 표시줄에서 '${running.title}'을 찾아 주세요.`
          ) : status.state === 'missing' ? (
            '[설치]를 누르면 Anthropic의 공식 설치 명령을 Windows Terminal 창에서 실행합니다. 이미 설치했다면 [다시 확인]을 눌러 주세요.'
          ) : status.state === 'login' ? (
            <>
              [로그인]을 누르면 Windows Terminal 창에서 <code>claude auth login</code>을 실행합니다.
              브라우저에서 로그인을 마친 뒤 창을 닫아 주세요.
            </>
          ) : status.state === 'unknown' ? (
            '잠시 뒤 [다시 확인]을 눌러 주세요.'
          ) : (
            '잠시 기다려 주세요.'
          )}
          {reason && ` ${reason}`}
        </p>
      )}
      <div className="chat-notice-actions">
        {copyAction && (
          <ChatCopyButton
            key="copy"
            action={copyAction}
            copied={copied?.task === copyAction.task && copied.ok}
            onCopy={() => {
              void copy(copyAction.task)
            }}
          />
        )}
        {windowAction && <ChatTaskButton key="task" action={windowAction} onTask={onTask} />}
        {recheck}
      </div>
      {copyAction && copied?.task === copyAction.task && !copied.ok && <ChatCopyFailed />}
    </div>
  )
}
