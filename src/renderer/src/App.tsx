import { useState } from 'react'
import { CreditCard, GitBranch, Info, Landmark, Tags, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import mascot from './assets/illustrations/M1-C-mascot-a2.png'
import { Icon } from './components/Ui'
import AccountsPage from './pages/AccountsPage'
import CardsPage from './pages/CardsPage'
import PurposesPage from './pages/PurposesPage'
import GraphPage from './pages/GraphPage'
import InfoPage from './pages/InfoPage'
import FlowsPage from './pages/FlowsPage'

export type PageId = string
export type NavigationTarget = {
  kind: 'account' | 'card' | 'purpose'
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
  { id: 'accounts', label: '계좌', icon: Landmark, component: AccountsPage },
  { id: 'cards', label: '카드', icon: CreditCard, component: CardsPage },
  { id: 'purposes', label: '용도', icon: Tags, component: PurposesPage },
  { id: 'flows', label: '흐름', icon: Repeat, component: FlowsPage },
  { id: 'graph', label: '그래프', icon: GitBranch, component: GraphPage },
  { id: 'info', label: '정보', icon: Info, component: InfoPage }
]

function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('accounts')
  const [target, setTarget] = useState<NavigationTarget | null>(null)
  const navigate: PageProps['navigate'] = (next, item) => {
    setPage(next)
    setTarget(item ?? null)
  }
  const Current = MENU.find((item) => item.id === page)!.component

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={mascot} alt="" />
          <span>BeaverBank</span>
        </div>
        <nav className="menu-list" aria-label="주 메뉴">
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
      </aside>
      <main
        key={page}
        className={`page ${page === 'graph' ? 'graph-page' : ''}`}
        onClick={() => target && setTarget(null)}
      >
        <Current target={target} clearTarget={() => setTarget(null)} navigate={navigate} />
      </main>
    </div>
  )
}

export default App
