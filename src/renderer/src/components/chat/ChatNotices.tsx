import { RotateCcw } from 'lucide-react'
import type { ChatStatus } from '@shared/chat'
import { Icon } from '../Ui'

export function ChatNotices({
  status,
  onCheck
}: {
  status: ChatStatus
  onCheck: () => void
}): React.JSX.Element | null {
  if (status.state === 'ready') return null
  const title = {
    missing: 'Claude Code를 찾지 못했습니다.',
    login: 'Claude Code에 로그인되어 있지 않습니다.',
    unknown: 'Claude Code의 상태를 확인하지 못했습니다.',
    checking: 'Claude Code의 상태를 확인하는 중입니다.'
  }[status.state]
  return (
    <div className="chat-notice">
      <strong>{title}</strong>
      <p>
        {status.state === 'missing' ? (
          <>
            Claude Code를 설치하고 터미널에서 <code>claude</code>를 한 번 실행해 로그인한 뒤 [다시
            확인]을 눌러 주세요.
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
      </p>
      <button className="chat-recheck" disabled={status.state === 'checking'} onClick={onCheck}>
        <Icon icon={RotateCcw} size={14} />
        다시 확인
      </button>
    </div>
  )
}
