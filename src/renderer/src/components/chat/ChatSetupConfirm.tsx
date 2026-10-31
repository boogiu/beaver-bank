import { useState } from 'react'
import {
  CirclePause,
  FolderDown,
  Globe,
  Info,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  SquareTerminal,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import type { ChatSetupAction, ChatSetupPending, ChatSetupTask } from '@shared/chat'
import { Modal } from '../Modal'
import { Icon } from '../Ui'
import { ChatOverrideWarning } from './ChatCommandBox'

// 실행 확인 팝업의 문구(CS-26). 명령 글자와 명령 줄은 main의 판정과 준비(snapshot)에서만 받는다(CS-56).
const texts: Record<
  ChatSetupTask,
  { title: string; intro: string; facts: [LucideIcon, string][]; approve: string }
> = {
  'claude-install': {
    title: 'Claude Code를 설치할까요?',
    intro:
      'Anthropic의 공식 설치 명령을 새 Windows Terminal 창에서 실행합니다. 진행 상황은 그 창에 보입니다.',
    facts: [
      [
        FolderDown,
        '설치 위치: %USERPROFILE%\\.local\\bin\\claude.exe · 이 사용자만, 관리자 권한 없이 설치됩니다.'
      ],
      [
        Globe,
        '인터넷에서 설치 파일을 내려받습니다. 이 방법으로 설치한 Claude Code는 이후 스스로 업데이트합니다.'
      ],
      [
        UserRound,
        '쓰려면 Claude Pro·Max·Team·Enterprise 또는 Console 계정이 필요합니다. 무료 요금제로는 쓸 수 없습니다.'
      ],
      [RotateCcw, '창을 닫으면 BeaverBank가 상태를 다시 확인합니다.']
    ],
    approve: '설치 창 열기'
  },
  'codex-install': {
    title: 'Codex를 설치할까요?',
    intro:
      'OpenAI의 공식 Windows 설치 명령을 새 Windows Terminal 창에서 실행합니다. 진행 상황은 그 창에 보입니다.',
    facts: [
      [
        FolderDown,
        '설치 위치: %LOCALAPPDATA%\\Programs\\OpenAI\\Codex\\bin\\codex.exe · 설치 명령이 이 폴더를 사용자 PATH에 더합니다. 관리자 권한은 쓰지 않습니다.'
      ],
      [
        Info,
        '-ExecutionPolicy ByPass는 이 설치 명령의 PowerShell에만 적용되고, PC의 실행 정책은 바뀌지 않습니다.'
      ],
      [
        MessageSquare,
        "설치 끝에 'Start Codex now?'를 물으면 N을 눌러도 됩니다. 로그인은 [로그인]으로 따로 합니다."
      ],
      [Info, '채팅창의 Codex 연결은 아직 준비 중입니다. 설치한 Codex는 MCP 연동에 쓸 수 있습니다.'],
      [RotateCcw, '창을 닫으면 BeaverBank가 상태를 다시 확인합니다.']
    ],
    approve: '설치 창 열기'
  },
  'claude-login': {
    title: 'Claude Code에 로그인할까요?',
    intro:
      'Claude Code의 로그인 명령을 새 Windows Terminal 창에서 실행합니다. Claude Code가 브라우저를 열면 계정으로 로그인해 주세요.',
    facts: [
      [
        UserRound,
        'Claude 구독 계정으로 로그인합니다. Console 계정(API 요금)은 터미널에서 claude auth login --console로 직접 로그인해 주세요.'
      ],
      [
        ShieldCheck,
        'BeaverBank는 로그인 정보를 읽거나 저장하지 않습니다. 로그인 정보는 Claude Code가 보관합니다.'
      ],
      [RotateCcw, '로그인을 마치고 창을 닫으면 상태를 다시 확인합니다.']
    ],
    approve: '로그인 창 열기'
  },
  'codex-login': {
    title: 'Codex에 로그인할까요?',
    intro:
      'Codex의 로그인 명령을 새 Windows Terminal 창에서 실행합니다. Codex가 브라우저를 열면 ChatGPT 계정으로 로그인해 주세요.',
    facts: [
      [UserRound, 'ChatGPT 계정으로 로그인합니다. API 키 로그인은 BeaverBank에서 하지 않습니다.'],
      [
        Info,
        '브라우저 로그인이 안 되면 공식 문서의 기기 코드 로그인(codex login --device-auth)을 터미널에서 직접 쓸 수 있습니다.'
      ],
      [
        ShieldCheck,
        'BeaverBank는 로그인 정보를 읽거나 저장하지 않습니다. 로그인 정보는 Codex가 보관합니다.'
      ],
      [RotateCcw, '로그인을 마치고 창을 닫으면 상태를 다시 확인합니다.']
    ],
    approve: '로그인 창 열기'
  },
  'claude-update': {
    title: 'Claude Code를 업데이트할까요?',
    intro: 'Claude Code의 업데이트 명령을 새 Windows Terminal 창에서 실행합니다.',
    facts: [
      [Info, '지금 판: <판> · 채팅창은 2.1.284 이상에서 확인했습니다.'],
      [CirclePause, '업데이트 창이 열려 있는 동안에는 채팅창에서 보낼 수 없습니다.'],
      [RotateCcw, '창을 닫으면 BeaverBank가 상태를 다시 확인합니다.']
    ],
    approve: '업데이트 창 열기'
  }
}
const terminalFact =
  'BeaverBank는 Windows Terminal로 이 창을 열고, 창이 닫히기를 기다립니다. BeaverBank를 꺼도 이 창은 닫히지 않습니다. 끝나면 창에서 Enter를 눌러 닫아 주세요.'

// 실행 확인 팝업(CS-25). 처음 포커스는 [취소], 본문의 Enter로는 아무것도 하지 않는다.
// [취소]·Esc·닫기 단추는 준비만 지우고 아무것도 시작하지 않는다(CS-40). 승인은 한 번만 통한다(CS-48).
export function ChatSetupConfirm({
  task,
  action,
  pending,
  version,
  onCancel,
  onApprove
}: {
  task: ChatSetupTask
  action?: ChatSetupAction
  pending?: ChatSetupPending
  version?: string
  onCancel: () => void
  onApprove: (token: string) => void
}): React.JSX.Element {
  const [approved, setApproved] = useState(false)
  const text = texts[task]
  const ready = !approved && pending?.task === task && action?.task === task && !action.dimmed
  const override = !!action?.override
  const label = override ? '실행할 설치 명령(판정용)' : '공식 명령'
  return (
    <Modal
      title={text.title}
      small
      focusedButtonsOnly
      onClose={onCancel}
      initialFocus=".chat-confirm-cancel"
      returnFocus=".chat-tools-button"
      footer={
        <>
          <button type="button" className="button chat-confirm-cancel" data-modal-close>
            취소
          </button>
          <button
            type="button"
            className="button primary chat-confirm-approve"
            aria-disabled={!ready || undefined}
            onClick={(event) => {
              if (!ready || !pending) return
              // 곧바로 흐리게 한다(CS-48). 팝업이 같은 차례에 닫혀도 닫히는 모습에 흐린 단추가 남는다.
              event.currentTarget.setAttribute('aria-disabled', 'true')
              setApproved(true)
              onApprove(pending.token)
            }}
          >
            {text.approve}
          </button>
        </>
      }
    >
      <div className="chat-confirm">
        {override && <ChatOverrideWarning />}
        <p className="chat-confirm-intro">{text.intro}</p>
        <p className="chat-confirm-label" id="chat-confirm-official">
          {label}
        </p>
        <pre className="chat-code" role="region" aria-labelledby="chat-confirm-official">
          {action?.task === task ? action.command : ''}
        </pre>
        <p className="chat-command-source">{action?.task === task ? action.source : ''}</p>
        <p className="chat-confirm-label is-spaced" id="chat-confirm-display">
          BeaverBank가 여는 창의 명령 줄 전체
        </p>
        <pre
          className="chat-code chat-confirm-display"
          role="region"
          aria-labelledby="chat-confirm-display"
        >
          {pending?.task === task ? pending.display : ''}
        </pre>
        <ul className="chat-confirm-facts">
          {[...text.facts, [SquareTerminal, terminalFact] as [LucideIcon, string]].map(
            ([icon, fact]) => (
              <li key={fact}>
                <Icon icon={icon} size={14} />
                {fact.replace('<판>', version || '알 수 없음')}
              </li>
            )
          )}
        </ul>
      </div>
    </Modal>
  )
}
