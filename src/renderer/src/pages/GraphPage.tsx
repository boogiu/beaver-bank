import { getReducedMotion } from '../hooks/useReducedMotion'
import { Entrance } from '../components/Entrance'
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
const starlight = (color: string): string =>
  '#' +
  color
    .slice(1)
    .match(/../g)!
    .map((channel) =>
      Math.ceil((parseInt(channel, 16) + 255) / 2)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
const radius = (node: GraphNode): number =>
  node.kind === 'purpose' ? 8 : node.kind === 'account' ? 6 : node.kind === 'card' ? 7 : 5
const halfHeight = (node: GraphNode): number =>
  node.kind === 'card' || node.kind === 'payment' ? 4.5 : radius(node)
const labelLines = (name: string): string[] => name.match(/.{1,10}/gu) ?? []
type Box = { left: number; right: number; top: number; bottom: number }
// Pretendard is loaded before layout. Use actual ink bounds rather than character counts.
const measureContext = document.createElement('canvas').getContext('2d')!
function nodeBox(node: GraphNode): Box {
  measureContext.font = '400 12px Pretendard'
  const lines = labelLines(node.name)
  const metrics = lines.map((line) => measureContext.measureText(line))
  const width = Math.max(32, ...metrics.map((m) => m.width))
  const ascent = Math.max(0, ...metrics.map((m) => m.actualBoundingBoxAscent))
  const descent = Math.max(0, ...metrics.map((m) => m.actualBoundingBoxDescent))
  return {
    left: -width / 2,
    right: width / 2,
    top: node.inactive ? -halfHeight(node) - 6 - ascent : -16,
    bottom: halfHeight(node) + 20 + (lines.length - 1) * 14 + descent
  }
}

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
      color: starlight(purpose.color),
      inactive: false
    })),
    ...visibleAccounts.map((account) => ({
      id: `a-${account.id}`,
      kind: 'account' as Kind,
      recordId: account.id,
      name: account.name,
      color: starlight(
        purposes.find((purpose) => purpose.id === account.purposeId)?.color ?? '#666666'
      ),
      inactive: !account.isActive
    })),
    ...visibleCards.map((card) => ({
      id: `c-${card.id}`,
      kind: 'card' as Kind,
      recordId: card.id,
      name: card.name,
      color: '#B3B3B3',
      inactive: !card.isActive
    })),
    ...visibleFlows
      .filter((flow) => flow.kind === 'income' || flow.kind === 'payment')
      .map((flow) => ({
        id: `f-${flow.id}`,
        kind: flow.kind as 'income' | 'payment',
        recordId: flow.id,
        name: flow.name,
        color: flow.kind === 'income' ? '#A7DBE4' : '#F0D49D',
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
  let entranceIndex = 0

  const [reduced] = useState(getReducedMotion)
  const firstLayout = useRef(true)
  const detached = useRef(new Set<string>())
  const [loaded, setLoaded] = useState(false)
  const [purposes, setPurposes] = useState<Purpose[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 800, height: 500 })
  const [positions, setPositions] = useState<GraphNode[]>([])
  const [classification, setClassification] = useState<Kind | 'all'>('all')
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
      .then(async ([p, a, c, f]) => {
        await document.fonts.ready
        if (p.ok && a.ok && c.ok && f.ok) {
          setPurposes(p.data)
          setAccounts(a.data)
          setCards(c.data)
          setFlows(f.data)
          setLoaded(true)
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
      const left = Math.min(...nodes.map((node) => (node.x ?? 0) + nodeBox(node).left)) - 8
      const right = Math.max(...nodes.map((node) => (node.x ?? 0) + nodeBox(node).right)) + 8
      const top = Math.min(...nodes.map((node) => (node.y ?? 0) + nodeBox(node).top)) - 8
      const bottom = Math.max(...nodes.map((node) => (node.y ?? 0) + nodeBox(node).bottom)) + 8
      const legendBottom =
        (region.current?.querySelector('.graph-legend') as HTMLElement | null)?.offsetHeight ?? 40
      const reserved = legendBottom + 28
      const scale = Math.min(
        1,
        (size.width - 16) / (right - left),
        (size.height - reserved - 8) / (bottom - top)
      )
      setView({
        scale,
        x: size.width / 2 - ((left + right) / 2) * scale,
        y: reserved + (size.height - reserved) / 2 - ((top + bottom) / 2) * scale
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
    const boxes = nodes.map(nodeBox)
    const reserved =
      ((region.current?.querySelector('.graph-legend') as HTMLElement | null)?.offsetHeight ?? 40) +
      28
    const boundary = (): void => {
      nodes.forEach((node, i) => {
        const box = boxes[i]
        node.x = Math.max(12 - box.left, Math.min(size.width - 12 - box.right, node.x ?? 0))
        node.y = Math.max(reserved - box.top, Math.min(size.height - 12 - box.bottom, node.y ?? 0))
      })
    }
    const sim = forceSimulation<GraphNode>(nodes)
      .randomSource(random)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((node) => node.id)
          .distance((link) =>
            Math.max(
              nodeBox(link.source as GraphNode).right - nodeBox(link.target as GraphNode).left + 12,
              64
            )
          )
          .strength(0.9)
      )
      .force('charge', forceManyBody<GraphNode>().strength(-220))
      .force(
        'collide',
        forceCollide<GraphNode>((node) => Math.max(20, nodeBox(node).right)).iterations(4)
      )
      .force('x', forceX<GraphNode>(size.width / 2).strength(0.035))
      .force('y', forceY<GraphNode>(size.height / 2).strength(0.035))
      .force('boundary', boundary)
      .alphaDecay(0.04)
      .velocityDecay(0.4)
      .stop()
    for (let step = 0; step < 260; step++) sim.tick()
    // Spread the settled force layout, then resolve full label/hit boxes within the viewport.
    const spread = (axis: 'x' | 'y', low: number, high: number): void => {
      const min = Math.min(...nodes.map((n) => n[axis]!)),
        max = Math.max(...nodes.map((n) => n[axis]!))
      for (const n of nodes) n[axis] = low + ((n[axis]! - min) / (max - min || 1)) * (high - low)
    }
    spread('x', size.width * 0.12, size.width * 0.88)
    spread('y', reserved + 24, size.height - 52)
    for (let step = 0; step < 600; step++) {
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j],
            ab = boxes[i],
            bb = boxes[j]
          const dx = b.x! - a.x!,
            dy = b.y! - a.y!
          const overlapX =
            Math.min(a.x! + ab.right, b.x! + bb.right) -
            Math.max(a.x! + ab.left, b.x! + bb.left) +
            4
          const overlapY =
            Math.min(a.y! + ab.bottom, b.y! + bb.bottom) -
            Math.max(a.y! + ab.top, b.y! + bb.top) +
            4
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              const push = (Math.sign(dx || 1) * overlapX) / 2
              a.x! -= push
              b.x! += push
            } else {
              const push = (Math.sign(dy || 1) * overlapY) / 2
              a.y! -= push
              b.y! += push
            }
          }
          const distance = Math.hypot(b.x! - a.x!, b.y! - a.y!)
          if (distance < 40) {
            const push = (40 - distance) / 2
            const ux = dx / (Math.hypot(dx, dy) || 1),
              uy = dy / (Math.hypot(dx, dy) || 1)
            a.x! -= ux * push
            b.x! += ux * push
            a.y! -= uy * push
            b.y! += uy * push
          }
        }
      boundary()
    }
    boundary()
    model.current = nodes
    simulation.current = sim
    const unfold = firstLayout.current && !reduced
    firstLayout.current = false
    detached.current.clear()
    const cx = (Math.min(...nodes.map((n) => n.x!)) + Math.max(...nodes.map((n) => n.x!))) / 2
    const cy = (Math.min(...nodes.map((n) => n.y!)) + Math.max(...nodes.map((n) => n.y!))) / 2
    let started = 0,
      frame = 0,
      timer = 0,
      cancelled = false
    const draw = (): void => {
      if (cancelled) return
      const progress = unfold ? Math.min(1, (performance.now() - started) / 1500) : 1
      const spread = 0.2 + 0.8 * (1 - (1 - progress) ** 2)
      setPositions(
        nodes.map((n) =>
          detached.current.has(n.id)
            ? { ...n }
            : {
                ...n,
                x: cx + (n.x! - cx) * spread,
                y: cy + (n.y! - cy) * spread
              }
        )
      )
      if (progress < 1) frame = requestAnimationFrame(draw)
    }
    queueMicrotask(() => {
      if (cancelled) return
      started = performance.now()
      fit(nodes)
      draw()
      if (unfold)
        timer = window.setTimeout(() => {
          cancelAnimationFrame(frame)
          if (!cancelled) setPositions(nodes.map((n) => ({ ...n })))
        }, 1500)
    })
    sim.on('tick', () => {
      boundary()
      // During a drag, the unfolding loop shares the same live model.
      if (!unfold || performance.now() - started >= 1500) setPositions(nodes.map((n) => ({ ...n })))
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      sim.stop()
    }
  }, [graph, size.width, size.height, fit, reduced])

  const links = graph.links.map((link) => ({
    ...link,
    source: String(link.source),
    target: String(link.target)
  }))
  const byId = new Map(positions.map((node) => [node.id, node]))
  const selected =
    classification === 'all' || graph.nodes.some((n) => n.kind === classification)
      ? classification
      : 'all'
  useEffect(() => {
    if (classification !== 'all' && !graph.nodes.some((n) => n.kind === classification)) {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) setClassification('all')
      })
      return () => {
        cancelled = true
      }
    }
    return undefined
  }, [classification, graph])
  const visibleNodes = new Set(
    graph.nodes.filter((n) => selected === 'all' || n.kind === selected).map((n) => n.id)
  )
  const visibleLinks = new Set(
    links
      .filter(
        (link) =>
          selected === 'all' ||
          (selected === 'account'
            ? link.kind === 'account-transfer'
            : visibleNodes.has(link.source) || visibleNodes.has(link.target))
      )
      .map((link) => `${link.source}:${link.target}:${link.kind}`)
  )
  for (const link of links)
    if (visibleLinks.has(`${link.source}:${link.target}:${link.kind}`)) {
      visibleNodes.add(link.source)
      visibleNodes.add(link.target)
    }
  const activeHovered = hovered && visibleNodes.has(hovered) ? hovered : null
  const connected = new Set<string>(activeHovered ? [activeHovered] : [])
  if (activeHovered)
    for (const link of links) {
      if (!visibleLinks.has(`${link.source}:${link.target}:${link.kind}`)) continue
      if (link.source === activeHovered) connected.add(link.target)
      if (link.target === activeHovered) connected.add(link.source)
    }
  const toModel = (event: React.PointerEvent): { x: number; y: number } => {
    const rect = region.current!.querySelector('.graph-svg')!.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale
    }
  }
  const nodeDown = (event: React.PointerEvent<SVGGElement>, node: GraphNode): void => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: node.id, startX: event.clientX, startY: event.clientY, moved: false }
    const target = model.current.find((n) => n.id === node.id)!
    detached.current.add(node.id)
    target.fx = target.x = node.x
    target.fy = target.y = node.y
    simulation.current?.alpha(0.5).alphaTarget(0.25).restart()
  }
  const nodeMove = (event: React.PointerEvent<SVGGElement>, node: GraphNode): void => {
    if (drag.current?.id !== node.id) return
    const point = toModel(event)
    const target = model.current.find((n) => n.id === node.id)!
    target.fx = target.x = point.x
    target.fy = target.y = point.y
    drag.current.moved ||=
      Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 4
    setPositions((old) => old.map((n) => (n.id === node.id ? { ...n, x: point.x, y: point.y } : n)))
  }
  const nodeUp = (event: React.PointerEvent<SVGGElement>, node: GraphNode): void => {
    if (drag.current?.id !== node.id) return
    const clicked = !drag.current.moved
    const target = model.current.find((n) => n.id === node.id)!
    target.fx = null
    target.fy = null
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
      <Entrance order={entranceIndex++}>
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
      </Entrance>
      {error && <p className="error-banner">{error}</p>}
      {loaded &&
        (graph.nodes.length === 0 ? (
          <Entrance order={entranceIndex++}>
            <EmptyState
              kind="graph"
              title="표시할 항목이 없습니다"
              description="용도, 계좌 또는 카드를 추가해 보세요."
            />
          </Entrance>
        ) : (
          <Entrance order={entranceIndex++}>
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
                  {!reduced &&
                    ['focus', 'amber'].map((kind) => (
                      <g key={kind}>
                        <linearGradient
                          id={`stream-gradient-${kind}`}
                          x1="0"
                          x2="32"
                          y1="0"
                          y2="0"
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop
                            offset="0"
                            stopColor={kind === 'focus' ? '#A7DBE4' : '#F0D49D'}
                            stopOpacity="0"
                          />
                          <stop
                            offset="0.75"
                            stopColor={kind === 'focus' ? '#A7DBE4' : '#F0D49D'}
                            stopOpacity="1"
                          />
                          <stop
                            offset="1"
                            stopColor={kind === 'focus' ? '#A7DBE4' : '#F0D49D'}
                            stopOpacity="0"
                          />
                        </linearGradient>
                        <pattern
                          id={`stream-pattern-${kind}`}
                          patternUnits="userSpaceOnUse"
                          width="64"
                          height="2"
                          y="-1"
                        >
                          <rect
                            x="0"
                            y="0"
                            width="32"
                            height="2"
                            fill={`url(#stream-gradient-${kind})`}
                          />
                          <animateTransform
                            attributeName="patternTransform"
                            type="translate"
                            from="0 0"
                            to="64 0"
                            dur="1.6s"
                            repeatCount="indefinite"
                          />
                        </pattern>
                      </g>
                    ))}
                  {graph.nodes
                    .filter((node) => node.kind === 'purpose')
                    .map((node) => (
                      <radialGradient key={node.id} id={`glow-${node.id}`}>
                        <stop offset="0%" stopColor={node.color} stopOpacity="0.4" />
                        <stop
                          offset={`${(8 / 14) * 100}%`}
                          stopColor={node.color}
                          stopOpacity="0.4"
                        />
                        <stop offset="100%" stopColor={node.color} stopOpacity="0" />
                      </radialGradient>
                    ))}
                  <marker
                    id="graph-arrow-focus"
                    markerWidth="5"
                    markerHeight="5"
                    refX="5"
                    refY="2.5"
                    orient="auto-start-reverse"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M0,0 L5,2.5 L0,5 Z" fill="#A7DBE4" />
                  </marker>
                  <marker
                    id="graph-arrow-amber"
                    markerWidth="5"
                    markerHeight="5"
                    refX="5"
                    refY="2.5"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M0,0 L5,2.5 L0,5 Z" fill="#F0D49D" />
                  </marker>
                </defs>
                <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
                  {links.map((link) => {
                    const a = byId.get(link.source),
                      b = byId.get(link.target)
                    if (!a || !b) return null
                    const dx = (b.x ?? 0) - (a.x ?? 0),
                      dy = (b.y ?? 0) - (a.y ?? 0)
                    const distance = Math.hypot(dx, dy) || 1
                    const ux = dx / distance,
                      uy = dy / distance
                    const directed = [
                      'income-account',
                      'account-transfer',
                      'account-payment'
                    ].includes(link.kind)
                    const visible = visibleLinks.has(`${link.source}:${link.target}:${link.kind}`)
                    const emphasized =
                      activeHovered &&
                      (link.source === activeHovered || link.target === activeHovered)
                    const short = distance <= radius(a) + radius(b) + 12
                    const lightLength = distance - radius(a) - radius(b)
                    const clipStart = link.reverse ? 11 : 0
                    const clipLength = lightLength - clipStart - 11
                    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
                    return (
                      <g key={`${link.source}:${link.target}:${link.kind}`}>
                        <line
                          className="graph-link"
                          data-kind={link.kind}
                          data-source={link.source}
                          data-target={link.target}
                          markerEnd={
                            directed && !short
                              ? `url(#graph-arrow-${link.kind === 'account-payment' ? 'amber' : 'focus'})`
                              : undefined
                          }
                          markerStart={
                            link.reverse && !short ? 'url(#graph-arrow-focus)' : undefined
                          }
                          style={{
                            opacity: !visibleLinks.has(`${link.source}:${link.target}:${link.kind}`)
                              ? 0
                              : activeHovered
                                ? link.source === activeHovered || link.target === activeHovered
                                  ? 1
                                  : 0.15
                                : 0.5,
                            stroke:
                              link.kind === 'account-payment'
                                ? '#F0D49D'
                                : ['income-account', 'account-transfer'].includes(link.kind)
                                  ? '#A7DBE4'
                                  : 'var(--muted)'
                          }}
                          x1={(a.x ?? 0) + ux * (radius(a) + (link.reverse ? 6 : 0))}
                          y1={(a.y ?? 0) + uy * (radius(a) + (link.reverse ? 6 : 0))}
                          x2={(b.x ?? 0) - ux * (radius(b) + (directed ? 6 : 0))}
                          y2={(b.y ?? 0) - uy * (radius(b) + (directed ? 6 : 0))}
                        />
                        {!reduced && directed && !short && clipLength > 0 && (
                          <g
                            className="graph-stream"
                            data-source={link.source}
                            data-target={link.target}
                            data-kind={link.kind}
                            style={{
                              opacity: !visible ? 0 : activeHovered && !emphasized ? 0.15 : 1
                            }}
                          >
                            <g
                              transform={`translate(${a.x! + ux * radius(a)},${a.y! + uy * radius(a)}) rotate(${angle})`}
                            >
                              <svg
                                x={clipStart}
                                y={(link.reverse ? 3 : 0) - 1}
                                width={clipLength}
                                height={2}
                                viewBox={`${clipStart} -1 ${clipLength} 2`}
                                overflow="hidden"
                              >
                                <rect
                                  x={clipStart}
                                  y={-1}
                                  width={clipLength}
                                  height={2}
                                  fill={`url(#stream-pattern-${link.kind === 'account-payment' ? 'amber' : 'focus'})`}
                                />
                              </svg>
                            </g>
                            {link.reverse && (
                              <g
                                transform={`translate(${b.x! - ux * radius(b)},${b.y! - uy * radius(b)}) rotate(${angle + 180})`}
                              >
                                <svg
                                  x={11}
                                  y={2}
                                  width={clipLength}
                                  height={2}
                                  viewBox={`11 -1 ${clipLength} 2`}
                                  overflow="hidden"
                                >
                                  <rect
                                    x={11}
                                    y={-1}
                                    width={clipLength}
                                    height={2}
                                    fill="url(#stream-pattern-focus)"
                                  />
                                </svg>
                              </g>
                            )}
                          </g>
                        )}
                      </g>
                    )
                  })}
                  {positions.map((node) => {
                    const shape = NODE_TYPES.find((type) => type.kind === node.kind)!.shape
                    return (
                      <g
                        key={node.id}
                        className={`graph-node ${node.inactive ? 'inactive' : ''}`}
                        transform={`translate(${node.x},${node.y})`}
                        style={{
                          opacity: !visibleNodes.has(node.id)
                            ? 0
                            : activeHovered && !connected.has(node.id)
                              ? 0.22
                              : node.inactive
                                ? 0.58
                                : 1,
                          pointerEvents: visibleNodes.has(node.id) ? undefined : 'none'
                        }}
                        onPointerEnter={() => setHovered(node.id)}
                        onPointerLeave={() => setHovered(null)}
                        onPointerDown={(event) => nodeDown(event, node)}
                        onPointerMove={(event) => nodeMove(event, node)}
                        onPointerUp={(event) => nodeUp(event, node)}
                      >
                        <circle className="graph-hit" r={16} fill="transparent" />
                        {node.kind === 'purpose' && (
                          <circle className="graph-glow" r={14} fill={`url(#glow-${node.id})`} />
                        )}
                        {shape === 'rounded-rectangle' ? (
                          <rect x={-7} y={-4.5} width={14} height={9} rx={2} fill={node.color} />
                        ) : shape === 'diamond' ? (
                          <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill={node.color} />
                        ) : shape === 'triangle' ? (
                          <path d="M0,-4.5 L5,4.5 L-5,4.5 Z" fill={node.color} />
                        ) : (
                          <circle r={shape === 'large-circle' ? 8 : 6} fill={node.color} />
                        )}
                        <text
                          className="graph-label"
                          y={halfHeight(node) + 20}
                          textAnchor="middle"
                          style={{
                            fill:
                              activeHovered && connected.has(node.id)
                                ? 'var(--text)'
                                : 'var(--muted)'
                          }}
                        >
                          {labelLines(node.name).map((line, index) => (
                            <tspan key={index} x={0} dy={index === 0 ? 0 : 14}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                        {node.inactive && (
                          <text
                            className="graph-inactive"
                            y={-halfHeight(node) - 6}
                            textAnchor="middle"
                          >
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
                <div className="graph-filters" role="group" aria-label="분류">
                  <Button
                    className="graph-filter"
                    variant={selected === 'all' ? 'primary' : 'default'}
                    aria-label="전체 보기"
                    data-tooltip="전체 보기"
                    aria-pressed={selected === 'all'}
                    onClick={() => setClassification('all')}
                  >
                    전체
                  </Button>
                  {NODE_TYPES.map((type) => (
                    <Button
                      key={type.kind}
                      className="graph-filter"
                      variant={selected === type.kind ? 'primary' : 'default'}
                      aria-label={`${type.label}만 보기`}
                      data-tooltip={`${type.label}만 보기`}
                      aria-pressed={selected === type.kind}
                      disabled={!graph.nodes.some((node) => node.kind === type.kind)}
                      onClick={() =>
                        setClassification(selected === type.kind ? 'all' : (type.kind as Kind))
                      }
                    >
                      <i className={`legend-shape ${type.shape}`} aria-hidden="true" />
                      {type.label}
                    </Button>
                  ))}
                </div>
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
          </Entrance>
        ))}
    </>
  )
}
