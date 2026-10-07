import type { FlowCycle, FlowKind } from './domain'

export interface OccurrenceRule {
  cycle: FlowCycle
  month: number | null
  day: number
  startDate: string
  endDate: string | null
}

export const isRealDate = (value: string): boolean => {
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

// 지정일이 없는 달에는 그 달의 마지막 날을 회차 날짜로 삼는다.
export function occurrenceDate(rule: OccurrenceRule, year: number, month: number): string | null {
  if (
    !Number.isSafeInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isSafeInteger(month) ||
    month < 1 ||
    month > 12
  )
    return null
  if (rule.cycle === 'yearly' && rule.month !== month) return null
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(rule.day, lastDay)).padStart(2, '0')}`
  return date >= rule.startDate && (rule.endDate === null || date <= rule.endDate) ? date : null
}

const kindOrder: Record<FlowKind, number> = { income: 0, transfer: 1, payment: 2 }
export function compareOccurrences(
  a: { date: string; kind: FlowKind; sortOrder: number },
  b: { date: string; kind: FlowKind; sortOrder: number }
): number {
  return (
    a.date.localeCompare(b.date) ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    a.sortOrder - b.sortOrder
  )
}

export function sumOccurrences<
  T extends {
    kind: FlowKind
    amount: number
    fromAccountId: number | null
    toAccountId: number | null
  }
>(
  items: T[]
): {
  income: number
  transfer: number
  payment: number
  remaining: number
  accounts: { id: number; incoming: number; outgoing: number }[]
} {
  const totals = { income: 0, transfer: 0, payment: 0 }
  const accountTotals = new Map<number, { id: number; incoming: number; outgoing: number }>()
  const account = (id: number): { id: number; incoming: number; outgoing: number } => {
    if (!accountTotals.has(id)) accountTotals.set(id, { id, incoming: 0, outgoing: 0 })
    return accountTotals.get(id)!
  }
  for (const item of items) {
    totals[item.kind] += item.amount
    if (item.fromAccountId !== null) account(item.fromAccountId).outgoing += item.amount
    if (item.toAccountId !== null) account(item.toAccountId).incoming += item.amount
  }
  return {
    ...totals,
    remaining: totals.income - totals.payment,
    accounts: [...accountTotals.values()]
  }
}
