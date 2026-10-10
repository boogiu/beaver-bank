import { cloneElement, useEffect, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { getReducedMotion } from '../hooks/useReducedMotion'

type ChildProps = { className?: string; style?: CSSProperties; 'data-entrance'?: boolean }

// 마운트한 단위만 등장한다. 같은 id의 데이터 갱신과 순서 변경은 재시작하지 않는다.
export function Entrance({
  order,
  wrap = false,
  children
}: {
  order: number
  wrap?: boolean
  children: ReactElement<ChildProps>
}): React.JSX.Element {
  const [delay] = useState(() => Math.min(order * 0.04, 0.3))
  const [animate, setAnimate] = useState(() => !getReducedMotion())
  useEffect(() => {
    if (!animate) return
    // 끝난 animation 이름을 제거해야 DOM 재정렬 때 브라우저가 다시 재생하지 않는다.
    const timer = window.setTimeout(() => setAnimate(false), (delay + 0.3) * 1000)
    return () => window.clearTimeout(timer)
  }, [animate, delay])
  const className = animate ? 'entrance' : ''
  const style = { '--entrance-delay': `${delay}s` } as CSSProperties
  if (wrap) {
    return (
      <div className={`entrance-hit ${className}`} style={style} data-entrance>
        {children}
      </div>
    )
  }
  return cloneElement(children, {
    className: `${children.props.className ?? ''} ${className}`,
    style: { ...children.props.style, ...style },
    'data-entrance': true
  })
}
