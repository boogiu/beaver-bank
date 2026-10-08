import { and, asc, eq, sql } from 'drizzle-orm'
import { ACCOUNT_TYPES, CARD_TYPES, INTEREST_TYPES, TAX_TYPES } from '../../shared/domain'
import {
  compareOccurrences,
  isRealDate,
  occurrenceDate,
  sumOccurrences
} from '../../shared/occurrences'
import type {
  AccountBalance,
  BalanceBefore,
  BalanceHistory,
  BalanceSnapshotInput,
  PurposeAmount,
  Account,
  AccountInput,
  ApiError,
  Card,
  CardInput,
  Flow,
  FlowInput,
  FlowOverrideInput,
  MonthlyFlows,
  Occurrence,
  Purpose,
  PurposeInput,
  Result,
  SavingsInput
} from '../../shared/ipc'
import { openDatabase as openUserDatabase, type AppDatabase } from './index'
import {
  accounts,
  balanceSnapshots,
  cards,
  flowOverrides,
  flows,
  purposes,
  savingsDetails
} from './schema'
import {
  balanceBefore,
  calculateBalance,
  calculatePurposeAmounts,
  countDateOccurrences,
  monthEnd,
  todayDate,
  type BalanceData
} from '../../shared/balances'

let suppliedDatabase: AppDatabase | null = null
const openDatabase = (): AppDatabase => suppliedDatabase ?? openUserDatabase()

// 동기 서비스 검증에서만 연결을 주입한다. 기본 사용자 DB 초기화를 호출하지 않는다.
export function withDatabase<T>(database: AppDatabase, work: () => T): T {
  const previous = suppliedDatabase
  suppliedDatabase = database
  try {
    return work()
  } finally {
    suppliedDatabase = previous
  }
}

