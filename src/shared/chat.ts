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
export const chatSetupTasks = [
  'claude-install',
  'claude-login',
  'claude-update',
  'codex-install',
  'codex-login'
] as const
export type ChatSetupTask = (typeof chatSetupTasks)[number]
// 지금 상태에 맞는 작업 하나의 판정. blocked: 이유 문장만, copy: 명령 복사, window: 작업 창
export interface ChatSetupAction {
  task: ChatSetupTask
  mode: 'blocked' | 'copy' | 'window'
  // 선행 조건(CS-39)의 이유 문장
  reason?: string
  notice?: string
  // copy: 복사하는 글자, window: 실행 확인 팝업의 "공식 명령" 상자 글자
  command?: string
  source?: string
  // 작업 단추(창 작업) 또는 [명령 복사]가 흐림. disabled는 마우스를 올리면 보이는 이유
  dimmed?: boolean
  disabled?: string
  // 창 작업의 창 제목(CS-33)
  title?: string
  // 판정용 명령 바꾸기가 켜진 설치(CS-25·CS-81의 경고 줄)와 그 명령을 쓸 수 없는 이유(CS-38)
  override?: boolean
  overrideReason?: string
}
// 승인 직전에 준비한 작업 창(실행 확인 팝업이 보이는 명령 줄 전체). 승인 때 이 인수 그대로 시작한다.
export interface ChatSetupPending {
  task: ChatSetupTask
  token: string
  title: string
  display: string
}
// 열려 있는 작업 창(CS-18 "작업 중")
export interface ChatSetupRunning {
  task: ChatSetupTask
  client: 'claude' | 'codex'
  title: string
  // wt.exe를 띄우는 spawn()이 돌아오기까지 걸린 시간(ms)
  spawnMs?: number
  // 감시를 복구하는 동안에도 실제 창 종료 확인 전까지 작업 잠금은 유지한다.
  watchFailure?: { since: number; elapsedMs: number }
}
export const chatWatchNotice = '작업 창 상태를 확인하지 못하고 있습니다 (다시 시도 중).'
export const chatWatchRecovery =
  '작업 창이 닫혔는지 직접 확인한 뒤 BeaverBank를 완전히 종료하고 다시 시작하세요.'
// 작업 창이 닫힌 뒤(또는 열지 못한 뒤)의 결과 줄(CS-43)
export interface ChatSetupResult {
  task: ChatSetupTask
  ok: boolean
  text: string
}
export interface ChatSetup {
  claude?: ChatSetupAction
  codex?: ChatSetupAction
  copy?: { task: ChatSetupTask; ok: boolean; sequence: number }
  pending?: ChatSetupPending
  running?: ChatSetupRunning
  results?: { claude?: ChatSetupResult; codex?: ChatSetupResult }
}
export interface ChatSnapshot {
  revision: number
  epoch: string
  settings: ChatSettings
  source: ChatSource
  writeEnabled: boolean
  demo: boolean
  status: ChatStatus
  codex: ChatStatus
  setup: ChatSetup
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
  | { kind: 'tools-check' }
  | { kind: 'copy'; task: ChatSetupTask }
  | { kind: 'setup-prepare'; task: ChatSetupTask }
  | { kind: 'setup-start'; task: ChatSetupTask; token: string }
  | { kind: 'setup-cancel' }
  | { kind: 'send'; text: string; epoch: string }
  | { kind: 'retry'; id: string; epoch: string }
  | { kind: 'stop' }
  | { kind: 'reset'; source?: ChatSource }
export interface ChatApi {
  getChat(): Promise<ChatSnapshot>
  requestChat(request: ChatRequest): Promise<ChatSnapshot>
  onChat(listener: (snapshot: ChatSnapshot) => void): () => void
}
