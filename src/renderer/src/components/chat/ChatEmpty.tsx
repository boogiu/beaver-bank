import type { ChatSource, ChatStatus } from '@shared/chat'
import mascot from '../../assets/illustrations/M1-C-mascot-a2.png'
import { ChatNotices } from './ChatNotices'
import { usageNotice } from './ChatDialogs'

export function ChatEmpty({
  status,
  source,
  onSuggestion,
  onCheck
}: {
  status: ChatStatus
  source: ChatSource
  onSuggestion: (text: string) => void
  onCheck: () => void
}): React.JSX.Element {
  return (
    <div className="chat-empty">
      <img src={mascot} alt="" />
      <h3>무엇이 궁금하세요?</h3>
      <p>BeaverBank의 계좌·카드·정기 흐름을 보고 답합니다.</p>
      {status.state === 'ready' ? (
        <div className="chat-suggestions">
          {['계좌별 잔액 알려 줘', '이번 달 정기 결제 보여 줘', '다음 주에 나갈 돈은?'].map(
            (text) => (
              <button key={text} onClick={() => onSuggestion(text)}>
                {text}
              </button>
            )
          )}
        </div>
      ) : (
        <ChatNotices status={status} onCheck={onCheck} />
      )}
      <div className="chat-privacy">
        <p>{usageNotice}</p>
        <p>
          보낸 글과 AI가 읽은 데이터는 Anthropic(Claude)으로 전송되고, Claude Code가 이 PC의{' '}
          <code>{'%USERPROFILE%\\.claude\\projects\\'}</code>에 대화 기록을 남깁니다.{' '}
          {source === 'demo'
            ? '지금은 데모(가짜) 데이터에 연결되어 있습니다.'
            : '지금은 실제 데이터에 연결되어 있습니다.'}
        </p>
      </div>
    </div>
  )
}