class ServiceError extends Error {
  constructor(
    public kind: ApiError['kind'],
    message: string,
    public field?: string
  ) {
    super(message)
  }
}
const invalid = (field: string, message: string): never => {
  throw new ServiceError('validation', message, field)
}
const missing = (field?: string): never => {
  throw new ServiceError('not_found', '대상을 찾을 수 없습니다.', field)
}
const validId = (id: number): void => {
  if (!Number.isSafeInteger(id) || id < 1) invalid('id', '올바른 항목을 선택해 주세요.')
}
const name = (value: string, field: string, label: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    invalid(field, `${label}은 1~${max}자로 입력해 주세요.`)
  return value.trim()
}
const optional = (value: string | null, field: string, max: number): string | null => {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > max)
    invalid(field, `${field === 'memo' ? '메모' : '입력값'}은 ${max}자 이하로 입력해 주세요.`)
  return value
}
const reference = (value: number | null, field: string): void => {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1))
    invalid(field, '올바른 항목을 선택해 주세요.')
}
const realDate = (value: string): boolean => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return (
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  )
}
const validateSavings = (value: SavingsInput | null): SavingsInput => {
  if (!value || typeof value !== 'object')
    return invalid('savings', '적금·예금 정보를 입력해 주세요.')
  if (!realDate(value.startDate)) invalid('startDate', '실제 가입일을 YYYY-MM-DD로 입력해 주세요.')
  if (!realDate(value.maturityDate) || value.maturityDate <= value.startDate)
    invalid('maturityDate', '만기일은 가입일보다 뒤인 실제 날짜여야 합니다.')
  if (
    typeof value.interestRate !== 'number' ||
    !Number.isFinite(value.interestRate) ||
    value.interestRate < 0 ||
    value.interestRate > 100
  )
    invalid('interestRate', '금리는 0~100 사이의 숫자로 입력해 주세요.')
  if (!INTEREST_TYPES.includes(value.interestType))
    invalid('interestType', '이자 방식을 선택해 주세요.')
  if (!TAX_TYPES.includes(value.taxType)) invalid('taxType', '과세 방식을 선택해 주세요.')
  if (
    value.targetAmount !== null &&
    (!Number.isSafeInteger(value.targetAmount) || value.targetAmount < 0)
  )
    invalid('targetAmount', '목표액은 0원 이상의 정수로 입력해 주세요.')
  return {
    startDate: value.startDate,
    maturityDate: value.maturityDate,
    interestRate: value.interestRate,
    interestType: value.interestType,
    taxType: value.taxType,
    targetAmount: value.targetAmount
  }
}
const validateAccount = (input: AccountInput): AccountInput => {
  if (!input || typeof input !== 'object') invalid('name', '계좌 정보를 입력해 주세요.')
  const cleaned: AccountInput = {
    name: name(input.name, 'name', '계좌 이름', 30),
    bank: name(input.bank, 'bank', '금융기관', 20),
    numberTail: input.numberTail,
    type: input.type,
    purposeId: input.purposeId,
    memo: optional(input.memo, 'memo', 200),
    savings: null
  }
  if (!ACCOUNT_TYPES.includes(cleaned.type)) invalid('type', '계좌 종류를 선택해 주세요.')
  if (
    cleaned.numberTail !== null &&
    (typeof cleaned.numberTail !== 'string' || !/^\d{1,4}$/.test(cleaned.numberTail))
  )
    invalid('numberTail', '끝자리는 숫자 1~4자리로 입력해 주세요.')
  reference(cleaned.purposeId, 'purposeId')
  const savingType = cleaned.type === 'installment' || cleaned.type === 'deposit'
  if (savingType) cleaned.savings = validateSavings(input.savings)
  else cleaned.savings = null
  const db = openDatabase()
  if (
    cleaned.purposeId !== null &&
    !db.select({ id: purposes.id }).from(purposes).where(eq(purposes.id, cleaned.purposeId)).get()
  )
    missing('purposeId')
  return cleaned
}
const validateCard = (input: CardInput, currentAccountId: number | null = null): CardInput => {
  if (!input || typeof input !== 'object') invalid('name', '카드 정보를 입력해 주세요.')
  const cleaned: CardInput = {
    name: name(input.name, 'name', '카드 이름', 30),
    issuer: name(input.issuer, 'issuer', '카드사', 20),
    type: input.type,
    accountId: input.accountId,
    paymentDay: input.paymentDay,
    numberTail: input.numberTail,
    memo: optional(input.memo, 'memo', 200)
  }
  if (!CARD_TYPES.includes(cleaned.type)) invalid('type', '카드 종류를 선택해 주세요.')
  if (
    cleaned.numberTail !== null &&
    (typeof cleaned.numberTail !== 'string' || !/^\d{4}$/.test(cleaned.numberTail))
  )
    invalid('numberTail', '끝자리는 숫자 4자리로 입력해 주세요.')
  if (cleaned.type === 'credit') {
    if (
      !Number.isInteger(cleaned.paymentDay) ||
      cleaned.paymentDay! < 1 ||
      cleaned.paymentDay! > 31
    )
      invalid('paymentDay', '결제일은 1~31의 정수로 입력해 주세요.')
  } else if (cleaned.paymentDay !== null)
    invalid('paymentDay', '체크카드에는 결제일을 입력할 수 없습니다.')
  reference(cleaned.accountId, 'accountId')
  if (cleaned.accountId !== null) {
    const linked = openDatabase()
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, cleaned.accountId))
      .get()
    if (!linked) return missing('accountId')
    if (!linked.isActive && cleaned.accountId !== currentAccountId)
      invalid('accountId', '해지 계좌는 새로 연결할 수 없습니다.')
  }
  return cleaned
}

export function attempt<T>(work: () => T): Result<T> {
  try {
    return { ok: true, data: work() }
  } catch (error) {
    if (error instanceof ServiceError)
      return { ok: false, error: { kind: error.kind, message: error.message, field: error.field } }
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: purposes.name'))
      return {
        ok: false,
        error: { kind: 'duplicate', message: '같은 이름이 이미 있습니다.', field: 'name' }
      }
    console.error('DB 작업 실패:', error)
    return {
      ok: false,
      error: { kind: 'other', message: '작업을 완료하지 못했습니다. 다시 시도해 주세요.' }
    }
  }
}

