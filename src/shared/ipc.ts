import type {
  AccountType,
  CardType,
  FlowCategory,
  FlowCycle,
  FlowKind,
  InterestType,
  TaxType
} from './domain'

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
  flowCount: number
  monthlyContribution: number
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
  flowCount: number
}

export interface FlowInput {
  name: string
  kind: FlowKind
  amount: number
  isVariable: boolean
  fromAccountId: number | null
  toAccountId: number | null
  cardId: number | null
  category: FlowCategory
  cycle: FlowCycle
  day: number
  month: number | null
  startDate: string
  endDate: string | null
  memo: string | null
}
export interface Flow extends FlowInput {
  id: number
  status: 'scheduled' | 'active' | 'ended'
  fromAccount: { name: string; bank: string; isActive: boolean } | null
  toAccount: { name: string; bank: string; isActive: boolean } | null
  card: { name: string; issuer: string; isActive: boolean } | null
  overrideCount: number
  sortOrder: number
}

export interface FlowOverrideInput {
  flowId: number
  occurrenceDate: string
  action: 'original' | 'amount' | 'skip'
  actualAmount: number | null
  memo: string | null
}
export interface Occurrence {
  flow: Flow
  date: string
  kind: FlowKind
  sortOrder: number
  originalAmount: number
  amount: number
  action: FlowOverrideInput['action']
  actualAmount: number | null
  memo: string | null
  fromAccountId: number | null
  toAccountId: number | null
}
export interface MonthlyFlows {
  year: number
  month: number
  occurrences: Occurrence[]
  totals: {
    income: number
    transfer: number
    payment: number
    remaining: number
    accounts: {
      id: number
      incoming: number
      outgoing: number
      balance: number | null
      predicted: boolean
    }[]
  }
}

export interface AccountBalance {
  accountId: number
  date: string
  balance: number | null
  baseDate: string | null
  baseBalance: number | null
  predicted: boolean
}
export interface PurposeAmount {
  purposeId: number | null
  amount: number | null
  accountCount: number
  missingCount: number
}
export interface BalanceSnapshotInput {
  accountId: number
  date: string
  balance: number
  memo: string | null
}
export interface BalanceSnapshot extends BalanceSnapshotInput {
  id: number
}
export interface BalanceHistory extends BalanceSnapshot {
  beforeBalance: number | null
  difference: number | null
}
export interface BalanceBefore {
  beforeBalance: number | null
  occurrenceCount: number
  existing: BalanceSnapshot | null
}

// 대시보드 값은 조회 시 계산하며 null(미입력)과 0을 구분한다.
export interface DashboardData {
  date: string
  accountCount: number
  missingCount: number
  assets: {
    total: number | null
    composition: (PurposeAmount & { name: string; color: string; share: number | null })[]
  }
  month: {
    year: number
    month: number
    income: number
    payment: number
    remaining: number
    incoming: number
    outgoing: number
  }
  upcoming: {
    total: number
    items: {
      flowId: number
      name: string
      kind: FlowKind
      date: string
      days: number
      amount: number
    }[]
  }
}

export interface Api {
  getDashboard(date?: string): Promise<Result<DashboardData>>
  listBalances(date?: string): Promise<Result<AccountBalance[]>>
  listPurposeAmounts(date?: string): Promise<Result<PurposeAmount[]>>
  listBalanceSnapshots(accountId: number): Promise<Result<BalanceHistory[]>>
  saveBalanceSnapshot(input: BalanceSnapshotInput): Promise<Result<void>>
  deleteBalanceSnapshot(id: number): Promise<Result<void>>
  getBalanceBefore(accountId: number, date: string): Promise<Result<BalanceBefore>>
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
  listFlows(includeEnded?: boolean): Promise<Result<Flow[]>>
  addFlow(input: FlowInput): Promise<Result<Flow>>
  updateFlow(
    id: number,
    input: FlowInput,
    effectiveStartDate?: string | null
  ): Promise<Result<Flow>>
  endFlow(id: number, endDate: string): Promise<Result<void>>
  resumeFlow(id: number): Promise<Result<void>>
  deleteFlow(id: number): Promise<Result<void>>
  listMonthlyFlows(year: number, month: number): Promise<Result<MonthlyFlows>>
  saveFlowOverride(input: FlowOverrideInput): Promise<Result<void>>
}
