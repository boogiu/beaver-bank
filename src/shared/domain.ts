// DB와 화면이 함께 쓰는 도메인 상수.
// 금액은 원 단위 정수, 날짜는 'YYYY-MM-DD' 문자열로 다룬다.

export const ACCOUNT_TYPES = [
  'checking', // 입출금
  'installment', // 적금
  'deposit', // 예금
  'parking', // 파킹통장
  'cma',
  'investment' // 투자
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const INTEREST_TYPES = ['simple', 'compound'] as const // 단리, 복리
export type InterestType = (typeof INTEREST_TYPES)[number]

// 일반과세 15.4%, 비과세, 세금우대 9.5%
export const TAX_TYPES = ['normal', 'tax_free', 'preferential'] as const
export type TaxType = (typeof TAX_TYPES)[number]

// income: 외부 → 계좌, transfer: 계좌 → 계좌, payment: 계좌 → 외부
export const FLOW_KINDS = ['income', 'transfer', 'payment'] as const
export type FlowKind = (typeof FLOW_KINDS)[number]

export const FLOW_CATEGORIES = [
  'salary', // 급여
  'savings', // 적금 납입
  'allocation', // 용도별 분배
  'subscription', // 구독
  'insurance', // 보험
  'telecom', // 통신
  'utility', // 공과금
  'loan', // 대출
  'other' // 기타
] as const
export type FlowCategory = (typeof FLOW_CATEGORIES)[number]

export const FLOW_CYCLES = ['monthly', 'yearly'] as const
export type FlowCycle = (typeof FLOW_CYCLES)[number]
