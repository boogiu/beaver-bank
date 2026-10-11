import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import mascot from '../assets/illustrations/M1-C-mascot-a2.png'
import { getReducedMotion, useReducedMotion } from '../hooks/useReducedMotion'

// Quarter-wave cubic segments preserve the 22px wavelength and 0.75px amplitude.
function wavePath(depth: number, direction: number): string {
  const y = (x: number): number => depth + direction * 0.75 * Math.sin((x * Math.PI) / 11)
  const slope = (x: number): number =>
    direction * ((0.75 * Math.PI) / 11) * Math.cos((x * Math.PI) / 11)
  let path = `M-22,${depth}`
  for (let x = -22; x < 88; x += 5.5) {
    const end = x + 5.5
    path += ` C${x + 5.5 / 3},${y(x) + (slope(x) * 5.5) / 3} ${end - 5.5 / 3},${y(end) - (slope(end) * 5.5) / 3} ${end},${y(end)}`
  }
  return path
}
const frontWave = wavePath(4.5, -1)
const backWave = wavePath(1.5, 1)

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
      <div className={building && !reduced ? 'dam-cycle dam-building' : 'dam-cycle'}>
        <div className="dam-water">
          <svg className="dam-water-drawing" width="52" height="44" aria-hidden="true">
            <g className="dam-wave-back">
              <path d={`${backWave} L88,44 H-22 Z`} fill="#214C54" />
            </g>
            <g className="dam-wave-front">
              <path d={`${frontWave} L88,44 H-22 Z`} fill="#2F6D79" />
              <path d={frontWave} fill="none" stroke="#4FB6C9" strokeWidth="1.25" />
            </g>
            {[
              [17, 24, 15],
              [32, 37, 25],
              [21, 27, 36]
            ].map(([x1, x2, y], index) => (
              <line
                key={index}
                className="dam-shimmer"
                x1={x1}
                x2={x2}
                y1={y}
                y2={y}
                stroke="#9ED7E1"
                strokeWidth="1"
                strokeLinecap="round"
                style={{ animationDelay: `${(-index * 4) / 3}s` }}
              />
            ))}
          </svg>
        </div>
        {[0, 1, 2, 3, 4].map((index) => (
          <svg
            className="dam-log"
            width="48"
            height="10"
            viewBox="0 0 48 10"
            key={index}
            style={
              {
                left: index % 2 === 0 ? 60 : 64,
                bottom: index * 10,
                '--log-delay': `${0.2 + index * 0.4}s`
              } as CSSProperties
            }
          >
            <rect
              x="0.5"
              y="0.5"
              width="47"
              height="9"
              rx="4.5"
              fill={index % 2 === 0 ? '#835539' : '#6D462F'}
              stroke="#3B261A"
            />
            <line
              x1={index % 2 === 0 ? 10 : 8}
              x2={index % 2 === 0 ? 24 : 22}
              y1="3.4"
              y2="3.4"
              stroke={index % 2 === 0 ? '#946043' : '#835539'}
              strokeLinecap="round"
            />
            <line
              x1={index % 2 === 0 ? 26 : 20}
              x2={index % 2 === 0 ? 39 : 33}
              y1="6.8"
              y2="6.8"
              stroke={index % 2 === 0 ? '#6D462F' : '#553626'}
              strokeLinecap="round"
            />
            <ellipse
              cx={index % 2 === 0 ? 4.5 : 43.5}
              cy="5"
              rx="3"
              ry="3.5"
              fill="#D9AD70"
              stroke="#3B261A"
            />
            <ellipse
              cx={index % 2 === 0 ? 4.5 : 43.5}
              cy="5"
              rx="1.4"
              ry="1.8"
              fill="none"
              stroke="#835539"
              strokeWidth="0.8"
            />
          </svg>
        ))}
        <img className="dam-beaver" src={mascot} alt="" draggable={false} />
        <div className="dam-ground" />
      </div>
    </div>
  ) : (
    <></>
  )
}
