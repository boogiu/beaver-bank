import type { AccountBalance, BalanceSnapshot, FlowInput, PurposeAmount } from './ipc'
import { occurrenceDate } from './occurrences'

export type BalanceFlow = FlowInput & { id: number }
export interface BalanceOverride {
  flowId: number
  occurrenceDate: string
  skipped: boolean
  actualAmount: number | null
}
export interface BalanceData {
  snapshots: BalanceSnapshot[]
  flows: BalanceFlow[]
  overrides: BalanceOverride[]
}

export function todayDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function monthEnd(year: number, month: number): string {
  const date = new Date(0)
  date.setUTCFullYear(year, month, 0)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

// 이미 읽은 자료만 사용한다. 흐름의 기간과 계산 구간이 겹치는 달만 순회한다.
export function calculateBalance(
  accountId: number,
  date: string,
  data: BalanceData,
  today = todayDate(),
  excludeDate?: string
): AccountBalance {
  const base = data.snapshots
    .filter((row) => row.accountId === accountId && row.date <= date && row.date !== excludeDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  const result: AccountBalance = {
    accountId,
    date,
    balance: base?.balance ?? null,
    baseDate: base?.date ?? null,
    baseBalance: base?.balance ?? null,
    predicted: !!base && date > today
  }
  if (!base) return result
  const exceptions = new Map(
    data.overrides.map((row) => [`${row.flowId}:${row.occurrenceDate}`, row])
  )
  for (const flow of data.flows) {
    if (flow.fromAccountId !== accountId && flow.toAccountId !== accountId) continue
    const start = flow.startDate > base.date ? flow.startDate : base.date
    const end = flow.endDate && flow.endDate < date ? flow.endDate : date
    if (start > end) continue
    const [startYear, startMonth] = start.split('-').map(Number)
    const [endYear, endMonth] = end.split('-').map(Number)
    for (
      let index = startYear * 12 + startMonth - 1;
      index <= endYear * 12 + endMonth - 1;
      index++
    ) {
      const day = occurrenceDate(flow, Math.floor(index / 12), (index % 12) + 1)
      if (!day || day <= base.date || day > date) continue
      const exception = exceptions.get(`${flow.id}:${day}`)
      const amount = exception?.skipped ? 0 : (exception?.actualAmount ?? flow.amount)
      if (flow.toAccountId === accountId) result.balance! += amount
      if (flow.fromAccountId === accountId) result.balance! -= amount
    }
  }
  return result
}

export function balanceBefore(accountId: number, date: string, data: BalanceData): number | null {
  return calculateBalance(accountId, date, data, todayDate(), date).balance
}

export function countDateOccurrences(accountId: number, date: string, data: BalanceData): number {
  const [year, month] = date.split('-').map(Number)
  const skipped = new Set(
    data.overrides.filter((row) => row.skipped).map((row) => `${row.flowId}:${row.occurrenceDate}`)
  )
  return data.flows.filter(
    (flow) =>
      (flow.fromAccountId === accountId || flow.toAccountId === accountId) &&
      occurrenceDate(flow, year, month) === date &&
      !skipped.has(`${flow.id}:${date}`)
  ).length
}

export function calculatePurposeAmounts(
  purposeIds: number[],
  accounts: { id: number; purposeId: number | null; isActive: boolean }[],
  balances: AccountBalance[]
): PurposeAmount[] {
  const amounts = new Map(balances.map((row) => [row.accountId, row.balance]))
  return [...purposeIds, null].map((purposeId) => {
    const members = accounts.filter((row) => row.isActive && row.purposeId === purposeId)
    const known = members
      .map((row) => amounts.get(row.id) ?? null)
      .filter((value) => value !== null)
    return {
      purposeId,
      amount: members.length && !known.length ? null : known.reduce((sum, value) => sum + value, 0),
      accountCount: members.length,
      missingCount: members.length - known.length
    }
  })
}
