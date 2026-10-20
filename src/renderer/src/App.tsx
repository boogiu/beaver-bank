import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CreditCard,
  GitBranch,
  Info,
  Landmark,
  Tags,
  Repeat,
  LayoutDashboard,
  MessagesSquare
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import mascot from './assets/illustrations/M1-C-mascot-a2.png'
import { Icon } from './components/Ui'
import AccountsPage from './pages/AccountsPage'
import CardsPage from './pages/CardsPage'
import PurposesPage from './pages/PurposesPage'
import GraphPage from './pages/GraphPage'
import InfoPage from './pages/InfoPage'
import FlowsPage from './pages/FlowsPage'
import DashboardPage from './pages/DashboardPage'
import { getReducedMotion } from './hooks/useReducedMotion'
import { DamScene } from './components/DamScene'
import { ExternalRefreshProvider } from './hooks/useExternalRefresh'
import { useChat } from './hooks/useChat'
import { ChatPanel } from './components/chat/ChatPanel'

export type PageId = string
export type NavigationTarget = {
  kind: 'account' | 'card' | 'purpose' | 'flow'
  id: number
  inactive: boolean
}
export type PageProps = {
  target: NavigationTarget | null
  clearTarget: () => void
  navigate: (page: PageId, target?: NavigationTarget) => void
}

// 메뉴 표시와 페이지 연결을 한 목록에서 관리한다.
const MENU: {
  id: PageId
  label: string
  icon: LucideIcon
  component: React.ComponentType<PageProps>
}[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, component: DashboardPage },
  { id: 'accounts', label: '계좌', icon: Landmark, component: AccountsPage },
  { id: 'cards', label: '카드', icon: CreditCard, component: CardsPage },
  { id: 'purposes', label: '용도', icon: Tags, component: PurposesPage },
  { id: 'flows', label: '흐름', icon: Repeat, component: FlowsPage },
  { id: 'graph', label: '그래프', icon: GitBranch, component: GraphPage },
  { id: 'info', label: '정보', icon: Info, component: InfoPage }
]

function App(): React.JSX.Element {
  const { chat, request } = useChat()
  // outerWidth includes the native frame; CSS media queries use the inner viewport.
  const [windowWidth, setWindowWidth] = useState(() => window.outerWidth)
  useLayoutEffect(() => {
    let frame = 0
    const measure = (): void => setWindowWidth(window.outerWidth)
    const resized = (): void => {
      measure()
      // The native frame size can reach the renderer just after its resize event.
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        measure()
        frame = window.requestAnimationFrame(measure)
      })
    }
    window.addEventListener('resize', resized)
    measure()
    return () => {
      window.removeEventListener('resize', resized)
      window.cancelAnimationFrame(frame)
    }
  }, [])
  const docked = windowWidth >= 1280
  const panelWidth = docked ? Math.min(400, Math.max(320, windowWidth - 960)) : 320
  const chatToggle = useRef<HTMLButtonElement>(null)
  const toggleChat = (): void => {
    if (!chat) return
    if (
      chat.settings.open &&
      document.getElementById('chat-panel')?.contains(document.activeElement)
    )
      chatToggle.current?.focus()
    void request({ kind: 'settings', open: !chat.settings.open })
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.toLowerCase() === 'l' &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault()
        if (
          chat?.settings.open &&
          document.getElementById('chat-panel')?.contains(document.activeElement)
        )
          chatToggle.current?.focus()
        void request({ kind: 'settings', open: !chat?.settings.open })
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [chat?.settings.open, request])
  const [page, setPage] = useState<PageId>('dashboard')
  const [target, setTarget] = useState<NavigationTarget | null>(null)
  const [hopping, setHopping] = useState(false)
  const hopTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(hopTimer.current), [])
  const hop = (): void => {
    if (getReducedMotion() || hopping) return
    setHopping(true)
    hopTimer.current = window.setTimeout(() => setHopping(false), 400)
  }
  const menu = useRef<HTMLElement>(null)
  const highlight = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const list = menu.current
    const indicator = highlight.current
    if (!list || !indicator) return
    const measure = (): void => {
      const current = list.querySelector<HTMLElement>('[aria-current="page"]')
      if (!current) return
      indicator.style.transition = getReducedMotion() ? 'none' : ''
      indicator.style.height = `${current.offsetHeight}px`
      indicator.style.transform = `translateY(${current.offsetTop}px)`
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [page])
  const navigate: PageProps['navigate'] = (next, item) => {
    setPage(next)
    setTarget(item ?? null)
  }
  const Current = MENU.find((item) => item.id === page)!.component

  return (
    <div
      className={`app-shell ${chat?.settings.open && docked ? 'chat-docked' : ''}`}
      style={{ '--chat-panel-width': `${panelWidth}px` } as React.CSSProperties}
    >
      <aside className="sidebar">
        <div className="brand">
          <img
            src={mascot}
            alt=""
            className={`mascot-motion ${hopping ? 'mascot-hop' : ''}`}
            style={{ animationPlayState: hopping ? 'paused, running' : 'running' }}
          />
          <span className="mascot-hit" onMouseEnter={hop} aria-hidden="true" />
          <span>BeaverBank</span>
        </div>
        <div className="menu-chat-group">
          <nav className="menu-list" aria-label="주 메뉴" ref={menu}>
            <div className="menu-highlight" ref={highlight} aria-hidden="true" />
            {MENU.map(({ id, label, icon }) => (
              <button
                key={id}
                className={`menu-button ${page === id ? 'active' : ''}`}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => navigate(id)}
              >
                <Icon icon={icon} size={20} />
                {label}
              </button>
            ))}
          </nav>
          <div className="chat-divider" />
          <button
            ref={chatToggle}
            className={`menu-button chat-toggle ${chat?.settings.open ? 'is-open' : ''}`}
            title={`AI 대화 ${chat?.settings.open ? '닫기' : '열기'} (Ctrl+L)`}
            aria-expanded={chat?.settings.open ?? false}
            aria-controls="chat-panel"
            aria-keyshortcuts="Control+L"
            onClick={toggleChat}
          >
            <Icon icon={MessagesSquare} size={20} />
            AI 대화
            {chat?.replies.some(
              (reply) =>
                reply.state === 'running' ||
                reply.blocks.some((block) => block.kind === 'write' && block.state === 'pending')
            ) && (
              <span
                className={`chat-toggle-dot ${chat.replies.some((reply) => reply.blocks.some((block) => block.kind === 'write' && block.state === 'pending')) ? 'has-pending' : ''}`}
              />
            )}
          </button>
        </div>
        <DamScene />
      </aside>
      <div className="page-viewport">
        <main
          key={page}
          className={`page ${page === 'graph' ? 'graph-page' : ''}`}
          onPointerDown={() => {
            if (target) setTarget(null)
          }}
        >
          <ExternalRefreshProvider key={page}>
            <Current target={target} clearTarget={() => setTarget(null)} navigate={navigate} />
          </ExternalRefreshProvider>
        </main>
      </div>
      {chat && <ChatPanel chat={chat} request={request} onClose={toggleChat} docked={docked} />}
    </div>
  )
}

export default App
