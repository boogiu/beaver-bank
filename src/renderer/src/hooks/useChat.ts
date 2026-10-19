import { useEffect, useRef, useState } from 'react'
import type { ChatRequest, ChatSnapshot } from '@shared/chat'

export function useChat(): {
  chat: ChatSnapshot | null
  request: (request: ChatRequest) => Promise<void>
} {
  const [chat, setChat] = useState<ChatSnapshot | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    let subscribed = true
    let received = false
    const unsubscribe = window.api.onChat((snapshot) => {
      received = true
      if (subscribed)
        setChat((current) =>
          !current || snapshot.revision >= current.revision ? snapshot : current
        )
    })
    void window.api.getChat().then((snapshot) => {
      if (subscribed && !received)
        setChat((current) =>
          !current || snapshot.revision >= current.revision ? snapshot : current
        )
    })
    return () => {
      subscribed = false
      active.current = false
      unsubscribe()
    }
  }, [])
  const request = async (value: ChatRequest): Promise<void> => {
    const snapshot = await window.api.requestChat(value)
    if (active.current)
      setChat((current) => (!current || snapshot.revision >= current.revision ? snapshot : current))
  }
  return { chat, request }
}