export function listPurposes(): Purpose[] {
  const db = openDatabase()
  const rows = db.select().from(purposes).orderBy(asc(purposes.sortOrder), asc(purposes.id)).all()
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sortOrder,
    accountCount: db
      .select({ count: sql<number>`count(*)` })
      .from(accounts)
      .where(eq(accounts.purposeId, row.id))
      .get()!.count
  }))
}
export function addPurpose(input: PurposeInput): Purpose {
  const db = openDatabase()
  const cleaned = validatePurpose(input)
  const last = db
    .select({ sortOrder: purposes.sortOrder })
    .from(purposes)
    .orderBy(sql`${purposes.sortOrder} desc`)
    .get()
  const id = db
    .insert(purposes)
    .values({ ...cleaned, sortOrder: (last?.sortOrder ?? -1) + 1 })
    .returning({ id: purposes.id })
    .get().id
  return listPurposes().find((item) => item.id === id)!
}
function validatePurpose(input: PurposeInput, id?: number): PurposeInput {
  if (!input || typeof input !== 'object') invalid('name', '용도 정보를 입력해 주세요.')
  const cleaned = { name: name(input.name, 'name', '용도 이름', 20), color: input.color }
  if (typeof cleaned.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(cleaned.color))
    invalid('color', '팔레트에서 색을 선택해 주세요.')
  const existing = openDatabase()
    .select({ id: purposes.id })
    .from(purposes)
    .where(eq(purposes.name, cleaned.name))
    .get()
  if (existing && existing.id !== id)
    throw new ServiceError('duplicate', '같은 이름의 용도가 이미 있습니다.', 'name')
  return cleaned
}
export function updatePurpose(id: number, input: PurposeInput): Purpose {
  validId(id)
  const db = openDatabase()
  if (!db.select({ id: purposes.id }).from(purposes).where(eq(purposes.id, id)).get()) missing()
  db.update(purposes).set(validatePurpose(input, id)).where(eq(purposes.id, id)).run()
  return listPurposes().find((item) => item.id === id)!
}
export function deletePurpose(id: number): void {
  validId(id)
  const db = openDatabase()
  db.transaction((tx) => {
    if (!tx.select({ id: purposes.id }).from(purposes).where(eq(purposes.id, id)).get()) missing()
    tx.update(accounts).set({ purposeId: null }).where(eq(accounts.purposeId, id)).run()
    tx.delete(purposes).where(eq(purposes.id, id)).run()
  })
}
export function reorderPurposes(ids: number[]): void {
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id)))
    invalid('ids', '용도 순서를 다시 확인해 주세요.')
  const db = openDatabase()
  db.transaction((tx) => {
    const stored = tx
      .select({ id: purposes.id })
      .from(purposes)
      .all()
      .map((row) => row.id)
    if (
      ids.length !== stored.length ||
      new Set(ids).size !== stored.length ||
      stored.some((id) => !ids.includes(id))
    )
      invalid('ids', '용도 순서를 다시 확인해 주세요.')
    ids.forEach((id, sortOrder) =>
      tx.update(purposes).set({ sortOrder }).where(eq(purposes.id, id)).run()
    )
  })
}

export function listAccounts(includeInactive = false): Account[] {
  const db = openDatabase()
  const currentFlows = db
    .select()
    .from(flows)
    .all()
    .filter((flow) => flowStatus(flow.startDate, flow.endDate) !== 'ended')
  const rows = db
    .select({ account: accounts, saving: savingsDetails })
    .from(accounts)
    .leftJoin(savingsDetails, eq(accounts.id, savingsDetails.accountId))
    .orderBy(asc(accounts.id))
    .all()
  return rows
    .filter(({ account }) => includeInactive || account.isActive)
    .map(({ account, saving }) => ({
      id: account.id,
      name: account.name,
      bank: account.bank,
      numberTail: account.numberTail,
      type: account.type,
      purposeId: account.purposeId,
      memo: account.memo,
      isActive: account.isActive,
      sortOrder: account.sortOrder,
      flowCount: currentFlows.filter(
        (flow) => flow.fromAccountId === account.id || flow.toAccountId === account.id
      ).length,
      monthlyContribution: currentFlows
        .filter(
          (flow) =>
            flow.kind === 'transfer' &&
            flow.cycle === 'monthly' &&
            flow.toAccountId === account.id &&
            flowStatus(flow.startDate, flow.endDate) === 'active'
        )
        .reduce((sum, flow) => sum + flow.amount, 0),
      savings: saving && {
        startDate: saving.startDate,
        maturityDate: saving.maturityDate,
        interestRate: saving.interestRate,
        interestType: saving.interestType,
        taxType: saving.taxType,
        targetAmount: saving.targetAmount
      }
    }))
}
function saveSavings(
  db: ReturnType<typeof openDatabase>,
  id: number,
  saving: SavingsInput | null
): void {
  if (saving)
    db.insert(savingsDetails)
      .values({ accountId: id, ...saving })
      .onConflictDoUpdate({ target: savingsDetails.accountId, set: saving })
      .run()
  else db.delete(savingsDetails).where(eq(savingsDetails.accountId, id)).run()
}
export function addAccount(input: AccountInput): Account {
  const cleaned = validateAccount(input)
  const db = openDatabase()
  const id = db.transaction((tx) => {
    const { savings, ...account } = cleaned
    const row = tx.insert(accounts).values(account).returning({ id: accounts.id }).get()
    saveSavings(tx as typeof db, row.id, savings)
    return row.id
  })
  return listAccounts(true).find((item) => item.id === id)!
}
export function updateAccount(id: number, input: AccountInput): Account {
  validId(id)
  const db = openDatabase()
  const cleaned = validateAccount(input)
  db.transaction((tx) => {
    const existing = tx
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get()
    if (!existing) return missing()
    if (!existing.isActive) invalid('id', '해지 계좌는 수정할 수 없습니다.')
    const { savings, ...account } = cleaned
    tx.update(accounts).set(account).where(eq(accounts.id, id)).run()
    saveSavings(tx as typeof db, id, savings)
  })
  return listAccounts(true).find((item) => item.id === id)!
}
export function setAccountActive(id: number, active: boolean): void {
  validId(id)
  const result = openDatabase()
    .update(accounts)
    .set({ isActive: active })
    .where(eq(accounts.id, id))
    .run()
  if (!result.changes) missing()
}

