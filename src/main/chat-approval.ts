import { createServer, type Server, type Socket } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { ChatWriteCard, ChatSource } from '../shared/chat'
import { writeToolNames, type AppGateMessage, type GateMessage } from '../shared/chat-gate'

// 실행별 파이프와 메모리 상태만 맡는다. 클라이언트 실행은 chat-client에 있다.
export class ChatApproval {
  readonly pipe = `\\\\.\\pipe\\beaverbank-chat-${randomBytes(24).toString('hex')}`
  readonly token = randomBytes(32).toString('hex')
  private server?: Server
  private socket?: Socket
  private connections = new Set<Socket>()
  private cards = new Map<string, ChatWriteCard>()
  private receivedCards = new Set<string>()
  private closed = false
  private sequence = 0
  constructor(
    private context: { epoch: string; replyId: string; runId: string; source: ChatSource },
    private onCard: (card: ChatWriteCard) => void,
    private publish: () => void,
    private valid: () => boolean,
    private invalid: () => void
  ) {}
  async listen(): Promise<void> {
    this.server = createServer((socket) => {
      if (this.closed) {
        socket.destroy()
        return
      }
      this.connections.add(socket)
      let authenticated = false
      let buffer = ''
      const timer = setTimeout(() => socket.destroy(), 2000)
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => {
        buffer += chunk
        if (buffer.length > 8 * 1024 * 1024) {
          socket.destroy()
          return
        }
        let newline: number
        try {
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const message = JSON.parse(buffer.slice(0, newline)) as GateMessage
            buffer = buffer.slice(newline + 1)
            if (!authenticated) {
              if (
                message.kind !== 'hello' ||
                message.runId !== this.context.runId ||
                typeof message.token !== 'string' ||
                message.token.length !== this.token.length ||
                !timingSafeEqual(Buffer.from(message.token), Buffer.from(this.token)) ||
                this.socket
              ) {
                socket.destroy()
                return
              }
              authenticated = true
              clearTimeout(timer)
              this.socket = socket
              this.send({ kind: 'hello' })
              continue
            }
            this.message(message)
          }
        } catch {
          socket.destroy()
        }
      })
      const lost = (): void => {
        clearTimeout(timer)
        this.connections.delete(socket)
        if (this.socket === socket) {
          this.socket = undefined
          this.cancel()
        }
      }
      socket.on('error', lost)
      socket.on('close', lost)
      socket.on('end', () => socket.destroy())
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.pipe, () => {
        this.server!.removeListener('error', reject)
        this.server!.on('error', () => this.cancel())
        resolve()
      })
    })
  }
  private send(message: AppGateMessage): boolean {
    if (!this.socket || this.socket.destroyed) return false
    this.socket.write(JSON.stringify(message) + '\n')
    return true
  }
  private message(message: GateMessage): void {
    if (this.closed) return
    if (message.kind === 'request') {
      if (!this.valid()) {
        this.cancel()
        this.invalid()
        return
      }
      if (
        typeof message.cardId !== 'string' ||
        this.cards.has(message.cardId) ||
        !writeToolNames.includes(message.name) ||
        !['string', 'number'].includes(typeof message.rpcId) ||
        !Number.isInteger(message.sequence) ||
        message.sequence <= this.sequence ||
        !Number.isFinite(message.createdAt) ||
        message.expiresAt !== message.createdAt + 300000
      ) {
        this.cancel()
        return
      }
      this.sequence = message.sequence
      const card: ChatWriteCard = {
        kind: 'write',
        ...this.context,
        cardId: message.cardId,
        rpcId: message.rpcId,
        sequence: message.sequence,
        name: message.name,
        input: message.input,
        createdAt: message.createdAt,
        expiresAt: message.expiresAt,
        names: {},
        state: 'pending'
      }
      this.cards.set(card.cardId, card)
      this.onCard(card)
      this.publish()
      return
    }
    if (message.kind !== 'terminal' && message.kind !== 'result') {
      this.cancel()
      return
    }
    const card = this.cards.get(message.cardId)
    if (!card || !['pending', 'deciding'].includes(card.state)) return
    if (message.kind === 'terminal') {
      if (!['rejected', 'timeout', 'cancelled'].includes(message.state)) {
        this.cancel()
        return
      }
      card.state = message.state
    } else {
      if (card.state !== 'deciding') {
        this.cancel()
        return
      }
      card.state = typeof message.error === 'string' ? 'error' : 'success'
      card.error = typeof message.error === 'string' ? message.error : undefined
      card.backup =
        typeof message.backup === 'string' ? message.backup.split(/[\\/]/).pop() : undefined
      card.warning = typeof message.warning === 'string' ? message.warning : undefined
    }
    this.publish()
  }
  received(cardId: string): void {
    const card = this.cards.get(cardId)
    if (this.closed || !this.valid() || card?.state !== 'pending') return
    this.receivedCards.add(cardId)
    if (!this.send({ kind: 'received', cardId })) this.cancel()
  }
  decide(cardId: string, decision: 'approve' | 'reject'): void {
    const card = this.cards.get(cardId)
    if (
      this.closed ||
      !this.valid() ||
      card?.state !== 'pending' ||
      !this.receivedCards.has(cardId) ||
      Date.now() >= card.expiresAt
    )
      return
    // await나 파이프 쓰기 전에 닫는다. 성공은 관문의 실제 서버 결과로만 바뀐다.
    card.state = 'deciding'
    this.publish()
    if (!this.send({ kind: 'decision', cardId, decision })) this.cancel()
  }
  get pending(): boolean {
    return [...this.cards.values()].some((card) => card.state === 'pending')
  }
  cancel(): void {
    if (this.closed) return
    this.closed = true
    for (const card of this.cards.values())
      if (card.state === 'pending' || card.state === 'deciding') card.state = 'cancelled'
    // UI 해제는 소켓/프로세스 정리를 기다리지 않는다.
    this.publish()
    this.send({ kind: 'close' })
    for (const socket of this.connections) socket.end(() => socket.destroy())
    this.server?.close()
    this.receivedCards.clear()
    this.cards.clear()
  }
}
