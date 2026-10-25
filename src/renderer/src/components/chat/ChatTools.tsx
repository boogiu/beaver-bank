import { RotateCcw, ShieldCheck } from 'lucide-react'
import type { ChatRequest, ChatSetupAction, ChatSnapshot, ChatStatus } from '@shared/chat'
import { Modal } from '../Modal'
import { Icon } from '../Ui'
import { useChatCopy } from '../../hooks/useChatCopy'
import { ChatCommandBox, ChatCopyButton, ChatCopyFailed } from './ChatCommandBox'

// 행의 상태 글과 색(CS-22).
function statusText(codex: boolean, status: ChatStatus): { text: string; warning?: boolean } {
  if (status.state === 'checking') return { text: '확인 중' }
  if (status.state === 'missing') return { text: '설치되어 있지 않음' }
  if (status.state === 'unknown') return { text: '확인하지 못함' }
  if (status.state === 'login')
    return { text: status.version ? `로그인 필요 · ${status.version}` : '로그인 필요' }
  if (codex || status.verified) return { text: `준비됨 · ${status.version}` }
  return { text: `검증되지 않은 판 · ${status.version || '알 수 없음'}`, warning: true }
}

function ChatToolRow({
  name,
  use,
  codex,
  status,
  action,
  result,
  onCopy
}: {
  name: string
  use: string
  codex: boolean
  status: ChatStatus
  action?: ChatSetupAction
  result: { ok: boolean } | null
  onCopy: () => void
}): React.JSX.Element {
  const { text, warning } = statusText(codex, status)
  const copy = action?.mode === 'copy'
  return (
    <div className="chat-tool-row" role="group" aria-label={name}>
      <div className="chat-tool-main">
        <div className="chat-tool-title">
          <strong>{name}</strong>
          <span>{use}</span>
        </div>
        <div className="chat-tool-status" aria-live="polite">
          <span className={`chat-status-dot ${status.state}`} />
          <span className={warning ? 'chat-warning' : status.state === 'ready' ? 'is-ready' : ''}>
            {text}
          </span>
        </div>
        {action?.reason && !copy && <p className="chat-tool-reason">{action.reason}</p>}
        {copy && <ChatCommandBox action={action} />}
        {copy && result?.ok === false && <ChatCopyFailed />}
      </div>
      {copy && <ChatCopyButton action={action} copied={!!result?.ok} onCopy={onCopy} />}
    </div>
  )
}

// AI 도구 팝업(CS-21). 01에는 작업 단추가 없고, 창을 열 수 없을 때만 명령 복사가 있다.
export function ChatTools({
  chat,
  waiting,
  onCheck,
  request,
  onClose
}: {
  chat: ChatSnapshot
  waiting: boolean
  onCheck: () => void
  request: (request: ChatRequest) => Promise<ChatSnapshot>
  onClose: () => void
}): React.JSX.Element {
  const { result, copy } = useChatCopy(request, chat.setup.copy?.sequence ?? 0)
  // 확인 요청의 답을 받기 전에는 두 행이 확인 중이다. 답을 받는 동안의 Claude는 다시 확인하지 않아 마지막 상태다.
  const busy = chat.replies.some((reply) => reply.state === 'running')
  const claude: ChatStatus = waiting && !busy ? { state: 'checking' } : chat.status
  const codex: ChatStatus = waiting ? { state: 'checking' } : chat.codex
  const checking = claude.state === 'checking' || codex.state === 'checking'
  const rowResult = (client: 'claude' | 'codex'): { ok: boolean } | null =>
    result && result.task === chat.setup[client]?.task ? result : null
  return (
    <Modal
      title="AI 도구"
      small
      focusedButtonsOnly
      onClose={onClose}
      initialFocus=".chat-tools-close"
      footer={
        <>
          {/* 확인 중에는 흐리게 둔다. disabled로 하면 누른 단추의 포커스가 팝업 밖으로 빠진다. */}
          <button
            type="button"
            className="button chat-tools-recheck"
            aria-disabled={checking || undefined}
            onClick={() => {
              if (!checking) onCheck()
            }}
          >
            <Icon icon={RotateCcw} size={14} />
            다시 확인
          </button>
          <button type="button" className="button chat-tools-close" data-modal-close>
            닫기
          </button>
        </>
      }
    >
      <div className="chat-tools">
        <p className="chat-tools-intro">
          채팅창과 MCP 연동에 쓰는 명령 줄 프로그램입니다. 설치·로그인·업데이트는 각 회사의 공식
          명령을 Windows Terminal 창에서 실행하고, 실행 전에 명령을 보여 드립니다.
        </p>
        <div className="chat-tools-rows">
          <ChatToolRow
            name="Claude Code"
            use="채팅창 · MCP 연동"
            codex={false}
            status={claude}
            action={claude.state === 'checking' ? undefined : chat.setup.claude}
            result={rowResult('claude')}
            onCopy={() => {
              if (chat.setup.claude) void copy(chat.setup.claude.task)
            }}
          />
          <ChatToolRow
            name="Codex"
            use="MCP 연동 · 채팅창 연결은 준비 중"
            codex
            status={codex}
            action={codex.state === 'checking' ? undefined : chat.setup.codex}
            result={rowResult('codex')}
            onCopy={() => {
              if (chat.setup.codex) void copy(chat.setup.codex.task)
            }}
          />
        </div>
        <p className="chat-tools-note">
          <Icon icon={ShieldCheck} size={14} />
          BeaverBank는 관리자 권한을 요청하지 않고, 로그인 정보를 읽거나 저장하지 않습니다.
        </p>
      </div>
    </Modal>
  )
}
