import { useState } from 'react'
import { Check, CircleAlert, Database, LoaderCircle } from 'lucide-react'
import type { ChatBlock } from '@shared/chat'
import { Icon } from '../Ui'

const names: Record<string, string> = {
  get_status: '연결 상태',
  get_dashboard: '대시보드 요약',
  list_purposes: '용도 목록',
  list_accounts: '계좌 목록과 잔액',
  list_cards: '카드 목록',
  list_flows: '정기 흐름 목록',
  get_month_flows: '한 달의 회차',
  list_balance_corrections: '잔액 보정 이력'
}
export function ChatToolRow({
  tool
}: {
  tool: Extract<ChatBlock, { kind: 'tool' }>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="chat-tool">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon icon={Database} size={14} />
        <span>
          {names[tool.name] || tool.name}
          {tool.state === 'running' ? ' 보는 중' : ''}
        </span>
        <span className={`chat-tool-${tool.state}`}>
          <Icon
            icon={
              tool.state === 'running' ? LoaderCircle : tool.state === 'error' ? CircleAlert : Check
            }
            size={14}
          />
        </span>
      </button>
      {open && <pre>{JSON.stringify(tool.input, null, 2)}</pre>}
    </div>
  )
}
