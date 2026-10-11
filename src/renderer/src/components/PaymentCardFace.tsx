import type { CSSProperties } from 'react'
import type { Card, Flow } from '@shared/ipc'
import { CARD_INFO } from './domain-ui'
import { Icon } from './Ui'

// RC-31: presentation-only palette; unknown or missing purposes use neutral colors.
const FACE_COLORS: Record<string, readonly [string, string]> = {
  '#397768': ['#2B594E', '#17302A'],
  '#346D82': ['#275262', '#152C34'],
  '#84723E': ['#63562F', '#352E19'],
  '#4C7865': ['#395A4C', '#1E3028'],
  '#566D7B': ['#41525C', '#222C31'],
  '#8B6256': ['#684A41', '#382722'],
  '#9A684B': ['#744E38', '#3E2A1E'],
  '#4F6F97': ['#3B5371', '#202C3C'],
  '#8E5868': ['#6B424E', '#39232A'],
  '#6F7B45': ['#535C34', '#2C311C'],
  '#4A7A83': ['#385C62', '#1E3134'],
  '#9A7244': ['#745633', '#3E2E1B']
}

function NumberDots(): React.JSX.Element {
  return (
    <span className="payment-face-dots" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  )
}

export function PaymentCardFace({
  card,
  purposeColor,
  highlighted,
  back = false,
  hidden = false,
  flows = null
}: {
  card: Card
  purposeColor: string | undefined
  highlighted: boolean
  back?: boolean
  hidden?: boolean
  flows?: Flow[] | null
}): React.JSX.Element {
  const [light, dark] = FACE_COLORS[purposeColor?.toUpperCase() ?? ''] ?? ['#4D4D4D', '#292929']
  const info = CARD_INFO[card.type]
  const account = card.linkedAccount
  return (
    <>
      <div
        className={`payment-face payment-face-${card.isActive ? card.type : 'closed'}${highlighted ? ' payment-face-highlighted' : ''}${back ? ' payment-face-back' : ''}`}
        style={{ '--face-light': light, '--face-dark': dark } as CSSProperties}
        aria-hidden={hidden}
        inert={hidden}
      >
        {card.isActive && <div className="payment-follow-light" aria-hidden="true" />}
        {back ? (
          <PaymentCardBack card={card} flows={flows} />
        ) : (
          <>
            <div className="payment-face-name" title={card.name}>
              {card.name}
            </div>
            <div className="payment-face-issuer" title={card.issuer}>
              {card.issuer}
            </div>
            {!card.isActive && <span className="payment-face-badge">해지</span>}
            <svg className="payment-face-chip" viewBox="0 0 34 26" aria-hidden="true">
              <path d="M0 8.5H34 M0 17.5H34 M11.5 0V26 M22.5 0V26" />
            </svg>
            <div className="payment-face-kind">
              <Icon icon={info.icon} size={16} />
              {info.label}
            </div>
            <div className="payment-face-number">
              <NumberDots />
              <NumberDots />
              <NumberDots />
              {card.numberTail ? (
                <span className="payment-face-tail" aria-label={`번호 끝 4자리 ${card.numberTail}`}>
                  {card.numberTail}
                </span>
              ) : (
                <NumberDots />
              )}
            </div>
            <div className="payment-face-footer">
              <div className="payment-face-account">
                <div className="payment-face-label">연결 계좌</div>
                <div className={`payment-face-value${account ? '' : ' payment-face-unlinked'}`}>
                  {account ? (
                    <>
                      <span className="payment-face-account-name" title={account.name}>
                        {account.name}
                      </span>
                      {!account.isActive && (
                        <span className="payment-face-account-closed"> (해지)</span>
                      )}
                    </>
                  ) : (
                    '없음'
                  )}
                </div>
              </div>
              {card.type === 'credit' && (
                <div className="payment-face-day">
                  <div className="payment-face-label">결제일</div>
                  <div className="payment-face-value">매월 {card.paymentDay}일</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {card.isActive && !highlighted && (
        <svg
          className={`payment-edge-light${back ? ' payment-edge-back' : ''}`}
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <defs>
            <radialGradient
              id={`edge-${card.id}-${back ? 'back' : 'front'}`}
              gradientUnits="userSpaceOnUse"
              cx="0"
              cy="0"
              r="1"
            >
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect
            x="0.5"
            y="0.5"
            width="calc(100% - 1px)"
            height="calc(100% - 1px)"
            rx="11.5"
            fill="none"
            stroke={`url(#edge-${card.id}-${back ? 'back' : 'front'})`}
          />
        </svg>
      )}
    </>
  )
}

function PaymentCardBack({ card, flows }: { card: Card; flows: Flow[] | null }): React.JSX.Element {
  const payments = flows?.filter((flow) => flow.cardId === card.id && flow.kind === 'payment')
  const visible = payments?.slice(0, card.flowCount > 3 ? 2 : 3)
  return (
    <>
      <div className="payment-back-heading">
        정기 결제{card.flowCount > 0 ? ` ${card.flowCount}개` : ''}
      </div>
      {payments && (
        <div className="payment-back-payments">
          {card.flowCount === 0 ? (
            <div className="payment-back-empty">없음</div>
          ) : (
            <>
              {visible?.map((flow) => (
                <div className="payment-back-row" key={flow.id}>
                  <span className="payment-back-flow-name" title={flow.name}>
                    {flow.name}
                  </span>
                  <span className="payment-back-schedule">
                    {flow.cycle === 'monthly'
                      ? `매월 ${flow.day}일`
                      : `매년 ${flow.month}월 ${flow.day}일`}
                  </span>
                </div>
              ))}
              {card.flowCount > 3 && (
                <div className="payment-back-more">외 {card.flowCount - 2}개</div>
              )}
            </>
          )}
        </div>
      )}
      <div className="payment-back-memo-heading">메모</div>
      <div
        className={`payment-back-memo${card.memo ? '' : ' payment-back-empty'}`}
        title={card.memo ?? undefined}
      >
        {card.memo ?? '없음'}
      </div>
      {!card.isActive && <span className="payment-face-badge">해지</span>}
    </>
  )
}
