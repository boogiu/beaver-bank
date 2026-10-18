import { useEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  BookOpen,
  Pencil,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react'
import type { Account, AccountBalance, Flow, Purpose } from '@shared/ipc'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { ACCOUNT_INFO, money } from './domain-ui'
import { Button, Icon } from './Ui'

// PB-31: presentation values only. Keep the existing payment-card implementation untouched.
const COVER_COLORS: Record<string, readonly [string, string]> = {
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

function Binding(): React.JSX.Element {
  return (
    <>
      <div className="passbook-spine" aria-hidden="true" />
      <svg className="passbook-binding" width="288" height="1" aria-hidden="true">
        <path d="M0 .5H288" stroke="currentColor" strokeDasharray="6 4" />
      </svg>
    </>
  )
}

export function AccountPassbook({
  account,
  balance,
  purpose,
  progress,
  flows,
  highlighted,
  onEdit,
  onClose,
  onBalance,
  onRestore,
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account
  balance: AccountBalance | undefined
  purpose: Purpose | undefined
  progress: number | undefined
  flows: Flow[] | null
  highlighted: boolean
  onEdit: () => void
  onClose: () => void
  onBalance: () => void
  onRestore: () => void
}): React.JSX.Element {
  const slot = useRef<HTMLDivElement>(null)
  const sheen = useRef<Animation | null>(null)
  const reduced = useReducedMotion()
  const [light, dark] = COVER_COLORS[purpose?.color.toUpperCase() ?? ''] ?? ['#4D4D4D', '#292929']
  const info = ACCOUNT_INFO[account.type]
  const savingsCover = account.type === 'installment' || account.type === 'deposit'
  const toggle = (): void => {
    sheen.current?.cancel()
    onOpenChange(!open)
  }
  const reset = (): void => {
    const element = slot.current
    if (!element) return
    element.style.setProperty('--pb-tilt-time', '0.4s')
    element.style.setProperty('--pb-light-time', '0.4s')
    element.style.setProperty('--pb-tilt-x', '0deg')
    element.style.setProperty('--pb-tilt-y', '0deg')
    element.style.setProperty('--pb-light-opacity', '0')
  }
  useEffect(() => {
    if (reduced) {
      reset()
      sheen.current?.cancel()
    }
    return () => {
      sheen.current?.cancel()
    }
  }, [reduced])
  const point = (event: PointerEvent<HTMLDivElement>, entering: boolean): void => {
    if (reduced || event.pointerType !== 'mouse') return
    const element = event.currentTarget
    // The hit rectangle never moves with the book; this prevents edge feedback/jitter.
    const rect = element.getBoundingClientRect()
    const x = event.clientX - rect.x,
      y = event.clientY - rect.y
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      reset()
      return
    }
    element.style.setProperty('--pb-tilt-time', entering ? '0.15s' : '0.08s')
    element.style.setProperty('--pb-light-time', '0.15s')
    element.style.setProperty('--pb-tilt-x', `${-(y / rect.height - 0.5) * 16}deg`)
    element.style.setProperty('--pb-tilt-y', `${(x / rect.width - 0.5) * 16}deg`)
    element.style.setProperty('--pb-light-x', `${x}px`)
    element.style.setProperty('--pb-light-y', `${y}px`)
    element.style.setProperty('--pb-light-opacity', '1')
    const gradient = element.querySelector('radialGradient')
    gradient?.setAttribute('cx', String(x))
    gradient?.setAttribute('cy', String(y))
  }
  const enter = (event: PointerEvent<HTMLElement>): void => {
    if (event.pointerType !== 'mouse') return
    event.currentTarget.dataset.mouse = 'true'
    if (!reduced && !open && account.isActive) {
      const band = event.currentTarget.querySelector('.passbook-sheen')
      sheen.current?.cancel()
      sheen.current =
        band?.animate(
          [
            { transform: 'translateX(-230px) skewX(-20deg)' },
            { transform: 'translateX(400px) skewX(-20deg)' }
          ],
          { duration: 600, easing: 'ease-out' }
        ) ?? null
    }
  }
  const related = flows?.filter(
    (flow) => flow.fromAccountId === account.id || flow.toAccountId === account.id
  )
  const visible = related?.slice(0, account.flowCount > 5 ? 4 : 5)
  return (
    <article
      id={`account-${account.id}`}
      className={`passbook-unit${account.isActive ? '' : ' passbook-closed'}${open ? ' passbook-open' : ''}${highlighted ? ' passbook-highlighted' : ''}`}
      style={{ '--pb-light': light, '--pb-dark': dark } as CSSProperties}
      onPointerEnter={enter}
      onPointerLeave={(event) => {
        delete event.currentTarget.dataset.mouse
        sheen.current?.cancel()
      }}
    >
      <div
        ref={slot}
        className="passbook-slot"
        onPointerEnter={(event) => point(event, true)}
        onPointerMove={(event) => point(event, false)}
        onPointerLeave={reset}
        onClick={toggle}
      >
        <div className="passbook-lift">
          <div className="passbook-tilt">
            <div className="passbook-surface">
              <div className="passbook-pages">
                <div className="passbook-inside" aria-hidden={!open} inert={!open}>
                  <Binding />
                  <div className="passbook-inside-heading">
                    <span className="passbook-inside-name" title={account.name}>
                      {account.name}
                    </span>
                    {!account.isActive && <span className="badge">해지</span>}
                    <span className="passbook-flow-count">
                      정기 흐름{account.flowCount > 0 ? ` ${account.flowCount}개` : ''}
                    </span>
                  </div>
                  <div className="passbook-ruled" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, index) => (
                      <span key={index} style={{ top: index * 20 }} />
                    ))}
                  </div>
                  <div className="passbook-flows">
                    {visible?.map((flow) => {
                      const incoming = flow.toAccountId === account.id
                      const Direction = incoming ? ArrowDownLeft : ArrowUpRight
                      return (
                        <div className="passbook-flow" key={flow.id}>
                          <Direction
                            size={14}
                            strokeWidth={1.75}
                            role="img"
                            aria-label={incoming ? '들어옴' : '나감'}
                            className={incoming ? 'passbook-incoming' : 'passbook-outgoing'}
                          />
                          <span className="passbook-flow-name" title={flow.name}>
                            {flow.name}
                          </span>
                          <span className="passbook-schedule">
                            {flow.cycle === 'monthly'
                              ? `매월 ${flow.day}일`
                              : `매년 ${flow.month}월 ${flow.day}일`}
                          </span>
                        </div>
                      )
                    })}
                    {related && account.flowCount === 0 && (
                      <div className="passbook-empty">없음</div>
                    )}
                    {related && account.flowCount > 5 && (
                      <div className="passbook-more">외 {account.flowCount - 4}개</div>
                    )}
                  </div>
                  <div className="passbook-memo">
                    <span>메모</span>
                    <span
                      className={account.memo ? 'passbook-memo-value' : 'passbook-empty'}
                      title={account.memo ?? undefined}
                    >
                      {account.memo?.replace(/\s*\n\s*/g, ' ') ?? '없음'}
                    </span>
                  </div>
                </div>
                <div
                  className={`passbook-cover${savingsCover ? ' passbook-black' : ''}`}
                  aria-hidden={open}
                  inert={open}
                >
                  {account.isActive && (
                    <>
                      <div className="passbook-follow" aria-hidden="true" />
                      <div className="passbook-sheen" aria-hidden="true" />
                    </>
                  )}
                  <Binding />
                  <div className="passbook-heading">
                    <span className="passbook-name" title={account.name}>
                      {account.name}
                    </span>
                    {!account.isActive && <span className="badge">해지</span>}
                    <span className="passbook-kind">
                      <Icon icon={info.icon} size={16} />
                      {info.label}
                    </span>
                  </div>
                  <div className="passbook-bank-row">
                    <span className="passbook-bank">
                      <span title={account.bank}>{account.bank}</span>
                      {account.numberTail && (
                        <span className="passbook-tail"> · {account.numberTail}</span>
                      )}
                    </span>
                    {purpose && (
                      <span className="passbook-purpose">
                        <span
                          className="passbook-dot"
                          style={{ backgroundColor: account.isActive ? purpose.color : undefined }}
                        />
                        <span title={purpose.name}>{purpose.name}</span>
                      </span>
                    )}
                  </div>
                  {account.isActive && !savingsCover && (
                    <info.icon
                      className="passbook-emboss"
                      size={64}
                      strokeWidth={1.25}
                      aria-hidden="true"
                    />
                  )}
                  {account.savings && (
                    <>
                      {account.isActive && progress !== undefined && (
                        <div className="passbook-period">
                          <div className="passbook-period-track" aria-hidden="true">
                            <span style={{ width: `${progress}%` }} />
                          </div>
                          <span>기간 {progress}%</span>
                        </div>
                      )}
                      <div className="passbook-detail passbook-detail-first">
                        <span title={`연 ${account.savings.interestRate}%`}>
                          연 {account.savings.interestRate}%
                        </span>
                        {account.monthlyContribution > 0 && (
                          <span>월 납입 {money(account.monthlyContribution)}</span>
                        )}
                      </div>
                      <div className="passbook-detail passbook-detail-second">
                        <span title={`만기 ${account.savings.maturityDate}`}>
                          만기 {account.savings.maturityDate}
                        </span>
                        {account.savings.targetAmount !== null && (
                          <span>목표 {money(account.savings.targetAmount)}</span>
                        )}
                      </div>
                    </>
                  )}
                  {balance &&
                    (balance.balance === null ? (
                      <div className="passbook-missing">잔액 미입력</div>
                    ) : (
                      <>
                        <div className="passbook-balance-heading">
                          잔액 · {balance.baseDate} 보정 기준
                        </div>
                        <div
                          className={`passbook-balance${balance.balance < 0 ? ' passbook-negative' : ''}`}
                        >
                          {money(balance.balance)}
                        </div>
                      </>
                    ))}
                  <div className="passbook-fold-shade" aria-hidden="true" />
                </div>
              </div>
              {account.isActive && !highlighted && (
                <svg className="passbook-edge" width="312" height="196" aria-hidden="true">
                  <defs>
                    <radialGradient
                      id={`passbook-edge-${account.id}`}
                      gradientUnits="userSpaceOnUse"
                      cx="0"
                      cy="0"
                      r="131"
                    >
                      <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
                      <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <path
                    d="M4 .5H308Q311.5 .5 311.5 4V184Q311.5 195.5 300 195.5H12Q.5 195.5 .5 184V4Q.5 .5 4 .5Z"
                    fill="none"
                    stroke={`url(#passbook-edge-${account.id})`}
                  />
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="passbook-actions">
        {account.isActive ? (
          <>
            <Button icon={Pencil} onClick={onEdit}>
              수정
            </Button>
            <Button icon={Ban} onClick={onClose}>
              해지
            </Button>
            <Button icon={SlidersHorizontal} onClick={onBalance}>
              {balance?.balance == null ? '잔액 입력' : '잔액 보정'}
            </Button>
          </>
        ) : (
          <Button icon={RotateCcw} onClick={onRestore}>
            복구
          </Button>
        )}
        <Button
          className="passbook-open-button"
          icon={BookOpen}
          onClick={toggle}
          title={open ? '표지 보기' : '안쪽 보기'}
          aria-label={`${account.name} ${open ? '표지 보기' : '안쪽 보기'}`}
          aria-pressed={open}
        />
      </div>
    </article>
  )
}
