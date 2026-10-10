import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { flushSync } from 'react-dom'
import { getReducedMotion } from './useReducedMotion'

// Each mounted value starts once, at its own first intersection with the visible viewport.
export function useVisibleOnce<T extends HTMLElement>(): {
  ref: RefObject<T | null>
  startedAt: number | null
  reduced: boolean
} {
  const ref = useRef<T>(null)
  const [reduced] = useState(getReducedMotion)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || reduced) return
    let frame = 0
    let begun = false
    const begin = (time: number): void => {
      if (begun) return
      begun = true
      setStartedAt(time)
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
    const observer = new IntersectionObserver((entries) => {
      const intersection = entries.find(
        (entry) =>
          entry.isIntersecting &&
          entry.intersectionRect.width > 0 &&
          entry.intersectionRect.height > 0
      )
      if (!intersection) return
      // Viewport intersection starts the value effect, independently of entrance opacity.
      begin(intersection.time)
    })
    observer.observe(element)
    // Initial in-view values share the first presentation frame, before observer delivery.
    frame = requestAnimationFrame((time) => {
      const rect = element.getBoundingClientRect()
      const page = element.closest('main')?.getBoundingClientRect()
      if (
        Math.min(rect.right, page?.right ?? innerWidth, innerWidth) >
          Math.max(rect.left, page?.left ?? 0, 0) &&
        Math.min(rect.bottom, page?.bottom ?? innerHeight, innerHeight) >
          Math.max(rect.top, page?.top ?? 0, 0)
      ) {
        begin(time)
      }
    })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [reduced])
  return { ref, startedAt, reduced }
}

// The same ease-out curve as --motion-ease (cubic-bezier(0, 0, .58, 1)).
function easeOut(progress: number): number {
  let low = 0,
    high = 1
  for (let i = 0; i < 18; i++) {
    const t = (low + high) / 2
    const x = 3 * (1 - t) * t * t * 0.58 + t * t * t
    if (x < progress) low = t
    else high = t
  }
  const t = (low + high) / 2
  return 3 * (1 - t) * t * t + t * t * t
}

export function useVisibleValue<T extends HTMLElement>(
  target: number,
  integer = false
): {
  ref: RefObject<T | null>
  value: number
} {
  const { ref, startedAt, reduced } = useVisibleOnce<T>()
  const [sample, setSample] = useState<{ value: number; done: boolean }>({ value: 0, done: false })
  useEffect(() => {
    if (reduced || startedAt === null || target === 0) return
    const duration =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-value')) *
      1000
    let frame = 0
    let previousFrame: number | null = null
    let frameInterval = 1000 / 60
    const finish = (): void => {
      flushSync(() => setSample({ value: target, done: true }))
    }
    const draw = (time: number): void => {
      if (previousFrame !== null && time > previousFrame) {
        frameInterval = Math.min(time - previousFrame, 1000 / 30)
      }
      previousFrame = time
      const elapsed = performance.now() - startedAt
      // Reserve the exact final value for the next presentation frame at the deadline.
      if (elapsed >= duration || time + frameInterval - startedAt >= duration) {
        finish()
        return
      }
      const next = target * easeOut(Math.max(0, elapsed / duration))
      const value = integer ? Math.trunc(next) || 0 : next
      setSample({
        value: Math.max(Math.min(0, target), Math.min(Math.max(0, target), value)),
        done: false
      })
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    // Final values always come directly from the data channel, even when RAF is suspended.
    const timer = window.setTimeout(
      () => {
        cancelAnimationFrame(frame)
        finish()
      },
      Math.max(0, duration - (performance.now() - startedAt))
    )
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [integer, reduced, startedAt, target])
  return { ref, value: reduced || sample.done || target === 0 ? target : sample.value }
}
