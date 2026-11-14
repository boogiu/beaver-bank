import { useVisibleValue } from '../hooks/useVisibleOnce'

// 전체에서 차지하는 비율을 그 항목의 색으로 채우는 얇은 막대. 값은 옆의 글자가 전하므로 장식이다.
export function ShareBar({
  share,
  color
}: {
  share: number | null
  color: string
}): React.JSX.Element {
  const target = Math.max(0, Math.min(100, share ?? 0))
  const { ref, value } = useVisibleValue<HTMLSpanElement>(target)
  return (
    <span ref={ref} className="share-bar" aria-hidden="true">
      {target > 0 && <span style={{ width: `${value}%`, backgroundColor: color }} />}
    </span>
  )
}
