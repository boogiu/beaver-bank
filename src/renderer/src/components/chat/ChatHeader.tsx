import { PanelRightClose, SquarePen } from 'lucide-react'
import type { ChatModel } from '@shared/chat'
import { Icon } from '../Ui'
import { ChatSelect } from './ChatConnection'

export function ChatHeader({
  model,
  busy,
  onModel,
  onNew,
  onClose
}: {
  model: ChatModel
  busy: boolean
  onModel: (model: ChatModel) => void
  onNew: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <header className="chat-header">
      <h2>AI 대화</h2>
      <ChatSelect
        label={`모델: ${model === 'default' ? '기본' : model[0].toUpperCase() + model.slice(1)}`}
        title="모델 (기본은 Claude Code의 기본 모델)"
        disabled={busy}
        value={model}
        options={['default', 'opus', 'sonnet', 'haiku'].map((value) => ({
          value,
          label: value === 'default' ? '기본' : value[0].toUpperCase() + value.slice(1)
        }))}
        onChange={(value) => onModel(value as ChatModel)}
      />
      <button className="chat-icon" aria-label="새 대화" title="새 대화" onClick={onNew}>
        <Icon icon={SquarePen} size={16} />
      </button>
      <button className="chat-icon" aria-label="채팅창 닫기" title="채팅창 닫기" onClick={onClose}>
        <Icon icon={PanelRightClose} size={16} />
      </button>
    </header>
  )
}
