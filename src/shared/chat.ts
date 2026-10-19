export const chatModels = ['default', 'opus', 'sonnet', 'haiku'] as const
export type ChatModel = (typeof chatModels)[number]
export type ChatSource = 'demo' | 'real'
import type { GateRequest } from './chat-gate'
export interface ChatWriteCard extends Omit<GateRequest, 'kind'> {
  kind: 'write'
  epoch: string
  replyId: string
  runId: string
  source: ChatSource
  names: Record<string, Record<string, string>>
  state: 'pending' | 'deciding' | 'success' | 'error' | 'rejected' | 'timeout' | 'cancelled'
  error?: string
  backup?: string
  warning?: string
}
export interface ChatSettings {
  open: boolean
  model: ChatModel
}
export interface ChatStatus {
  state: 'checking' | 'ready' | 'missing' | 'login' | 'unknown'
  version?: string
  verified?: boolean
}
export type ChatBlock =
  | ChatWriteCard
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; input: unknown; state: 'running' | 'done' | 'error' }
export interface ChatReply {
  id: string
  runId?: string
  prompt: string
  model: ChatModel
  blocks: ChatBlock[]
  state: 'running' | 'done' | 'stopped' | 'error'
  error?: string
  detail?: string
  elapsed: number
  retry?: string
  waiting: boolean
}
export interface ChatSnapshot {
  revision: number
  epoch: string
  settings: ChatSettings
  source: ChatSource
  writeEnabled: boolean
  demo: boolean
  status: ChatStatus
  replies: ChatReply[]
}
export type ChatRequest =
  | { kind: 'write-enabled'; enabled: boolean; epoch: string }
  | { kind: 'card-received'; epoch: string; runId: string; cardId: string }
  | {
      kind: 'card-decision'
      epoch: string
      runId: string
      cardId: string
      decision: 'approve' | 'reject'
    }
  | { kind: 'settings'; open?: boolean; model?: ChatModel }
  | { kind: 'check' }
  | { kind: 'send'; text: string; epoch: string }
  | { kind: 'retry'; id: string; epoch: string }
  | { kind: 'stop' }
  | { kind: 'reset'; source?: ChatSource }
export interface ChatApi {
  getChat(): Promise<ChatSnapshot>
  requestChat(request: ChatRequest): Promise<ChatSnapshot>
  onChat(listener: (snapshot: ChatSnapshot) => void): () => void
}
