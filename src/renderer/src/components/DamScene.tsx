import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import mascot from '../assets/illustrations/M1-C-mascot-a2.png'
import { getReducedMotion, useReducedMotion } from '../hooks/useReducedMotion'

export function DamScene(): React.JSX.Element {
  const reduced = useReducedMotion()
  const [fontsReady, setFontsReady] = useState(false)
  const [building, setBuilding] = useState(() => !getReducedMotion())
  const [cycle, setCycle] = useState(0)
  const running = useRef(building)
  useEffect(() => {
    let active = true
    void document.fonts.ready.then(() => {
      if (active) setFontsReady(true)
    })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!fontsReady) return
    if (reduced) {
      running.current = false
      const timer = window.setTimeout(() => setBuilding(false), 0)
      return () => window.clearTimeout(timer)
    }
    if (!building) return
    running.current = true
    const timer = window.setTimeout(() => {
      running.current = false
      setBuilding(false)
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [building, cycle, fontsReady, reduced])
  const build = (): void => {
    if (running.current || getReducedMotion()) return
    running.current = true
    setCycle((value) => value + 1)
    setBuilding(true)
  }
  return fontsReady ? (
    <div className="dam-scene" aria-hidden="true" onMouseEnter={build}>
      <div className={building && !reduced ? 'dam-cycle dam-building' : 'dam-cycle'} key={cycle}>
        <div className="dam-water" />
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            className="dam-log"
            key={index}
            style={{
              left: index % 2 === 0 ? 60 : 64,
              bottom: index * 10,
              backgroundColor: index % 2 === 0 ? 'var(--brown)' : 'var(--brown-active)',
              '--log-delay': `${0.2 + index * 0.4}s`
            } as CSSProperties}
          />
        ))}
        <img className="dam-beaver" src={mascot} alt="" draggable={false} />
        <div className="dam-ground" />
      </div>
    </div>
  ) : <></>
}
