import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Ban, FlipHorizontal2, Pencil, RotateCcw } from 'lucide-react'
import type { Card, Flow } from '@shared/ipc'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { Button } from './Ui'
import { PaymentCardFace } from './PaymentCardFace'

export function PaymentCardUnit({
  card,
  purposeColor,
  highlighted,
  flows,
  onEdit,
  onClose,
  onRestore
}: {
  card: Card
  purposeColor: string | undefined
  highlighted: boolean
  flows: Flow[] | null
  onEdit: () => void
  onClose: () => void
  onRestore: () => void
}): React.JSX.Element {
  const [turns, setTurns] = useState(0)
  const flipped = turns % 2 === 1
  const slot = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const flip = (): void => setTurns((value) => value + 1)
  const reset = (): void => {
    const element = slot.current
    if (!element) return
    element.style.setProperty('--tilt-time', '0.4s')
    element.style.setProperty('--light-time', '0.4s')
    element.style.setProperty('--tilt-x', '0deg')
    element.style.setProperty('--tilt-y', '0deg')
    element.style.setProperty('--light-opacity', '0')
  }
  useEffect(() => {
    if (reduced) reset()
  }, [reduced])
  const point = (event: PointerEvent<HTMLDivElement>, entering: boolean): void => {
    if (reduced || event.pointerType !== 'mouse') return
    const element = event.currentTarget
    // Read the untransformed hit area, never the moving surface.
    const rect = element.getBoundingClientRect()
    const x = event.clientX - rect.x
    const y = event.clientY - rect.y
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      reset()
      return
    }
    element.style.setProperty('--tilt-time', entering ? '0.15s' : '0.08s')
    element.style.setProperty('--light-time', '0.15s')
    element.style.setProperty('--tilt-x', `${-(y / rect.height - 0.5) * 16}deg`)
    element.style.setProperty('--tilt-y', `${(x / rect.width - 0.5) * 16}deg`)
    element.style.setProperty('--light-x', `${x}px`)
    element.style.setProperty('--light-y', `${y}px`)
    element.style.setProperty('--light-opacity', '1')
    element.querySelectorAll('.payment-edge-light radialGradient').forEach((gradient) => {
      gradient.setAttribute('cx', String(x))
      gradient.setAttribute('cy', String(y))
      gradient.setAttribute('r', String(rect.width * 0.42))
    })
  }
  return (
    <article id={`card-${card.id}`} className="payment-card-unit">
      <div
        ref={slot}
        className="payment-slot"
        onPointerEnter={(event) => point(event, true)}
        onPointerMove={(event) => point(event, false)}
        onPointerLeave={reset}
        onClick={flip}
      >
        <div className="payment-card-lift">
          <div className="payment-tilt">
            <div className="payment-flipper" style={{ transform: `rotateY(${turns * 180}deg)` }}>
              <PaymentCardFace
                card={card}
                purposeColor={purposeColor}
                highlighted={highlighted}
                hidden={flipped}
              />
              <PaymentCardFace
                card={card}
                purposeColor={purposeColor}
                highlighted={highlighted}
                back
                hidden={!flipped}
                flows={flows}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="payment-card-actions">
        {card.isActive ? (
          <>
            <Button icon={Pencil} onClick={onEdit}>
              수정
            </Button>
            <Button icon={Ban} onClick={onClose}>
              해지
            </Button>
          </>
        ) : (
          <Button icon={RotateCcw} onClick={onRestore}>
            복구
          </Button>
        )}
        <Button
          className="payment-flip-button"
          icon={FlipHorizontal2}
          onClick={flip}
          title={flipped ? '앞면 보기' : '뒷면 보기'}
          aria-label={`${card.name} ${flipped ? '앞면 보기' : '뒷면 보기'}`}
          aria-pressed={flipped}
        />
      </div>
    </article>
  )
}