export function listCards(includeInactive = false): Card[] {
  const db = openDatabase()
  const currentFlows = db
    .select()
    .from(flows)
    .all()
    .filter((flow) => flowStatus(flow.startDate, flow.endDate) !== 'ended')
  const rows = db
    .select({ card: cards, linked: accounts })
    .from(cards)
    .leftJoin(accounts, eq(cards.accountId, accounts.id))
    .orderBy(asc(cards.id))
    .all()
  return rows
    .filter(({ card }) => includeInactive || card.isActive)
    .map(({ card, linked }) => ({
      id: card.id,
      name: card.name,
      issuer: card.issuer,
      type: card.type,
      accountId: card.accountId,
      paymentDay: card.paymentDay,
      numberTail: card.numberTail,
      memo: card.memo,
      isActive: card.isActive,
      flowCount: currentFlows.filter((flow) => flow.kind === 'payment' && flow.cardId === card.id)
        .length,
      linkedAccount: linked && { name: linked.name, bank: linked.bank, isActive: linked.isActive }
    }))
}
export function addCard(input: CardInput): Card {
  const cleaned = validateCard(input)
  const id = openDatabase().insert(cards).values(cleaned).returning({ id: cards.id }).get().id
  return listCards(true).find((item) => item.id === id)!
}
export function updateCard(id: number, input: CardInput): Card {
  validId(id)
  const db = openDatabase()
  const current = db
    .select({ accountId: cards.accountId, isActive: cards.isActive })
    .from(cards)
    .where(eq(cards.id, id))
    .get()
  if (!current) return missing()
  if (!current.isActive) invalid('id', '해지 카드는 수정할 수 없습니다.')
  db.update(cards).set(validateCard(input, current.accountId)).where(eq(cards.id, id)).run()
  return listCards(true).find((item) => item.id === id)!
}
export function setCardActive(id: number, active: boolean): void {
  validId(id)
  const result = openDatabase()
    .update(cards)
    .set({ isActive: active })
    .where(eq(cards.id, id))
    .run()
  if (!result.changes) missing()
}

