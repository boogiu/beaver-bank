import { useEffect, useRef, useState } from 'react'
import type { ChatRequest, ChatSetupTask, ChatSnapshot } from '@shared/chat'

// [명령 복사]의 결과(CS-83). 누른 부품만 결과를 보인다. 성공 표시는 2초 뒤 돌아간다.
export function useChatCopy(
  request: (request: ChatRequest) => Promise<ChatSnapshot>,
  sequence: number
): {
  result: { task: ChatSetupTask; ok: boolean } | null
  copy: (task: ChatSetupTask) => Promise<void>
} {
  const [result, setResult] = useState<{ task: ChatSetupTask; ok: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async (task: ChatSetupTask): Promise<void> => {
    window.clearTimeout(timer.current)
    setResult(null)
    const copied = (await request({ kind: 'copy', task })).setup.copy
    if (!copied || copied.task !== task || copied.sequence <= sequence) return
    setResult({ task, ok: copied.ok })
    if (copied.ok) timer.current = window.setTimeout(() => setResult(null), 2000)
  }
  return { result, copy }
}
