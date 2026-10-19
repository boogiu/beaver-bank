// 관문/화면 사이의 순수 계약. 서버 스키마나 업무 모듈을 불러오지 않는다.
export const writeToolTitles = {
  add_purpose: '용도 등록',
  update_purpose: '용도 수정',
  add_account: '계좌 등록',
  update_account: '계좌 수정',
  add_card: '카드 등록',
  update_card: '카드 수정',
  add_flow: '정기 흐름 등록',
  update_flow: '정기 흐름 수정',
  adjust_occurrence: '회차 예외',
  close_account: '계좌 해지',
  restore_account: '계좌 복구',
  close_card: '카드 해지',
  restore_card: '카드 복구',
  end_flow: '정기 흐름 종료',
  resume_flow: '정기 흐름 종료 취소',
  correct_balance: '잔액 보정'
} as const
export type ChatWriteTool = keyof typeof writeToolTitles
export const writeToolNames = Object.keys(writeToolTitles) as ChatWriteTool[]
export const writeGroup = (name: ChatWriteTool): string =>
  name === 'correct_balance'
    ? '잔액 보정'
    : name.startsWith('add_') || name.startsWith('update_') || name === 'adjust_occurrence'
      ? '등록·수정'
      : '상태 변경'
export const writeRejected = '사용자가 이 기입을 거절했습니다.'
export type RpcId = string | number
export interface GateRequest {
  kind: 'request'
  cardId: string
  rpcId: RpcId
  sequence: number
  name: ChatWriteTool
  input: unknown
  createdAt: number
  expiresAt: number
}
export type GateMessage =
  | { kind: 'hello'; token: string; runId: string }
  | GateRequest
  | { kind: 'terminal'; cardId: string; state: 'rejected' | 'timeout' | 'cancelled' }
  | { kind: 'result'; cardId: string; error?: string; backup?: string; warning?: string }
export type AppGateMessage =
  | { kind: 'hello' }
  | { kind: 'received'; cardId: string }
  | { kind: 'decision'; cardId: string; decision: 'approve' | 'reject' }
  | { kind: 'close' }
