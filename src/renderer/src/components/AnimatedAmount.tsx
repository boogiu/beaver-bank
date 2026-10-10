import { money } from './domain-ui'
import { useVisibleValue } from '../hooks/useVisibleOnce'

export function AnimatedAmount({ amount }: { amount: number | null }): React.JSX.Element {
  const { ref, value } = useVisibleValue<HTMLSpanElement>(amount ?? 0, true)
  return (
    <span
      ref={ref}
      className={`animated-amount ${amount === null ? 'muted' : amount < 0 ? 'negative' : ''}`}
    >
      {amount === null ? '잔액 미입력' : money(value)}
    </span>
  )
}
