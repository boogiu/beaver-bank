import { useEffect, useMemo, useRef, useState } from 'react'
import type { Account, Card, Flow, Purpose } from '@shared/ipc'
import { getReducedMotion } from '../hooks/useReducedMotion'
import { money } from './domain-ui'
import mascot from '../assets/illustrations/M1-C-mascot-a2.png'

// 물길 보기: 돈이 왼쪽 샘(수입)에서 솟아 연못(계좌)에 고이고, 비버의 댐(용도)에 갇히거나
// 하류(정기 결제)로 빠져나가는 모습. 배치는 정해진 네 줄이라 끌거나 확대하지 않는다.
export type RiverTarget = {
  kind: 'purpose' | 'account' | 'card' | 'flow'
  id: number
  inactive: boolean
}
interface Pond {
  id: string
  account: Account
  x: number
  y: number
  rx: number
  ry: number
}
interface Reservoir {
  key: string
  purpose: Purpose | null
  top: number
  bottom: number
}
interface Marker {
  id: string
  flow: Flow
  x: number
  y: number
}
interface Stream {
  key: string
  from: string
  to: string
  kind: 'income' | 'transfer' | 'payment'
  path: string
  width: number
}

const ROW = 88
const HEAD = 24
const GAP = 22
const TOP = 104

// 한 달 기준 금액(해마다 한 번인 흐름은 12로 나눈다). 물줄기의 굵기에만 쓴다.
const monthly = (flow: Flow): number => (flow.cycle === 'yearly' ? flow.amount / 12 : flow.amount)

// 바라는 높이 순으로 놓되 서로 겹치지 않게 간격을 벌린다.
function settle<T extends { y: number }>(items: T[], spacing: number, top: number): void {
  items.sort((a, b) => a.y - b.y)
  let previous = top - spacing
  for (const item of items) {
    item.y = Math.max(item.y, previous + spacing)
    previous = item.y
  }
}
const curve = (x1: number, y1: number, x2: number, y2: number): string => {
  const middle = (x1 + x2) / 2
  return `M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}`
}

