import type { ChatWriteCard } from '@shared/chat'
import { ACCOUNT_INFO, CARD_INFO, FLOW_INFO, FLOW_CATEGORY, money } from '../domain-ui'

const labels: Record<string, string> = {
  id: '대상',
  name: '이름',
  color: '색',
  bank: '금융기관',
  issuer: '카드사',
  type: '종류',
  numberTail: '끝자리',
  purposeId: '용도',
  accountId: '연결 계좌',
  paymentDay: '결제일',
  savings: '적금·예금 정보',
  startDate: '시작일',
  maturityDate: '만기일',
  interestRate: '연이율',
  interestType: '이자 방식',
  taxType: '과세',
  targetAmount: '목표액',
  kind: '흐름 종류',
  amount: '금액',
  category: '분류',
  day: '지정일',
  endDate: '종료일',
  effectiveStartDate: '적용 시작일',
  fromAccountId: '보내는 계좌',
  toAccountId: '받는 계좌',
  cardId: '결제 카드',
  isVariable: '변동 금액',
  cycle: '주기',
  month: '지정 월',
  flowId: '흐름',
  occurrenceDate: '회차 날짜',
  action: '처리',
  actualAmount: '이번 금액',
  date: '보정 날짜',
  balance: '실제 잔액',
  memo: '메모'
}
const enums: Record<string, Record<string, string>> = {
  interestType: { simple: '단리', compound: '복리' },
  taxType: { normal: '일반과세', tax_free: '비과세', preferential: '세금우대' },
  cycle: { monthly: '매월', yearly: '매년' },
  action: { original: '원래대로', amount: '금액 변경', skip: '건너뛰기' },
  category: FLOW_CATEGORY,
  kind: Object.fromEntries(Object.entries(FLOW_INFO).map(([key, value]) => [key, value.label]))
}
const json = (value: unknown): string => JSON.stringify(value) ?? String(value)
function format(key: string, value: unknown, card: ChatWriteCard): string {
  if (value === null) return '비움'
  if (!Object.hasOwn(labels, key)) return json(value)
  const reference =
    key === 'id'
      ? card.name.includes('purpose')
        ? 'purpose'
        : card.name.includes('account')
          ? 'account'
          : card.name.includes('card')
            ? 'card'
            : 'flow'
      : key === 'purposeId'
        ? 'purpose'
        : key === 'cardId'
          ? 'card'
          : key === 'flowId'
            ? 'flow'
            : ['accountId', 'fromAccountId', 'toAccountId'].includes(key)
              ? 'account'
              : undefined
  if (reference && (typeof value === 'number' || typeof value === 'string')) {
    const names = card.names[reference]
    const name = names && Object.hasOwn(names, String(value)) ? names[String(value)] : undefined
    return name ? `${name} (#${value})` : `#${value}`
  }
  if (
    ['targetAmount', 'amount', 'actualAmount', 'balance'].includes(key) &&
    typeof value === 'number'
  )
    return money(value)
  if (typeof value === 'number') {
    if (key === 'interestRate') return `${value}%`
    if (['day', 'paymentDay'].includes(key)) return `${value}일`
    if (key === 'month') return `${value}월`
  }
  if (key === 'isVariable' && typeof value === 'boolean') return value ? '예' : '아니오'
  if (typeof value !== 'string') return json(value)
  if (key === 'type') {
    const info = card.name.includes('card') ? CARD_INFO : ACCOUNT_INFO
    return (info as Record<string, { label: string }>)[value]?.label ?? value
  }
  const values = Object.hasOwn(enums, key) ? enums[key] : undefined
  return values && Object.hasOwn(values, value) ? values[value] : value
}

export function ChatWriteFields({ card }: { card: ChatWriteCard }): React.JSX.Element {
  const row = (key: string, value: unknown, nested = false, prefix = ''): React.ReactNode => {
    const path = prefix + key
    const group =
      key === 'savings' && value !== null && typeof value === 'object' && !Array.isArray(value)
    return (
      <div key={path} className={`chat-write-field ${nested ? 'is-nested' : ''}`} data-field={path}>
        <div className="chat-write-field-row">
          <span>
            {key === 'startDate' && nested
              ? '가입일'
              : key === 'accountId' && card.name === 'correct_balance'
                ? '계좌'
                : Object.hasOwn(labels, key)
                  ? labels[key]
                  : key}
          </span>
          <span>
            {group ? (
              ''
            ) : (
              <>
                {key === 'color' && typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) && (
                  <i className="chat-color-swatch" style={{ backgroundColor: value }} />
                )}
                {format(key, value, card)}
              </>
            )}
          </span>
        </div>
        {group && Object.entries(value).map(([name, item]) => row(name, item, true, path + '.'))}
      </div>
    )
  }
  return (
    <div className="chat-write-fields">
      {card.input !== null && typeof card.input === 'object' && !Array.isArray(card.input) ? (
        Object.entries(card.input).map(([key, value]) => row(key, value))
      ) : (
        <div className="chat-write-field" data-field="$input">
          {json(card.input)}
        </div>
      )}
    </div>
  )
}