const flowCategories: Record<FlowInput['kind'], FlowInput['category'][]> = {
  income: ['salary', 'other'],
  transfer: ['savings', 'allocation', 'other'],
  payment: ['subscription', 'insurance', 'telecom', 'utility', 'loan', 'other']
}
const today = (): string => {
  const date = new Date()
  const year = date.getFullYear()
  return `${year.toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const flowStatus = (startDate: string, endDate: string | null): Flow['status'] => {
  const now = today()
  return endDate !== null && endDate <= now ? 'ended' : startDate > now ? 'scheduled' : 'active'
}
const previousDay = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
const validateFlow = (input: FlowInput, previous?: Flow): FlowInput => {
  if (!input || typeof input !== 'object') invalid('name', '흐름 정보를 입력해 주세요.')
  const cleaned: FlowInput = {
    name: name(input.name, 'name', '흐름 이름', 30),
    kind: input.kind,
    amount: input.amount,
    isVariable: input.isVariable,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    cardId: input.cardId,
    category: input.category,
    cycle: input.cycle,
    day: input.day,
    month: input.month,
    startDate: input.startDate,
    endDate: input.endDate,
    memo: input.memo
  }
  if (!Object.hasOwn(flowCategories, cleaned.kind)) invalid('kind', '흐름 종류를 선택해 주세요.')
  if (previous && cleaned.kind !== previous.kind) invalid('kind', '흐름 종류는 바꿀 수 없습니다.')
  if (!Number.isSafeInteger(cleaned.amount) || cleaned.amount < 0)
    invalid('amount', '금액은 0원 이상의 정수로 입력해 주세요.')
  if (typeof cleaned.isVariable !== 'boolean')
    invalid('isVariable', '변동 금액 여부를 선택해 주세요.')
  if (!flowCategories[cleaned.kind].includes(cleaned.category))
    invalid('category', '종류에 맞는 분류를 선택해 주세요.')
  if (cleaned.cycle !== 'monthly' && cleaned.cycle !== 'yearly')
    invalid('cycle', '주기를 선택해 주세요.')
  if (!Number.isInteger(cleaned.day) || cleaned.day < 1 || cleaned.day > 31)
    invalid('day', '지정일은 1~31의 정수로 입력해 주세요.')
  if (cleaned.cycle === 'monthly') {
    if (cleaned.month !== null) invalid('month', '매월 흐름에는 지정 월을 입력할 수 없습니다.')
  } else if (!Number.isInteger(cleaned.month) || cleaned.month! < 1 || cleaned.month! > 12)
    invalid('month', '지정 월은 1~12의 정수로 입력해 주세요.')
  if (!realDate(cleaned.startDate))
    invalid('startDate', '시작일은 실제 날짜를 YYYY-MM-DD로 입력해 주세요.')
  if (
    cleaned.endDate !== null &&
    (!realDate(cleaned.endDate) || cleaned.endDate < cleaned.startDate)
  )
    invalid('endDate', '종료일은 시작일 이후의 실제 날짜여야 합니다.')
  cleaned.memo = optional(cleaned.memo, 'memo', 200)
  for (const field of ['fromAccountId', 'toAccountId', 'cardId'] as const)
    reference(cleaned[field], field)
  if (cleaned.kind === 'income') {
    if (cleaned.fromAccountId !== null)
      invalid('fromAccountId', '수입에는 보내는 계좌를 넣을 수 없습니다.')
    if (cleaned.toAccountId === null) invalid('toAccountId', '받는 계좌를 선택해 주세요.')
  } else if (cleaned.kind === 'transfer') {
    if (cleaned.fromAccountId === null) invalid('fromAccountId', '보내는 계좌를 선택해 주세요.')
    if (cleaned.toAccountId === null) invalid('toAccountId', '받는 계좌를 선택해 주세요.')
    if (cleaned.fromAccountId === cleaned.toAccountId)
      invalid('toAccountId', '서로 다른 계좌를 선택해 주세요.')
  } else {
    if (cleaned.fromAccountId === null) invalid('fromAccountId', '보내는 계좌를 선택해 주세요.')
    if (cleaned.toAccountId !== null)
      invalid('toAccountId', '정기 결제에는 받는 계좌를 넣을 수 없습니다.')
  }
  if (cleaned.kind !== 'payment' && cleaned.cardId !== null)
    invalid('cardId', '결제 카드는 정기 결제에만 지정할 수 있습니다.')
  const db = openDatabase()
  for (const field of ['fromAccountId', 'toAccountId'] as const) {
    const id = cleaned[field]
    if (id === null) continue
    const account = db
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get()
    if (!account) return invalid(field, '존재하는 계좌를 선택해 주세요.')
    if (!account.isActive && id !== previous?.[field])
      invalid(field, '해지 계좌는 새로 선택할 수 없습니다.')
  }
  if (cleaned.cardId !== null) {
    const card = db
      .select({ isActive: cards.isActive })
      .from(cards)
      .where(eq(cards.id, cleaned.cardId))
      .get()
    if (!card) return invalid('cardId', '존재하는 결제 카드를 선택해 주세요.')
    if (!card.isActive && cleaned.cardId !== previous?.cardId)
      invalid('cardId', '해지 카드는 새로 선택할 수 없습니다.')
  }
  return cleaned
}

export function listFlows(includeEnded = false): Flow[] {
  const db = openDatabase()
  const accountMap = new Map(
    db
      .select()
      .from(accounts)
      .all()
      .map((item) => [item.id, item])
  )
  const cardMap = new Map(
    db
      .select()
      .from(cards)
      .all()
      .map((item) => [item.id, item])
  )
  const counts = new Map<number, number>()
  for (const item of db.select({ flowId: flowOverrides.flowId }).from(flowOverrides).all())
    counts.set(item.flowId, (counts.get(item.flowId) ?? 0) + 1)
  const linkedAccount = (id: number | null): Flow['fromAccount'] => {
    const item = id === null ? null : accountMap.get(id)
    return item ? { name: item.name, bank: item.bank, isActive: item.isActive } : null
  }
  const linkedCard = (id: number | null): Flow['card'] => {
    const item = id === null ? null : cardMap.get(id)
    return item ? { name: item.name, issuer: item.issuer, isActive: item.isActive } : null
  }
  return db
    .select()
    .from(flows)
    .orderBy(asc(flows.id))
    .all()
    .map((item) => ({
      ...item,
      status: flowStatus(item.startDate, item.endDate),
      fromAccount: linkedAccount(item.fromAccountId),
      toAccount: linkedAccount(item.toAccountId),
      card: linkedCard(item.cardId),
      overrideCount: counts.get(item.id) ?? 0,
      sortOrder: item.id
    }))
    .filter((item) => includeEnded || item.status !== 'ended')
}
export function addFlow(input: FlowInput): Flow {
  const cleaned = validateFlow(input)
  const id = openDatabase().insert(flows).values(cleaned).returning({ id: flows.id }).get().id
  return listFlows(true).find((item) => item.id === id)!
}
export function updateFlow(id: number, input: FlowInput, effectiveStartDate?: string | null): Flow {
  validId(id)
  const db = openDatabase()
  const previous = listFlows(true).find((item) => item.id === id)
  if (!previous) return missing('id')
  const cleaned = validateFlow(input, previous)
  const changed = (
    ['amount', 'cycle', 'month', 'day', 'fromAccountId', 'toAccountId'] as const
  ).some((field) => cleaned[field] !== previous[field])
  if (
    changed &&
    (!effectiveStartDate ||
      !realDate(effectiveStartDate) ||
      effectiveStartDate < cleaned.startDate ||
      (cleaned.endDate !== null && effectiveStartDate > cleaned.endDate))
  )
    invalid('effectiveStartDate', '적용 시작일은 시작일과 종료일 사이의 실제 날짜여야 합니다.')
  if (!changed || effectiveStartDate === cleaned.startDate) {
    db.update(flows).set(cleaned).where(eq(flows.id, id)).run()
    return listFlows(true).find((item) => item.id === id)!
  }
  const splitDate = effectiveStartDate!
  const oldPart = {
    name: cleaned.name,
    category: cleaned.category,
    isVariable: cleaned.isVariable,
    cardId: cleaned.cardId,
    startDate: cleaned.startDate,
    endDate: previousDay(splitDate),
    memo: cleaned.memo
  }
  const newId = db.transaction((tx) => {
    tx.update(flows).set(oldPart).where(eq(flows.id, id)).run()
    return tx
      .insert(flows)
      .values({ ...cleaned, startDate: splitDate })
      .returning({ id: flows.id })
      .get().id
  })
  return listFlows(true).find((item) => item.id === newId)!
}
export function endFlow(id: number, endDate: string): void {
  validId(id)
  const db = openDatabase()
  const row = db.select({ startDate: flows.startDate }).from(flows).where(eq(flows.id, id)).get()
  if (!row) return missing('id')
  if (!realDate(endDate) || endDate < row.startDate)
    invalid('endDate', '종료일은 시작일 이후의 실제 날짜여야 합니다.')
  db.update(flows).set({ endDate }).where(eq(flows.id, id)).run()
}
export function resumeFlow(id: number): void {
  validId(id)
  const result = openDatabase().update(flows).set({ endDate: null }).where(eq(flows.id, id)).run()
  if (!result.changes) missing('id')
}
export function deleteFlow(id: number): void {
  validId(id)
  const db = openDatabase()
  db.transaction((tx) => {
    if (!tx.select({ id: flows.id }).from(flows).where(eq(flows.id, id)).get()) missing('id')
    tx.delete(flowOverrides).where(eq(flowOverrides.flowId, id)).run()
    tx.delete(flows).where(eq(flows.id, id)).run()
  })
}

export function listMonthlyFlows(year: number, month: number): MonthlyFlows {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999)
    invalid('year', '연도를 다시 확인해 주세요.')
  if (!Number.isSafeInteger(month) || month < 1 || month > 12)
    invalid('month', '월을 다시 확인해 주세요.')
  const db = openDatabase()
  const flowRows = listFlows(true)
  const overrideRows = db.select().from(flowOverrides).all()
  const exceptions = new Map(
    overrideRows.map((row) => [`${row.flowId}:${row.occurrenceDate}`, row])
  )
  const occurrences: Occurrence[] = []
  for (const flow of flowRows) {
    const date = occurrenceDate(flow, year, month)
    if (!date) continue
    const exception = exceptions.get(`${flow.id}:${date}`)
    const action = exception ? (exception.skipped ? 'skip' : 'amount') : 'original'
    occurrences.push({
      flow,
      date,
      kind: flow.kind,
      sortOrder: flow.sortOrder,
      originalAmount: flow.amount,
      amount: action === 'skip' ? 0 : (exception?.actualAmount ?? flow.amount),
      action,
      actualAmount: exception?.actualAmount ?? null,
      memo: exception?.memo ?? null,
      fromAccountId: flow.fromAccountId,
      toAccountId: flow.toAccountId
    })
  }
  occurrences.sort(compareOccurrences)
  const totals = sumOccurrences(occurrences)
  const purposeOrder = new Map(listPurposes().map((purpose) => [purpose.id, purpose.sortOrder]))
  const accountOrder = new Map(
    listAccounts(true)
      .sort((a, b) => {
        const rank = (account: Account): number =>
          account.purposeId === null ? Infinity : (purposeOrder.get(account.purposeId) ?? Infinity)
        return rank(a) - rank(b) || a.sortOrder - b.sortOrder || a.id - b.id
      })
      .map((account, index) => [account.id, index])
  )
  totals.accounts.sort(
    (a, b) => (accountOrder.get(a.id) ?? Infinity) - (accountOrder.get(b.id) ?? Infinity)
  )
  const data: BalanceData = {
    flows: flowRows,
    overrides: overrideRows,
    snapshots: db.select().from(balanceSnapshots).all()
  }
  const date = monthEnd(year, month)
  const now = todayDate()
  const accountTotals = totals.accounts.map((total) => {
    const balance = calculateBalance(total.id, date, data, now)
    return { ...total, balance: balance.balance, predicted: balance.predicted }
  })
  return { year, month, occurrences, totals: { ...totals, accounts: accountTotals } }
}

const queryDate = (date: string | undefined): string => {
  const value = date === undefined ? todayDate() : date
  if (!isRealDate(value)) invalid('date', '실제 날짜를 YYYY-MM-DD로 입력해 주세요.')
  return value
}
const correctionDate = (date: string): string => {
  if (typeof date !== 'string') invalid('date', '보정 날짜를 YYYY-MM-DD로 입력해 주세요.')
  const value = queryDate(date)
  if (value > todayDate()) invalid('date', '보정 날짜는 오늘이거나 이전 날짜여야 합니다.')
  return value
}
const balanceAccount = (accountId: number, active = false): void => {
  if (!Number.isSafeInteger(accountId) || accountId < 1)
    invalid('accountId', '올바른 계좌를 선택해 주세요.')
  const account = openDatabase().select().from(accounts).where(eq(accounts.id, accountId)).get()
  if (!account) return missing('accountId')
  if (active && !account.isActive)
    invalid('accountId', '해지 계좌의 보정은 저장하거나 삭제할 수 없습니다.')
}
const readBalanceData = (): BalanceData => {
  const db = openDatabase()
  return {
    snapshots: db.select().from(balanceSnapshots).all(),
    flows: db.select().from(flows).all(),
    overrides: db.select().from(flowOverrides).all()
  }
}
export function listBalances(date?: string): AccountBalance[] {
  const value = queryDate(date)
  const db = openDatabase()
  const data = readBalanceData()
  const now = todayDate()
  return db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.sortOrder), asc(accounts.id))
    .all()
    .map((account) => calculateBalance(account.id, value, data, now))
}
export function listPurposeAmounts(date?: string): PurposeAmount[] {
  const value = queryDate(date)
  const db = openDatabase()
  const data = readBalanceData()
  const accountRows = db.select().from(accounts).all()
  const now = todayDate()
  return calculatePurposeAmounts(
    db
      .select()
      .from(purposes)
      .orderBy(asc(purposes.sortOrder))
      .all()
      .map((row) => row.id),
    accountRows,
    accountRows.map((row) => calculateBalance(row.id, value, data, now))
  )
}
export function listBalanceSnapshots(accountId: number): BalanceHistory[] {
  balanceAccount(accountId)
  const data = readBalanceData()
  return data.snapshots
    .filter((row) => row.accountId === accountId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((row) => {
      const beforeBalance = balanceBefore(accountId, row.date, data)
      return {
        ...row,
        beforeBalance,
        difference: beforeBalance === null ? null : row.balance - beforeBalance
      }
    })
}
export function getBalanceBefore(accountId: number, date: string): BalanceBefore {
  balanceAccount(accountId)
  correctionDate(date)
  const data = readBalanceData()
  return {
    beforeBalance: balanceBefore(accountId, date, data),
    occurrenceCount: countDateOccurrences(accountId, date, data),
    existing: data.snapshots.find((row) => row.accountId === accountId && row.date === date) ?? null
  }
}
export function saveBalanceSnapshot(input: BalanceSnapshotInput): void {
  if (!input || typeof input !== 'object') invalid('balance', '보정 정보를 입력해 주세요.')
  balanceAccount(input.accountId, true)
  if (typeof input.date !== 'string') invalid('date', '보정 날짜를 YYYY-MM-DD로 입력해 주세요.')
  correctionDate(input.date)
  if (!Number.isSafeInteger(input.balance))
    invalid('balance', '실제 잔액은 원 단위 정수로 입력해 주세요.')
  const memo = optional(input.memo, 'memo', 200)
  const db = openDatabase()
  const key = and(
    eq(balanceSnapshots.accountId, input.accountId),
    eq(balanceSnapshots.date, input.date)
  )
  const existing = db.select({ id: balanceSnapshots.id }).from(balanceSnapshots).where(key).get()
  if (existing) db.update(balanceSnapshots).set({ balance: input.balance, memo }).where(key).run()
  else
    db.insert(balanceSnapshots)
      .values({ accountId: input.accountId, date: input.date, balance: input.balance, memo })
      .run()
}
export function deleteBalanceSnapshot(id: number): void {
  validId(id)
  const db = openDatabase()
  const row = db.select().from(balanceSnapshots).where(eq(balanceSnapshots.id, id)).get()
  if (!row) return missing('id')
  balanceAccount(row.accountId, true)
  db.delete(balanceSnapshots).where(eq(balanceSnapshots.id, id)).run()
}

export function saveFlowOverride(input: FlowOverrideInput): void {
  if (!input || typeof input !== 'object') invalid('flowId', '회차 정보를 다시 확인해 주세요.')
  validId(input.flowId)
  const db = openDatabase()
  const flow = db.select().from(flows).where(eq(flows.id, input.flowId)).get()
  if (!flow) return missing('flowId')
  if (!isRealDate(input.occurrenceDate))
    invalid('occurrenceDate', '회차 날짜를 YYYY-MM-DD로 입력해 주세요.')
  const [year, month] = input.occurrenceDate.split('-').map(Number)
  if (occurrenceDate(flow, year, month) !== input.occurrenceDate)
    invalid('occurrenceDate', '이 흐름의 회차 날짜가 아닙니다.')
  if (!['original', 'amount', 'skip'].includes(input.action))
    invalid('action', '처리를 선택해 주세요.')
  if (input.action === 'amount') {
    if (!Number.isSafeInteger(input.actualAmount) || input.actualAmount! < 0)
      invalid('actualAmount', '이번 회차 금액은 0원 이상의 정수로 입력해 주세요.')
  } else if (input.actualAmount !== null)
    invalid('actualAmount', '이 처리에는 금액을 넣을 수 없습니다.')
  if (input.action === 'original') {
    if (input.memo !== null) invalid('memo', '원래대로 처리에는 메모를 넣을 수 없습니다.')
  } else if (input.memo !== null && (typeof input.memo !== 'string' || input.memo.length > 200))
    invalid('memo', '메모는 200자 이하로 입력해 주세요.')
  const key = and(
    eq(flowOverrides.flowId, input.flowId),
    eq(flowOverrides.occurrenceDate, input.occurrenceDate)
  )
  if (input.action === 'original') {
    db.delete(flowOverrides).where(key).run()
    return
  }
  const values = {
    actualAmount: input.action === 'amount' ? input.actualAmount : null,
    skipped: input.action === 'skip',
    memo: input.memo
  }
  const existing = db.select({ id: flowOverrides.id }).from(flowOverrides).where(key).get()
  if (existing) db.update(flowOverrides).set(values).where(eq(flowOverrides.id, existing.id)).run()
  else
    db.insert(flowOverrides)
      .values({ flowId: input.flowId, occurrenceDate: input.occurrenceDate, ...values })
      .run()
}
