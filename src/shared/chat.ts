export const chatModels = ['default', 'opus', 'sonnet', 'haiku'] as const
export type ChatModel = (typeof chatModels)[number]
export type ChatSource = 'demo' | 'real'
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
  demo: boolean
  status: ChatStatus
  replies: ChatReply[]
}
export type ChatRequest =
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
