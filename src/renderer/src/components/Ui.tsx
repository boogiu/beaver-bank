import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'
import type { PurposeAmount } from '@shared/ipc'
import { money } from './domain-ui'
import accountsImage from '../assets/illustrations/M1-C-accounts-a2.png'
import cardsImage from '../assets/illustrations/M1-C-cards-a2.png'
import purposesImage from '../assets/illustrations/M1-C-purposes-a2.png'
import graphImage from '../assets/illustrations/M1-C-graph-a2.png'

export function Icon({
  icon: Component,
  size = 18
}: {
  icon: LucideIcon
  size?: number
}): React.JSX.Element {
  return <Component className="icon" size={size} strokeWidth={1.75} aria-hidden="true" />
}

export function Button({
  children,
  icon,
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon
  variant?: 'default' | 'primary' | 'danger'
}): React.JSX.Element {
  return (
    <button className={`button ${variant === 'default' ? '' : variant} ${className}`} {...props}>
      {icon && <Icon icon={icon} size={16} />}
      {children}
    </button>
  )
}

export function AddButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <Button icon={Plus} variant="primary" {...props}>
      {children}
    </Button>
  )
}

export function Switch({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label className="switch-label">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" />
      {label}
    </label>
  )
}

export function PurposeAmountLabel({ value }: { value?: PurposeAmount }): React.JSX.Element | null {
  if (!value) return null
  return (
    <span className="purpose-amount">
      {value.amount === null ? (
        <span className="muted">잔액 미입력</span>
      ) : (
        <>
          <span className={value.amount < 0 ? 'negative' : ''}>{money(value.amount)}</span>
          {value.missingCount > 0 && <span className="muted">미입력 {value.missingCount}개</span>}
        </>
      )}
    </span>
  )
}

const emptyImages = {
  accounts: accountsImage,
  cards: cardsImage,
  purposes: purposesImage,
  graph: graphImage
}
export function EmptyState({
  kind,
  title,
  description,
  action
}: {
  kind: keyof typeof emptyImages
  title: string
  description: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="empty">
      <img src={emptyImages[kind]} alt="" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}
