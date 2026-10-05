import type { AccountType, CardType, InterestType, TaxType } from './domain'

// main ↔ renderer 사이에 오가는 요청과 결과. 실패는 항상 한국어 안내로 돌려준다.
export interface DbStatus {
  path: string
  isDev: boolean
  migrations: number
  tables: { name: string; rows: number }[]
}

export interface ApiError {
  kind: 'validation' | 'duplicate' | 'not_found' | 'other'
  message: string
  field?: string
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export interface Purpose {
  id: number
  name: string
  color: string
  sortOrder: number
  accountCount: number
}
export interface PurposeInput {
  name: string
  color: string
}

export interface SavingsInput {
  startDate: string
  maturityDate: string
  interestRate: number
  interestType: InterestType
  taxType: TaxType
  targetAmount: number | null
}
export interface AccountInput {
  name: string
  bank: string
  numberTail: string | null
  type: AccountType
  purposeId: number | null
  memo: string | null
  savings: SavingsInput | null
}
export interface Account extends Omit<AccountInput, 'savings'> {
  id: number
  isActive: boolean
  sortOrder: number
  savings: SavingsInput | null
}

export interface CardInput {
  name: string
  issuer: string
  type: CardType
  accountId: number | null
  paymentDay: number | null
  numberTail: string | null
  memo: string | null
}
export interface Card extends CardInput {
  id: number
  isActive: boolean
  linkedAccount: { name: string; bank: string; isActive: boolean } | null
}

export interface Api {
  getDbStatus(): Promise<Result<DbStatus>>
  listPurposes(): Promise<Result<Purpose[]>>
  addPurpose(input: PurposeInput): Promise<Result<Purpose>>
  updatePurpose(id: number, input: PurposeInput): Promise<Result<Purpose>>
  deletePurpose(id: number): Promise<Result<void>>
  reorderPurposes(ids: number[]): Promise<Result<void>>
  listAccounts(includeInactive?: boolean): Promise<Result<Account[]>>
  addAccount(input: AccountInput): Promise<Result<Account>>
  updateAccount(id: number, input: AccountInput): Promise<Result<Account>>
  closeAccount(id: number): Promise<Result<void>>
  restoreAccount(id: number): Promise<Result<void>>
  listCards(includeInactive?: boolean): Promise<Result<Card[]>>
  addCard(input: CardInput): Promise<Result<Card>>
  updateCard(id: number, input: CardInput): Promise<Result<Card>>
  closeCard(id: number): Promise<Result<void>>
  restoreCard(id: number): Promise<Result<void>>
}
