import { asc, eq, sql } from 'drizzle-orm'
import { ACCOUNT_TYPES, CARD_TYPES, INTEREST_TYPES, TAX_TYPES } from '../../shared/domain'
import type {
  Account,
  AccountInput,
  ApiError,
  Card,
  CardInput,
  Purpose,
  PurposeInput,
  Result,
  SavingsInput
} from '../../shared/ipc'
import { openDatabase } from './index'
import { accounts, cards, purposes, savingsDetails } from './schema'

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
    if (error instanceof Error && error.message.includes('UNIQUE constraint'))
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
  const rows = openDatabase()
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