export default function RiverGraph({
  purposes,
  accounts,
  cards,
  flows,
  balances,
  showInactive,
  onOpen
}: {
  purposes: Purpose[]
  accounts: Account[]
  cards: Card[]
  flows: Flow[]
  balances: Map<number, number | null>
  showInactive: boolean
  onOpen: (target: RiverTarget) => void
}): React.JSX.Element {
  const [reduced] = useState(getReducedMotion)
  const [hovered, setHovered] = useState<string | null>(null)
  // 그리는 폭을 칸의 실제 폭에 맞춰 글자가 줄어들지 않게 한다. 길면 아래로 스크롤한다.
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = (): void => setWidth(Math.max(620, Math.floor(element.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const pondX = width * 0.4
  const damX = pondX + Math.max(120, Math.min(190, width * 0.17))
  const outX = damX + Math.max(100, Math.min(170, width * 0.14))
  const springX = width * 0.09
  const scene = useMemo(() => {
    const cols = { spring: springX, pond: pondX, dam: damX, out: outX }
    const visible = accounts.filter((account) => showInactive || account.isActive)
    const ids = new Set(visible.map((account) => account.id))
    const live = flows.filter(
      (flow) =>
        flow.status !== 'ended' &&
        (flow.fromAccountId === null || ids.has(flow.fromAccountId)) &&
        (flow.toAccountId === null || ids.has(flow.toAccountId))
    )
    const largest = Math.max(1, ...visible.map((account) => balances.get(account.id) ?? 0))
    const groups: { purpose: Purpose | null; accounts: Account[] }[] = purposes.map((purpose) => ({
      purpose,
      accounts: visible.filter((account) => account.purposeId === purpose.id)
    }))
    const loose = visible.filter(
      (account) => !purposes.some((purpose) => purpose.id === account.purposeId)
    )
    if (loose.length) groups.push({ purpose: null, accounts: loose })

    const ponds: Pond[] = []
    const reservoirs: Reservoir[] = []
    let cursor = TOP
    for (const group of groups) {
      const top = cursor
      cursor += HEAD
      group.accounts.forEach((account, index) => {
        const ry = 11 + 12 * Math.sqrt(Math.max(0, balances.get(account.id) ?? 0) / largest)
        ponds.push({
          id: `a-${account.id}`,
          account,
          x: cols.pond,
          y: cursor + ROW * (index + 0.5),
          rx: ry * 1.4,
          ry
        })
      })
      cursor += Math.max(group.accounts.length * ROW, 22)
      reservoirs.push({
        key: group.purpose ? `p-${group.purpose.id}` : 'none',
        purpose: group.purpose,
        top,
        bottom: cursor
      })
      cursor += GAP
    }
    const pond = new Map(ponds.map((item) => [item.account.id, item]))

    const springs: Marker[] = live
      .filter((flow) => flow.kind === 'income' && flow.toAccountId !== null)
      .map((flow) => ({
        id: `f-${flow.id}`,
        flow,
        x: cols.spring,
        y: pond.get(flow.toAccountId!)!.y
      }))
    settle(springs, 64, TOP + 20)
    const outflows: Marker[] = []
    for (const item of ponds) {
      const own = live.filter(
        (flow) => flow.kind === 'payment' && flow.fromAccountId === item.account.id
      )
      own.forEach((flow, index) =>
        outflows.push({
          id: `f-${flow.id}`,
          flow,
          x: cols.out,
          y: item.y + (index - (own.length - 1) / 2) * 30
        })
      )
    }
    settle(outflows, 28, TOP + 10)

    const moving = live.filter(
      (flow) =>
        flow.kind !== 'transfer' || (flow.fromAccountId !== null && flow.toAccountId !== null)
    )
    const peak = Math.max(1, ...moving.map(monthly))
    const width = (flow: Flow): number => 2 + 11 * Math.sqrt(monthly(flow) / peak)
    const streams: Stream[] = []
    for (const spring of springs) {
      const target = pond.get(spring.flow.toAccountId!)!
      streams.push({
        key: spring.id,
        from: spring.id,
        to: target.id,
        kind: 'income',
        path: curve(spring.x + 12, spring.y, target.x - target.rx, target.y),
        width: width(spring.flow)
      })
    }
    for (const outflow of outflows) {
      const source = pond.get(outflow.flow.fromAccountId!)!
      streams.push({
        key: outflow.id,
        from: source.id,
        to: outflow.id,
        kind: 'payment',
        path: curve(source.x + source.rx, source.y, outflow.x - 8, outflow.y),
        width: width(outflow.flow)
      })
    }
    // 계좌 사이의 이체는 연못 왼쪽으로 돌아 흐른다. 겹치지 않게 차례로 더 멀리 돈다.
    live
      .filter(
        (flow) =>
          flow.kind === 'transfer' && flow.fromAccountId !== null && flow.toAccountId !== null
      )
      // 가까운 연못끼리 잇는 물줄기일수록 안쪽 길을 쓰게 해서, 서로 감싸되 엇갈리지 않게 한다.
      .map((flow) => ({
        flow,
        source: pond.get(flow.fromAccountId!)!,
        target: pond.get(flow.toAccountId!)!
      }))
      .sort((a, b) => Math.abs(a.source.y - a.target.y) - Math.abs(b.source.y - b.target.y))
      .forEach(({ flow, source, target }, index) => {
        // 저수지 칸의 왼쪽 바깥(샘과 저수지 사이)을 곁물길로 삼는다.
        const lanes = Math.max(1, Math.floor((cols.pond - 78 - 34 - cols.spring - 40) / 13))
        const bend = cols.pond - 78 - 34 - (index % lanes) * 13
        streams.push({
          key: `t-${flow.id}`,
          from: source.id,
          to: target.id,
          kind: 'transfer',
          path: `M${source.x - source.rx},${source.y} C${bend},${source.y} ${bend},${target.y} ${target.x - target.rx},${target.y}`,
          width: width(flow)
        })
      })
    const tags = cards
      .filter(
        (card) =>
          (showInactive || card.isActive) && card.accountId !== null && pond.has(card.accountId)
      )
      .map((card) => ({ card, pond: pond.get(card.accountId!)! }))
    const height =
      Math.max(
        cursor,
        ...springs.map((item) => item.y + 56),
        ...outflows.map((item) => item.y + 24)
      ) + 8
    return { ponds, reservoirs, springs, outflows, streams, tags, height }
  }, [purposes, accounts, cards, flows, balances, showInactive, springX, pondX, damX, outX])
  const cols = { spring: springX, pond: pondX, dam: damX, out: outX }

  const linked = new Set<string>(hovered ? [hovered] : [])
  if (hovered)
    for (const stream of scene.streams) {
      if (stream.from === hovered) linked.add(stream.to)
      if (stream.to === hovered) linked.add(stream.from)
    }
  const faded = (id: string): boolean => hovered !== null && !linked.has(id)
  const hover = (id: string): { onPointerEnter: () => void; onPointerLeave: () => void } => ({
    onPointerEnter: () => setHovered(id),
    onPointerLeave: () => setHovered(null)
  })
  return (
    <div className="river-frame" ref={frame}>
      <svg
        className="river-svg"
        viewBox={`0 0 ${width} ${scene.height}`}
        width={width}
        height={scene.height}
        role="img"
        aria-label="물길 보기. 수입이 계좌로 들어와 용도별 댐에 고이고 정기 결제로 빠져나가는 흐름입니다."
      >
        {scene.reservoirs.map((item) => (
          <g key={item.key}>
            <rect
              className={`river-reservoir ${item.purpose ? '' : 'loose'}`}
              x={cols.pond - 78}
              y={item.top}
              width={cols.dam - cols.pond + 78}
              height={item.bottom - item.top}
              rx={14}
            />
            <g
              className="river-node"
              style={{ cursor: item.purpose ? 'pointer' : 'default' }}
              onClick={() =>
                item.purpose && onOpen({ kind: 'purpose', id: item.purpose.id, inactive: false })
              }
            >
              {item.purpose && (
                <circle cx={cols.pond - 62} cy={item.top + 14} r={4} fill={item.purpose.color} />
              )}
              <text
                className="river-title"
                x={cols.pond - (item.purpose ? 52 : 66)}
                y={item.top + 18}
              >
                {item.purpose ? item.purpose.name : '용도 없음'}
              </text>
            </g>
            {item.purpose &&
              Array.from({
                length: Math.max(2, Math.floor((item.bottom - item.top - 6) / 11))
              }).map((_, index) => (
                <g key={index} className="river-log">
                  <circle
                    cx={cols.dam + (index % 2 ? 4 : -4)}
                    cy={item.top + 9 + index * 11}
                    r={7}
                  />
                  <circle
                    className="river-log-ring"
                    cx={cols.dam + (index % 2 ? 4 : -4)}
                    cy={item.top + 9 + index * 11}
                    r={3.2}
                  />
                </g>
              ))}
          </g>
        ))}
        {scene.streams.map((stream) => {
          const lit = hovered !== null && (stream.from === hovered || stream.to === hovered)
          return (
            <g
              key={stream.key}
              className={`river-stream ${stream.kind}`}
              style={{ opacity: hovered === null ? 0.72 : lit ? 1 : 0.1 }}
            >
              <path d={stream.path} strokeWidth={stream.width} />
              {!reduced && (
                <path
                  className="river-current"
                  d={stream.path}
                  strokeWidth={Math.max(1, stream.width * 0.28)}
                />
              )}
            </g>
          )
        })}
        {scene.springs.map((item) => (
          <g
            key={item.id}
            className="river-node"
            style={{ opacity: faded(item.id) ? 0.25 : 1 }}
            onClick={() => onOpen({ kind: 'flow', id: item.flow.id, inactive: false })}
            {...hover(item.id)}
          >
            <circle className="river-spring-ring" cx={item.x} cy={item.y} r={13} />
            <circle className="river-spring" cx={item.x} cy={item.y} r={7} />
            <text
              className="graph-label river-label"
              x={item.x}
              y={item.y + 30}
              textAnchor="middle"
            >
              {item.flow.name}
              <tspan className="river-amount" x={item.x} dy={15}>
                {money(item.flow.amount)}
                {item.flow.cycle === 'yearly' && ' (연)'}
              </tspan>
            </text>
          </g>
        ))}
        {scene.ponds.map((item) => (
          <g
            key={item.id}
            className={`river-node ${item.account.isActive ? '' : 'inactive'}`}
            style={{ opacity: faded(item.id) ? 0.25 : item.account.isActive ? 1 : 0.55 }}
            onClick={() =>
              onOpen({ kind: 'account', id: item.account.id, inactive: !item.account.isActive })
            }
            {...hover(item.id)}
          >
            <ellipse className="river-pond" cx={item.x} cy={item.y} rx={item.rx} ry={item.ry} />
            <path
              className="river-ripple"
              d={`M${item.x - item.rx * 0.5},${item.y - item.ry * 0.25} q${item.rx * 0.25},-4 ${item.rx * 0.5},0`}
            />
            <text
              className="graph-label river-label"
              x={item.x}
              y={item.y + item.ry + 16}
              textAnchor="middle"
            >
              {item.account.name}
              {!item.account.isActive && ' (해지)'}
              {typeof balances.get(item.account.id) === 'number' && (
                <tspan className="river-amount" x={item.x} dy={15}>
                  {money(balances.get(item.account.id)!)}
                </tspan>
              )}
            </text>
          </g>
        ))}
        {scene.tags.map(({ card, pond }, index) => {
          const order = scene.tags.slice(0, index).filter((tag) => tag.pond === pond).length
          return (
            <g
              key={card.id}
              className="river-node"
              style={{ opacity: faded(pond.id) ? 0.25 : card.isActive ? 1 : 0.55 }}
              onClick={() => onOpen({ kind: 'card', id: card.id, inactive: !card.isActive })}
              {...hover(pond.id)}
            >
              <rect
                className="river-card"
                x={pond.x + pond.rx * 0.45 + order * 18}
                y={pond.y - pond.ry - 9}
                width={15}
                height={10}
                rx={2}
              />
              {hovered === pond.id && (
                <text
                  className="graph-label river-label river-card-name"
                  x={pond.x + pond.rx * 0.45 + order * 18 + 20}
                  y={pond.y - pond.ry}
                >
                  {card.name}
                </text>
              )}
              <title>{card.name}</title>
            </g>
          )
        })}
        {scene.outflows.map((item) => (
          <g
            key={item.id}
            className="river-node"
            style={{ opacity: faded(item.id) ? 0.25 : 1 }}
            onClick={() => onOpen({ kind: 'flow', id: item.flow.id, inactive: false })}
            {...hover(item.id)}
          >
            <circle className="river-outflow" cx={item.x} cy={item.y} r={5} />
            <text className="graph-label river-label" x={item.x + 12} y={item.y + 4}>
              {item.flow.name}
              <tspan className="river-amount" dx={8}>
                {money(item.flow.amount)}
                {item.flow.cycle === 'yearly' && ' (연)'}
              </tspan>
            </text>
          </g>
        ))}
        {scene.reservoirs.find((item) => item.purpose) && (
          <image
            className="river-beaver"
            href={mascot}
            x={cols.dam - 21}
            y={scene.reservoirs.find((item) => item.purpose)!.top - 34}
            width={42}
            height={42}
            aria-hidden="true"
          />
        )}
      </svg>
      <div className="graph-legend river-legend">
        <span>
          <i className="river-key spring" />샘 · 수입
        </span>
        <span>
          <i className="river-key pond" />
          연못 · 계좌
        </span>
        <span>
          <i className="river-key dam" />댐 · 용도
        </span>
        <span>
          <i className="river-key outflow" />
          하류 · 정기 결제
        </span>
      </div>
    </div>
  )
}
