import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import { Scan } from 'lucide-react'
import type { Account, Card, Flow, Purpose } from '@shared/ipc'
import type { PageProps } from '../App'
import { Button, EmptyState, Switch } from '../components/Ui'

type Kind = 'purpose' | 'account' | 'card' | 'income' | 'payment'
type Shape = 'large-circle' | 'small-circle' | 'rounded-rectangle' | 'diamond' | 'triangle'
const NODE_TYPES: { kind: string; label: string; shape: Shape }[] = [
  { kind: 'purpose', label: '용도', shape: 'large-circle' },
  { kind: 'account', label: '계좌', shape: 'small-circle' },
  { kind: 'card', label: '카드', shape: 'rounded-rectangle' },
  { kind: 'income', label: '수입', shape: 'diamond' },
  { kind: 'payment', label: '정기 결제', shape: 'triangle' }
]
const LINK_TYPES = [
  { kind: 'account-purpose', from: 'account', to: 'purpose' },
  { kind: 'card-account', from: 'card', to: 'account' },
  { kind: 'income-account', from: 'income', to: 'account' },
  { kind: 'account-transfer', from: 'account', to: 'account' },
  { kind: 'account-payment', from: 'account', to: 'payment' },
  { kind: 'payment-card', from: 'payment', to: 'card' }
] as const

interface GraphNode extends SimulationNodeDatum {
  id: string
  kind: Kind
  recordId: number
  name: string
  color: string
  inactive: boolean
}
interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
  kind: (typeof LINK_TYPES)[number]['kind']
  reverse?: boolean
}
type View = { scale: number; x: number; y: number }
let nextLayoutSeed = 1
const radius = (node: GraphNode): number =>
  node.kind === 'purpose' ? 28 : node.kind === 'account' ? 20 : node.kind === 'card' ? 29 : 17
const spaceRadius = (node: GraphNode): number =>
  node.kind === 'income' || node.kind === 'payment' ? 34 : 42
const labelLines = (name: string): string[] => name.match(/.{1,10}/gu) ?? []

function makeGraph(
  purposes: Purpose[],
  accounts: Account[],
  cards: Card[],
  flows: Flow[],
  showInactive: boolean
): { nodes: GraphNode[]; links: GraphLink[] } {
  const visibleAccounts = accounts.filter((account) => showInactive || account.isActive)
  const visibleCards = cards.filter((card) => showInactive || card.isActive)
  const accountIds = new Set(visibleAccounts.map((account) => account.id))
  const cardIds = new Set(visibleCards.map((card) => card.id))
  const visibleFlows = flows.filter(
    (flow) =>
      flow.status !== 'ended' &&
      (flow.fromAccountId === null || accountIds.has(flow.fromAccountId)) &&
      (flow.toAccountId === null || accountIds.has(flow.toAccountId))
  )
  const nodes: GraphNode[] = [
    ...purposes.map((purpose) => ({
      id: `p-${purpose.id}`,
      kind: 'purpose' as Kind,
      recordId: purpose.id,
      name: purpose.name,
      color: purpose.color,
      inactive: false
    })),
    ...visibleAccounts.map((account) => ({
      id: `a-${account.id}`,
      kind: 'account' as Kind,
      recordId: account.id,
      name: account.name,
      color:
        purposes.find((purpose) => purpose.id === account.purposeId)?.color ??
        'var(--graph-neutral)',
      inactive: !account.isActive
    })),
    ...visibleCards.map((card) => ({
      id: `c-${card.id}`,
      kind: 'card' as Kind,
      recordId: card.id,
      name: card.name,
      color: 'var(--graph-neutral)',
      inactive: !card.isActive
    })),
    ...visibleFlows
      .filter((flow) => flow.kind === 'income' || flow.kind === 'payment')
      .map((flow) => ({
        id: `f-${flow.id}`,
        kind: flow.kind as 'income' | 'payment',
        recordId: flow.id,
        name: flow.name,
        color: flow.kind === 'income' ? 'var(--focus)' : 'var(--amber)',
        inactive: false
      }))
  ]
  const links: GraphLink[] = []
  for (const kind of LINK_TYPES) {
    if (kind.kind === 'account-purpose')
      for (const account of visibleAccounts) {
        if (
          account.purposeId !== null &&
          purposes.some((purpose) => purpose.id === account.purposeId)
        )
          links.push({
            source: `a-${account.id}`,
            target: `p-${account.purposeId}`,
            kind: kind.kind
          })
      }
    if (kind.kind === 'card-account')
      for (const card of visibleCards) {
        if (
          card.accountId !== null &&
          visibleAccounts.some((account) => account.id === card.accountId)
        )
          links.push({ source: `c-${card.id}`, target: `a-${card.accountId}`, kind: kind.kind })
      }
  }
  const transfers = new Map<string, GraphLink>()
  for (const flow of visibleFlows) {
    if (flow.kind === 'income' && flow.toAccountId !== null)
      links.push({
        source: `f-${flow.id}`,
        target: `a-${flow.toAccountId}`,
        kind: 'income-account'
      })
    if (flow.kind === 'payment' && flow.fromAccountId !== null) {
      links.push({
        source: `a-${flow.fromAccountId}`,
        target: `f-${flow.id}`,
        kind: 'account-payment'
      })
      if (flow.cardId !== null && cardIds.has(flow.cardId))
        links.push({ source: `f-${flow.id}`, target: `c-${flow.cardId}`, kind: 'payment-card' })
    }
    if (flow.kind === 'transfer' && flow.fromAccountId !== null && flow.toAccountId !== null) {
      const low = Math.min(flow.fromAccountId, flow.toAccountId)
      const high = Math.max(flow.fromAccountId, flow.toAccountId)
      const key = `${low}:${high}`
      const existing = transfers.get(key)
      if (existing) {
        if (existing.source === `a-${flow.toAccountId}`) existing.reverse = true
      } else
        transfers.set(key, {
          source: `a-${flow.fromAccountId}`,
          target: `a-${flow.toAccountId}`,
          kind: 'account-transfer'
        })
    }
  }
  links.push(...transfers.values())
  return { nodes, links }
}

