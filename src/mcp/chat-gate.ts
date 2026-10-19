import { spawn } from 'node:child_process'
import { isAbsolute, join, basename } from 'node:path'
import { connect, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  writeToolNames,
  writeRejected,
  type GateRequest,
  type GateMessage,
  type AppGateMessage,
  type RpcId
} from '../shared/chat-gate'

const separator = process.argv.indexOf('--', 2)
const options = process.argv.slice(2, separator)
const option = (key: string): string | undefined => {
  const index = options.indexOf(key)
  return index < 0 ? undefined : options[index + 1]
}
const [command, ...args] = process.argv.slice(separator + 1)
const pipe = option('--approval-pipe'),
  token = option('--approval-token'),
  runId = option('--approval-run')
const writable = args.includes('--write')
// 쓰기 서버와 차단 관문은 반드시 함께 켜진다. 잘못된 구성에는 서버도 띄우지 않는다.
if (
  separator < 2 ||
  !command ||
  !isAbsolute(command) ||
  (writable && (!pipe?.startsWith('\\\\.\\pipe\\') || !token || !runId)) ||
  (!writable && options.length !== 0) ||
  options.length !== (writable ? 6 : 0)
) {
  console.error('관문 실행 구성을 확인하지 못했습니다.')
  process.exitCode = 1
} else {
  const server = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  type Pending = GateRequest & {
    raw: Buffer
    state: 'pending' | 'approved' | 'terminal'
    received: boolean
    timer: NodeJS.Timeout
    receiptTimer: NodeJS.Timeout
  }
  const cards = new Map<string, Pending>()
  const byRpc = new Map<string, Pending>()
  const usedIds = new Set<string>()
  const key = (id: RpcId): string => `${typeof id}:${id}`
  let socket: Socket | undefined,
    authenticated = false,
    closing = false,
    sequence = 0
  const send = (message: GateMessage): boolean => {
    if (!authenticated || !socket || socket.destroyed) return false
    socket.write(JSON.stringify(message) + '\n')
    return true
  }
  const output = (value: unknown): void => {
    process.stdout.write(JSON.stringify(value) + '\n')
  }
  const terminal = (card: Pending, state: 'rejected' | 'timeout' | 'cancelled'): void => {
    if (card.state !== 'pending') return
    card.state = 'terminal'
    clearTimeout(card.timer)
    clearTimeout(card.receiptTimer)
    output({
      jsonrpc: '2.0',
      id: card.rpcId,
      result: { isError: true, content: [{ type: 'text', text: writeRejected }] }
    })
    send({ kind: 'terminal', cardId: card.cardId, state })
    cards.delete(card.cardId)
    byRpc.delete(key(card.rpcId))
  }
  const disconnected = (): void => {
    for (const card of cards.values()) terminal(card, 'cancelled')
    authenticated = false
    socket?.destroy()
  }
  const close = (): void => {
    if (closing) return
    closing = true
    disconnected()
    if (server.pid && server.exitCode === null) {
      const killer = spawn(
        join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(server.pid), '/T', '/F'],
        { shell: false, windowsHide: true, stdio: 'ignore' }
      )
      killer.on('error', () => server.kill())
    }
    process.stdin.destroy()
  }
  // 한 줄의 원문 Buffer를 보관한다. UTF-8 디코딩은 완성된 줄의 식별에만 쓴다.
  async function lines(
    stream: NodeJS.ReadableStream,
    work: (raw: Buffer) => void | Promise<void>
  ): Promise<void> {
    let buffer = Buffer.alloc(0)
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)])
      if (buffer.length > 8 * 1024 * 1024) throw Error('MCP line too large')
      let index: number
      while ((index = buffer.indexOf(10)) >= 0) {
        const raw = buffer.subarray(0, index + 1)
        buffer = buffer.subarray(index + 1)
        await work(raw)
      }
    }
    if (buffer.length) await work(buffer)
  }
  let writes = Promise.resolve()
  const forward = (raw: Buffer): Promise<void> => {
    writes = writes.then(async () => {
      if (closing || server.stdin.destroyed) throw Error('server closed')
      if (!server.stdin.write(raw)) await once(server.stdin, 'drain')
    })
    writes.catch(close)
    return writes
  }
  if (writable) {
    socket = connect(pipe!)
    socket.on('connect', () =>
      socket!.write(JSON.stringify({ kind: 'hello', token, runId }) + '\n')
    )
    socket.on('error', disconnected)
    socket.on('close', disconnected)
    void lines(socket, (raw) => {
      const message = JSON.parse(raw.toString('utf8')) as AppGateMessage
      if (!authenticated) {
        if (message.kind !== 'hello') {
          disconnected()
          return
        }
        authenticated = true
        return
      }
      if (message.kind === 'close') {
        disconnected()
        return
      }
      if (message.kind !== 'received' && message.kind !== 'decision')
        throw Error('bad pipe message')
      const card = cards.get(message.cardId)
      if (!card || card.state !== 'pending') return
      if (Date.now() >= card.expiresAt) {
        terminal(card, 'timeout')
        return
      }
      if (message.kind === 'received') {
        card.received = true
        clearTimeout(card.receiptTimer)
      } else if (message.decision === 'reject') terminal(card, 'rejected')
      else if (message.decision === 'approve' && card.received) {
        // 唯一의 기입 진입점: 현재 대기이며 표시 확인된 카드의 일회 승인.
        card.state = 'approved'
        clearTimeout(card.timer)
        clearTimeout(card.receiptTimer)
        void forward(card.raw)
      } else terminal(card, 'cancelled')
    }).catch(disconnected)
  }
  void lines(process.stdin, async (raw) => {
    if (closing) return
    let item: {
      jsonrpc?: unknown
      id?: unknown
      method?: unknown
      params?: { name?: unknown; arguments?: unknown; requestId?: unknown }
    }
    try {
      item = JSON.parse(raw.toString('utf8'))
    } catch {
      close()
      return
    }
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.jsonrpc !== '2.0') {
      close()
      return
    }
    const validId = (id: unknown): id is RpcId =>
      typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))
    if (item.id !== undefined) {
      if (!validId(item.id) || usedIds.has(key(item.id))) {
        close()
        return
      }
      usedIds.add(key(item.id))
    }
    if (item.method === 'notifications/cancelled' && validId(item.params?.requestId)) {
      const card = byRpc.get(key(item.params.requestId))
      if (card?.state === 'pending') {
        terminal(card, 'cancelled')
        return
      }
    }
    if (item.method === 'tools/call') {
      if (!validId(item.id) || typeof item.params?.name !== 'string') {
        close()
        return
      }
      if (writable && writeToolNames.includes(item.params.name as GateRequest['name'])) {
        const now = Date.now(),
          cardId = randomUUID()
        const request: GateRequest = {
          kind: 'request',
          cardId,
          rpcId: item.id,
          sequence: ++sequence,
          name: item.params.name as GateRequest['name'],
          input: item.params.arguments,
          createdAt: now,
          expiresAt: now + 300000
        }
        const card: Pending = {
          ...request,
          raw: Buffer.from(raw),
          state: 'pending',
          received: false,
          timer: setTimeout(() => terminal(card, 'timeout'), 300000),
          receiptTimer: setTimeout(() => terminal(card, 'cancelled'), 3000)
        }
        cards.set(cardId, card)
        byRpc.set(key(card.rpcId), card)
        if (!send(request)) terminal(card, 'rejected')
        return
      }
    }
    await forward(raw)
  })
    .then(close)
    .catch(close)
  // stdout의 원문과 backpressure는 Node pipe가 보존하고, 별도 읽기는 승인 결과만 식별한다.
  server.stdout.pipe(process.stdout)
  void lines(server.stdout, (raw) => {
    const item = JSON.parse(raw.toString('utf8'))
    const card = byRpc.get(key(item.id))
    if (!card || card.state !== 'approved') return
    card.state = 'terminal'
    let value: { error?: { message?: unknown }; backup?: { file?: unknown }; warning?: unknown } =
      {}
    try {
      value = JSON.parse(
        item.result?.content?.find((part: { type: string }) => part.type === 'text')?.text || '{}'
      )
    } catch {
      /* 제한된 오류만 전달 */
    }
    const error =
      typeof value.error?.message === 'string'
        ? value.error.message
        : item.error || item.result?.isError
          ? typeof item.error?.message === 'string'
            ? item.error.message
            : item.result?.content?.find((part: { type: string }) => part.type === 'text')?.text ||
              '서버 응답을 확인하지 못했습니다.'
          : undefined
    send({
      kind: 'result',
      cardId: card.cardId,
      error,
      backup:
        typeof value.backup?.file === 'string'
          ? basename(value.backup.file.replaceAll('\\', '/'))
          : undefined,
      warning: typeof value.warning === 'string' ? value.warning : undefined
    })
    cards.delete(card.cardId)
    byRpc.delete(key(card.rpcId))
  }).catch(close)
  server.stderr.pipe(process.stderr)
  process.stdin.on('error', close)
  server.stdin.on('error', close)
  process.stdout.on('error', close)
  process.on('SIGTERM', close)
  process.on('SIGINT', close)
  server.on('error', () => {
    process.exitCode = 1
    close()
  })
  server.on('exit', () => {
    disconnected()
    process.stdin.destroy()
  })
  server.on('close', (code) => {
    process.exitCode = code ?? 1
    socket?.destroy()
  })
}
