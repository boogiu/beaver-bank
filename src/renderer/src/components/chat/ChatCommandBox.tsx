import { Check, Copy } from 'lucide-react'
import type { ChatSetupAction, ChatSetupTask } from '@shared/chat'
import { Icon } from '../Ui'

const taskNames: Record<ChatSetupTask, string> = {
  'claude-install': 'Claude Code 설치',
  'claude-login': 'Claude Code 로그인',
  'claude-update': 'Claude Code 업데이트',
  'codex-install': 'Codex 설치',
  'codex-login': 'Codex 로그인'
}

// 명령 복사의 안내 한 줄, 코드 상자, 출처(CS-81). 주소는 누를 수 없는 글자다(CS-55).
export function ChatCommandBox({ action }: { action: ChatSetupAction }): React.JSX.Element {
  return (
    <div className="chat-command">
      <p className="chat-command-notice">{action.notice}</p>
      <pre className="chat-code">{action.command}</pre>
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
  return (
    <button
      type="button"
      className={`chat-copy ${copied ? 'is-copied' : ''}`}
      aria-label={`${taskNames[action.task]} 명령 복사`}
      aria-disabled={action.dimmed || undefined}
      title={action.dimmed ? action.reason : undefined}
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