export default function GraphPage({ navigate }: PageProps): React.JSX.Element {
  const [purposes, setPurposes] = useState<Purpose[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 800, height: 500 })
  const [positions, setPositions] = useState<GraphNode[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const region = useRef<HTMLDivElement>(null)
  const simulation = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  const model = useRef<GraphNode[]>([])
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null)
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.listPurposes(),
      window.api.listAccounts(true),
      window.api.listCards(true),
      window.api.listFlows()
    ])
      .then(([p, a, c, f]) => {
        if (p.ok && a.ok && c.ok && f.ok) {
          setPurposes(p.data)
          setAccounts(a.data)
          setCards(c.data)
          setFlows(f.data)
        } else setError('그래프 데이터를 읽지 못했습니다.')
      })
      .catch(() => setError('그래프 데이터를 읽지 못했습니다.'))
  }, [])
  useEffect(() => {
    if (!region.current) return
    const element = region.current
    const measure = (width: number, height: number): void =>
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }))
    measure(element.clientWidth, element.clientHeight)
    const observer = new ResizeObserver(() => measure(element.clientWidth, element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [purposes, accounts, cards, flows, showInactive])

  const graph = useMemo(
    () => makeGraph(purposes, accounts, cards, flows, showInactive),
    [purposes, accounts, cards, flows, showInactive]
  )
  const fit = useCallback(
    (nodes: GraphNode[]): void => {
      if (!nodes.length) return
      const left = Math.min(...nodes.map((node) => (node.x ?? 0) - radius(node))) - 12
      const right = Math.max(...nodes.map((node) => (node.x ?? 0) + radius(node))) + 12
      const top = Math.min(...nodes.map((node) => (node.y ?? 0) - radius(node))) - 12
      const bottom = Math.max(...nodes.map((node) => (node.y ?? 0) + radius(node))) + 12
      const scale = Math.min(
        1,
        (size.width - 32) / (right - left),
        (size.height - 100) / (bottom - top)
      )
      setView({
        scale,
        x: size.width / 2 - ((left + right) / 2) * scale,
        y: 60 + (size.height - 84) / 2 - ((top + bottom) / 2) * scale
      })
    },
    [size.width, size.height]
  )
  useEffect(() => {
    simulation.current?.stop()
    if (
      region.current &&
      (size.width !== region.current.clientWidth || size.height !== region.current.clientHeight)
    )
      return
    if (!graph.nodes.length || size.width < 100 || size.height < 100) {
      model.current = []
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) setPositions([])
      })
      return () => {
        cancelled = true
      }
    }
    let seed = nextLayoutSeed++
    const random = (): number => {
      seed = (1664525 * seed + 1013904223) >>> 0
      return seed / 4294967296
    }
    const nodes = graph.nodes.map((node, index) => ({
      ...node,
      x:
        size.width / 2 +
        Math.cos(index * 2.399963) * Math.sqrt(index + 1) * 24 +
        (random() - 0.5) * 20,
      y:
        size.height / 2 +
        Math.sin(index * 2.399963) * Math.sqrt(index + 1) * 24 +
        (random() - 0.5) * 20
    }))
    const links = graph.links.map((link) => ({ ...link }))
    const boundary = (): void => {
      for (const node of nodes) {
        const r = spaceRadius(node) + 8
        node.x = Math.max(r, Math.min(size.width - r, node.x ?? r))
        node.y = Math.max(r + 60, Math.min(size.height - r - 24, node.y ?? r + 60))
      }
    }
    const sim = forceSimulation<GraphNode>(nodes)
      .randomSource(random)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((node) => node.id)
          .distance((link) =>
            link.kind === 'card-account' ? 76 : link.kind === 'account-purpose' ? 92 : 64
          )
          .strength(0.9)
      )
      .force('charge', forceManyBody<GraphNode>().strength(-220))
      .force('collide', forceCollide<GraphNode>((node) => spaceRadius(node) + 5).iterations(4))
      .force('x', forceX<GraphNode>(size.width / 2).strength(0.035))
      .force('y', forceY<GraphNode>(size.height / 2).strength(0.035))
      .force('boundary', boundary)
      .alphaDecay(0.04)
      .velocityDecay(0.4)
      .stop()
    for (let step = 0; step < 260; step++) sim.tick()
    boundary()
    model.current = nodes
    simulation.current = sim
    // 배치가 바뀌면 이전 갱신을 취소한다. 가려진 창에서도 첫 배치를 반영한다.
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setPositions([...nodes])
      fit(nodes)
    })
    sim.on('tick', () => {
      boundary()
      setPositions([...nodes])
    })
    return () => {
      cancelled = true
      sim.stop()
    }
  }, [graph, size.width, size.height, fit])

  const links = graph.links.map((link) => ({
    ...link,
    source: String(link.source),
    target: String(link.target)
  }))
  const byId = new Map(positions.map((node) => [node.id, node]))
  const connected = new Set<string>(hovered ? [hovered] : [])
  if (hovered)
    for (const link of links) {
      if (link.source === hovered) connected.add(link.target)
      if (link.target === hovered) connected.add(link.source)
    }
  const toModel = (event: React.PointerEvent): { x: number; y: number } => {
    const rect = region.current!.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale
    }
  }
  const nodeDown = (event: React.PointerEvent<SVGGElement>, node: GraphNode): void => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: node.id, startX: event.clientX, startY: event.clientY, moved: false }
    node.fx = node.x
    node.fy = node.y
    simulation.current?.alpha(0.5).alphaTarget(0.25).restart()
  }
  const nodeMove = (event: React.PointerEvent<SVGGElement>, node: GraphNode): void => {
    if (drag.current?.id !== node.id) return
    const point = toModel(event)
    node.fx = point.x
    node.fy = point.y
    node.x = point.x
    node.y = point.y
    drag.current.moved ||=
      Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 4
    setPositions([...model.current])
  }
  const nodeUp = (event: React.PointerEvent<SVGGElement>, node: GraphNode): void => {
    if (drag.current?.id !== node.id) return
    const clicked = !drag.current.moved
    node.fx = null
    node.fy = null
    drag.current = null
    simulation.current?.alphaTarget(0)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (clicked)
      navigate(
        node.kind === 'purpose'
          ? 'purposes'
          : node.kind === 'account'
            ? 'accounts'
            : node.kind === 'card'
              ? 'cards'
              : 'flows',
        {
          kind: node.kind === 'income' || node.kind === 'payment' ? 'flow' : node.kind,
          id: node.recordId,
          inactive: node.inactive
        }
      )
  }
  return (
    <>
      <header className="page-head graph-head">
        <div>
          <h1>그래프</h1>
          <p>용도와 계좌, 카드, 흐름의 연결을 봅니다.</p>
        </div>
        <div className="page-actions">
          <Switch label="해지 항목 보기" checked={showInactive} onChange={setShowInactive} />
          <Button icon={Scan} onClick={() => fit(model.current)}>
            화면에 맞추기
          </Button>
        </div>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {graph.nodes.length === 0 ? (
        <EmptyState
          kind="graph"
          title="표시할 항목이 없습니다"
          description="용도, 계좌 또는 카드를 추가해 보세요."
        />
      ) : (
        <div
          className="graph-region panel"
          ref={region}
          onWheel={(event) => {
            const rect = region.current!.getBoundingClientRect()
            const x = event.clientX - rect.left,
              y = event.clientY - rect.top
            const scale = Math.max(
              0.3,
              Math.min(3, view.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15))
            )
            setView({
              scale,
              x: x - ((x - view.x) * scale) / view.scale,
              y: y - ((y - view.y) * scale) / view.scale
            })
          }}
        >
          <svg
            className="graph-svg"
            width="100%"
            height="100%"
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return
              event.currentTarget.setPointerCapture(event.pointerId)
              pan.current = { x: event.clientX, y: event.clientY, tx: view.x, ty: view.y }
            }}
            onPointerMove={(event) => {
              const current = pan.current
              const x = event.clientX
              const y = event.clientY
              if (current)
                setView((old) => ({
                  ...old,
                  x: current.tx + x - current.x,
                  y: current.ty + y - current.y
                }))
            }}
            onPointerUp={(event) => {
              pan.current = null
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId)
            }}
          >
            <defs>
              <marker
                id="graph-arrow-focus"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="var(--focus)" />
              </marker>
              <marker
                id="graph-arrow-amber"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="var(--amber)" />
              </marker>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
              {links.map((link, index) => {
                const a = byId.get(link.source),
                  b = byId.get(link.target)
                if (!a || !b) return null
                const dx = (b.x ?? 0) - (a.x ?? 0),
                  dy = (b.y ?? 0) - (a.y ?? 0)
                const distance = Math.hypot(dx, dy) || 1
                const ux = dx / distance,
                  uy = dy / distance
                const directed = ['income-account', 'account-transfer', 'account-payment'].includes(
                  link.kind
                )
                return (
                  <line
                    key={index}
                    className="graph-link"
                    data-kind={link.kind}
                    data-source={link.source}
                    data-target={link.target}
                    markerEnd={
                      directed
                        ? `url(#graph-arrow-${link.kind === 'account-payment' ? 'amber' : 'focus'})`
                        : undefined
                    }
                    markerStart={link.reverse ? 'url(#graph-arrow-focus)' : undefined}
                    style={{
                      stroke:
                        link.kind === 'account-payment'
                          ? 'var(--amber)'
                          : ['income-account', 'account-transfer'].includes(link.kind)
                            ? 'var(--focus)'
                            : 'var(--muted)'
                    }}
                    x1={(a.x ?? 0) + ux * (radius(a) + (link.reverse ? 6 : 0))}
                    y1={(a.y ?? 0) + uy * (radius(a) + (link.reverse ? 6 : 0))}
                    x2={(b.x ?? 0) - ux * (radius(b) + (directed ? 6 : 0))}
                    y2={(b.y ?? 0) - uy * (radius(b) + (directed ? 6 : 0))}
                    opacity={
                      hovered && link.source !== hovered && link.target !== hovered ? 0.22 : 1
                    }
                  />
                )
              })}
              {positions.map((node) => {
                const shape = NODE_TYPES.find((type) => type.kind === node.kind)!.shape
                return (
                  <g
                    key={node.id}
                    className={`graph-node ${node.inactive ? 'inactive' : ''}`}
                    transform={`translate(${node.x},${node.y})`}
                    opacity={hovered && !connected.has(node.id) ? 0.22 : node.inactive ? 0.58 : 1}
                    onPointerEnter={() => setHovered(node.id)}
                    onPointerLeave={() => setHovered(null)}
                    onPointerDown={(event) => nodeDown(event, node)}
                    onPointerMove={(event) => nodeMove(event, node)}
                    onPointerUp={(event) => nodeUp(event, node)}
                  >
                    {shape === 'rounded-rectangle' ? (
                      <rect x={-24} y={-16} width={48} height={32} rx={6} fill={node.color} />
                    ) : shape === 'diamond' ? (
                      <path d="M0,-17 L17,0 L0,17 L-17,0 Z" fill={node.color} />
                    ) : shape === 'triangle' ? (
                      <path d="M0,-18 L18,15 L-18,15 Z" fill={node.color} />
                    ) : (
                      <circle r={shape === 'large-circle' ? 28 : 20} fill={node.color} />
                    )}
                    <text className="graph-label" y={radius(node) + 18} textAnchor="middle">
                      {labelLines(node.name).map((line, index) => (
                        <tspan key={index} x={0} dy={index === 0 ? 0 : 14}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                    {node.inactive && (
                      <text className="graph-inactive" y={4} textAnchor="middle">
                        해지
                      </text>
                    )}
                    <title>{node.name}</title>
                  </g>
                )
              })}
            </g>
          </svg>
          <div className="graph-legend">
            {NODE_TYPES.map((type) => (
              <span key={type.kind}>
                <i className={`legend-shape ${type.shape}`} />
                {type.label}
              </span>
            ))}
            <span>
              <i className="legend-line focus" />
              수입·이체
            </span>
            <span>
              <i className="legend-line amber" />
              정기 결제
            </span>
          </div>
        </div>
      )}
    </>
  )
}
