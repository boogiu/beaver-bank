import { calculateBalance, monthEnd, type BalanceData } from './balances'
import { occurrenceDate } from './occurrences'
import type { MaturityEstimate, SavingsInput } from './ipc'

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000
export const daysBetween = (start: string, end: string): number => dayNumber(end) - dayNumber(start)

// 저장된 금리의 십진 표기를 그대로 정수 분수로 읽는다 (지수 표기도 포함).
function decimalFraction(value: number): [bigint, bigint] {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fraction = ''] = coefficient.split('.')
  const scale = fraction.length - Number(exponent)
  const numerator = BigInt(whole + fraction)
  return scale >= 0 ? [numerator, 10n ** BigInt(scale)] : [numerator * 10n ** BigInt(-scale), 1n]
}

function changes(
  accountId: number,
  start: string,
  end: string,
  data: BalanceData
): Map<string, bigint> {
  const deltas = new Map<string, bigint>()
  const exceptions = new Map(
    data.overrides.map((row) => [`${row.flowId}:${row.occurrenceDate}`, row])
  )
  for (const flow of data.flows) {
    if (flow.fromAccountId !== accountId && flow.toAccountId !== accountId) continue
    const first = start > flow.startDate ? start : flow.startDate
    const last = flow.endDate && flow.endDate < end ? flow.endDate : end
    if (first > last) continue
    const [y1, m1] = first.split('-').map(Number)
    const [y2, m2] = last.split('-').map(Number)
    for (let index = y1 * 12 + m1 - 1; index <= y2 * 12 + m2 - 1; index++) {
      const date = occurrenceDate(flow, Math.floor(index / 12), (index % 12) + 1)
      if (!date || date < first || date > last) continue
      const exception = exceptions.get(`${flow.id}:${date}`)
      const amount = BigInt(exception?.skipped ? 0 : (exception?.actualAmount ?? flow.amount))
      const delta =
        (flow.toAccountId === accountId ? amount : 0n) -
        (flow.fromAccountId === accountId ? amount : 0n)
      deltas.set(date, (deltas.get(date) ?? 0n) + delta)
    }
  }
  return deltas
}

// 첫 보정 이전에만 역산한다. 일반 잔액 조회의 null 규칙에는 관여하지 않는다.
export function estimateBalance(accountId: number, date: string, data: BalanceData): number | null {
  const first = data.snapshots
    .filter((row) => row.accountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!first) return null
  if (date >= first.date) return calculateBalance(accountId, date, data).balance
  let balance = BigInt(first.balance)
  for (const [day, delta] of changes(accountId, date, first.date, data)) {
    if (day > date) balance -= delta
  }
  return Number(balance)
}

function anniversary(start: string, months: number): string {
  const [year, month, day] = start.split('-').map(Number)
  const index = year * 12 + month - 1 + months
  const last = monthEnd(Math.floor(index / 12), (index % 12) + 1)
  return `${last.slice(0, 8)}${String(Math.min(day, Number(last.slice(8)))).padStart(2, '0')}`
}

export function calculateMaturity(
  accountId: number,
  savings: SavingsInput,
  data: BalanceData
): MaturityEstimate | null {
  const principal = estimateBalance(accountId, savings.maturityDate, data)
  if (principal === null) return null
  const { startDate, maturityDate } = savings
  const boundaries = new Set([startDate, maturityDate])
  for (const date of changes(accountId, startDate, maturityDate, data).keys()) boundaries.add(date)
  for (const row of data.snapshots) {
    if (row.accountId === accountId && row.date > startDate && row.date < maturityDate)
      boundaries.add(row.date)
  }
  // 구간마다 잔액이 일정하다. 날마다 잔액을 다시 계산하지 않는다.
  const dates = [...boundaries].sort()
  const spans = dates.slice(0, -1).map((date, index) => ({
    start: dayNumber(date),
    end: dayNumber(dates[index + 1]),
    balance: BigInt(Math.max(0, estimateBalance(accountId, date, data)!))
  }))
  const [rate, scale] = decimalFraction(savings.interestRate)
  let interest = 0n
  let spanIndex = 0
  let start = startDate
  for (let month = 1; start < maturityDate; month++) {
    const next = savings.interestType === 'simple' ? maturityDate : anniversary(startDate, month)
    const end = next < maturityDate ? next : maturityDate
    const a = dayNumber(start),
      b = dayNumber(end)
    let product = 0n
    while (spanIndex < spans.length && spans[spanIndex].start < b) {
      const span = spans[spanIndex]
      product += span.balance * BigInt(Math.min(b, span.end) - Math.max(a, span.start))
      if (span.end > b) break
      spanIndex++
    }
    interest += ((product + interest * BigInt(b - a)) * rate) / (36_500n * scale)
    start = end
  }
  const taxRate = { normal: 154n, preferential: 95n, tax_free: 0n }[savings.taxType]
  const tax = (interest * taxRate) / 1000n
  const afterTaxInterest = interest - tax
  const maturityPrincipal = BigInt(principal)
  const total = maturityPrincipal + afterTaxInterest
  const limit = BigInt(Number.MAX_SAFE_INTEGER)
  if (
    [maturityPrincipal, interest, tax, afterTaxInterest, total].some(
      (value) => value < -limit || value > limit
    )
  )
    return null
  return {
    principal: Number(maturityPrincipal),
    preTaxInterest: Number(interest),
    tax: Number(tax),
    afterTaxInterest: Number(afterTaxInterest),
    total: Number(total)
  }
}
