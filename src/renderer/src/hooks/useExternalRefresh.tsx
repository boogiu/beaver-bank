/* eslint-disable react-refresh/only-export-components -- Provider와 그 전용 훅은 하나의 구독 계약이다. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react'
import type { DependencyList, ReactNode } from 'react'

type Registration = {
  refresh: () => Promise<void>
  invalidate: () => void
  external: boolean
  committed: boolean
}
type Coordinator = {
  generation: number
  modals: number
  epoch: number
  active: Registration | null
  openModal: () => () => void
  register: (entry: Registration) => () => void
}
const Context = createContext<Coordinator | null>(null)

export function ExternalRefreshProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const coordinator = useMemo<Coordinator>(() => {
    const state: Coordinator = {
      generation: 0,
      modals: 0,
      epoch: 0,
      active: null,
      register(entry) {
        state.active = entry
        return () => {
          if (state.active === entry) state.active = null
        }
      },
      openModal() {
        state.modals++
        state.epoch++
        let closed = false
        return () => {
          if (closed) return
          closed = true
          state.modals--
          if (!state.modals)
            queueMicrotask(() => {
              void state.active?.refresh()
            })
        }
      }
    }
    return state
  }, [])
  useEffect(() => {
    let active = true
    const receive = (generation: number): void => {
      if (!active || generation <= coordinator.generation) return
      coordinator.generation = generation
      if (coordinator.active?.committed) coordinator.active.external = true
      coordinator.active?.invalidate()
    }
    const unsubscribe = window.api.onDataChanged(receive)
    const check = (): void => {
      void window.api.getDataGeneration().then(receive)
    }
    const visible = (): void => {
      if (!document.hidden) check()
    }
    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [coordinator])
  return <Context.Provider value={coordinator}>{children}</Context.Provider>
}

export function useExternalModal(): void {
  const coordinator = useContext(Context)
  useLayoutEffect(() => coordinator?.openModal(), [coordinator])
}

export function useExternalEntrance(): boolean {
  const coordinator = useContext(Context)
  return !(coordinator?.active?.external ?? false)
}

// 조회와 적용을 분리한다. 팝업이 열린 뒤 도착한 응답과 지난 페이지의 응답은 버린다.
export function useExternalRefresh(
  load: () => Promise<() => void>,
  dependencies: DependencyList
): () => Promise<void> {
  const coordinator = useContext(Context)!
  const latest = useRef(load)
  useLayoutEffect(() => {
    latest.current = load
  })
  const registration = useRef<Registration | null>(null)
  const scroll = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (scroll.current === null) return
    const page = document.querySelector('main.page')
    if (page) page.scrollTop = scroll.current
    scroll.current = null
  })
  const refresh = useCallback(async (): Promise<void> => {
    const current = registration.current
    if (current) {
      current.external = false
      current.invalidate()
    }
  }, [])
  useLayoutEffect(() => {
    let alive = true
    let pending = true
    let running = false
    let revision = 0
    const drain = async (): Promise<void> => {
      if (!alive || running || coordinator.modals || !pending) return
      running = true
      try {
        while (alive && pending && !coordinator.modals) {
          pending = false
          const started = revision
          const epoch = coordinator.epoch
          const generation = coordinator.generation
          const commit = await latest.current()
          if (!alive) return
          if (
            coordinator.modals ||
            epoch !== coordinator.epoch ||
            started !== revision ||
            generation !== coordinator.generation
          ) {
            pending = true
            continue
          }
          scroll.current = document.querySelector('main.page')?.scrollTop ?? null
          commit()
          entry.committed = true
        }
      } catch (error) {
        console.error('페이지를 다시 읽지 못했습니다.', error)
      } finally {
        running = false
      }
    }
    const entry: Registration = {
      external: false,
      committed: false,
      refresh: drain,
      invalidate() {
        revision++
        pending = true
        void drain()
      }
    }
    registration.current = entry
    const unregister = coordinator.register(entry)
    void drain()
    return () => {
      alive = false
      if (registration.current === entry) registration.current = null
      unregister()
    }
    // 페이지의 조회 인수(예: 선택 월)가 바뀌면 이전 요청을 폐기한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator, ...dependencies])
  return refresh
}
