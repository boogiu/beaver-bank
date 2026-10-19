import { Modal } from '../Modal'
import { ChatRichText } from './ChatRichText'

export const usageNotice =
  '채팅창은 이 PC에 로그인된 Claude Code 계정으로 대화합니다. 보낸 메시지와 AI가 읽은 데이터만큼 그 계정의 사용량(요금제 한도 또는 API 요금)을 씁니다.'
export const privacyNotice =
  'AI가 BeaverBank 도구로 읽은 계좌·카드 이름, 금융기관, 끝자리, 금액·잔액, 날짜, 정기 흐름과 채팅창에 입력한 글은 Anthropic(Claude)의 서버로 전송됩니다. 전송된 뒤의 보관·사용은 그 서비스의 약관과 설정을 따르며 BeaverBank가 통제할 수 없습니다. 도구 결과에 메모 내용은 넣지 않습니다. BeaverBank는 대화를 저장하지 않지만, Claude Code는 이 대화를 이 PC의 사용자 폴더(`%USERPROFILE%\\.claude\\projects\\`) 아래에 자기 세션 기록으로 남깁니다. BeaverBank는 그 기록을 읽거나 지우지 않습니다.'

export function ChatDialog({
  kind,
  onClose,
  onConfirm
}: {
  kind: 'new' | 'real'
  onClose: () => void
  onConfirm: () => void | Promise<void>
}): React.JSX.Element {
  return (
    <Modal
      title={
        kind === 'new' ? '지금 대화를 지우고 새로 시작할까요?' : '실제 데이터를 AI에 연결할까요?'
      }
      submitLabel={kind === 'new' ? '새 대화' : '실제 데이터 연결'}
      onClose={onClose}
      onSubmit={onConfirm}
      focusedButtonsOnly
      small
    >
      <div className="form-note">
        {kind === 'real' ? (
          <>
            <ChatRichText text={privacyNotice} />
            <p>연결한 뒤에도 기입은 따로 켜야 하고, 기입마다 확인을 받습니다.</p>
          </>
        ) : (
          '지금 대화는 앱에 저장되지 않습니다.'
        )}
      </div>
    </Modal>
  )
}
