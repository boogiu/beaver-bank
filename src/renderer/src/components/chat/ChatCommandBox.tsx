import { Check, CircleAlert, CircleArrowUp, Copy, Download, LogIn, ShieldAlert } from 'lucide-react'
import type { ChatSetupAction, ChatSetupResult, ChatSetupTask } from '@shared/chat'
import { Icon } from '../Ui'

const taskNames: Record<ChatSetupTask, string> = {
  'claude-install': 'Claude Code 설치',
  'claude-login': 'Claude Code 로그인',
  'claude-update': 'Claude Code 업데이트',
  'codex-install': 'Codex 설치',
  'codex-login': 'Codex 로그인'
}

// 판정용 명령 바꾸기가 켜진 설치의 경고 줄(CS-25, CS-81).
export function ChatOverrideWarning(): React.JSX.Element {
  return (
    <p className="chat-override-warning">
      <Icon icon={ShieldAlert} size={14} />
      판정용 설치 명령 바꾸기가 켜져 있습니다. 아래 명령은 공식 명령이 아닙니다.
    </p>
  )
}

// 명령 복사의 안내 한 줄, 코드 상자, 출처(CS-81). 주소는 누를 수 없는 글자다(CS-55).
export function ChatCommandBox({ action }: { action: ChatSetupAction }): React.JSX.Element {
  return (
    <div className="chat-command">
      {action.override && <ChatOverrideWarning />}
      <p className="chat-command-notice">{action.notice}</p>
      {action.command && <pre className="chat-code">{action.command}</pre>}
      <p className="chat-command-source">{action.source}</p>
    </div>
  )
}

export function ChatCopyButton({
  action,
  copied,
  onCopy
}: {
  action: ChatSetupAction
  copied: boolean
  onCopy: () => void
}): React.JSX.Element {
  const reason = action.disabled ?? action.reason
  return (
    <button
      type="button"
      className={`chat-copy ${copied ? 'is-copied' : ''}`}
      aria-label={`${taskNames[action.task]} 명령 복사`}
      aria-disabled={action.dimmed || undefined}
      title={action.dimmed ? reason : undefined}
      onClick={() => {
        if (!action.dimmed) onCopy()
      }}
    >
      <Icon icon={copied ? Check : Copy} size={14} />
      {copied ? '복사했습니다' : '명령 복사'}
    </button>
  )
}

export function ChatCopyFailed(): React.JSX.Element {
  return <p className="chat-copy-failed">복사하지 못했습니다. 위 명령을 직접 골라 복사해 주세요.</p>
}

// 작업 단추(CS-22, CS-23, CS-27): [설치]·[로그인]·[업데이트]. 누를 수 없으면 흐리고 마우스를 올리면 이유가 보인다.
const taskButtons: Record<ChatSetupTask, [string, typeof Download]> = {
  'claude-install': ['설치', Download],
  'codex-install': ['설치', Download],
  'claude-login': ['로그인', LogIn],
  'codex-login': ['로그인', LogIn],
  'claude-update': ['업데이트', CircleArrowUp]
}
export function ChatTaskButton({
  action,
  onTask
}: {
  action: ChatSetupAction
  onTask: (task: ChatSetupTask) => void
}): React.JSX.Element {
  const [label, icon] = taskButtons[action.task]
  return (
    <button
      type="button"
      className="chat-primary"
      aria-label={taskNames[action.task]}
      aria-disabled={action.dimmed || undefined}
      title={action.dimmed ? action.disabled : undefined}
      onClick={() => {
        if (!action.dimmed) onTask(action.task)
      }}
    >
      <Icon icon={icon} size={14} />
      {label}
    </button>
  )
}

// 결과 줄(CS-29, CS-43): 성공은 Check와 #4fb6c9, 실패는 CircleAlert와 #e0a93b.
export function ChatResultLine({ result }: { result: ChatSetupResult }): React.JSX.Element {
  return (
    <p className={`chat-result ${result.ok ? 'is-ok' : 'is-failed'}`}>
      <Icon icon={result.ok ? Check : CircleAlert} size={14} />
      {result.text}
    </p>
  )
}
