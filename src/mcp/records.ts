import type {
  Account,
  AccountBalance,
  BalanceHistory,
  Card,
  Flow,
  Occurrence,
  Purpose
} from '../shared/ipc'

type MemoFields = { memo: string | null; hasMemo?: never } | { hasMemo: boolean; memo?: never }
type AccountRecord = Omit<Account, 'sortOrder' | 'memo'> &
  MemoFields & {
    purposeName: string | null
    balance: Omit<AccountBalance, 'accountId' | 'balance'> & { amount: number | null }
  }
type OccurrenceRecord = Pick<Occurrence, 'date' | 'amount' | 'originalAmount' | 'action'> &
  Pick<Flow, 'kind' | 'category' | 'isVariable' | 'name'> &
  MemoFields & {
    flowId: number
    fromAccountId: number | null
    fromAccountName: string | null
    toAccountId: number | null
    toAccountName: string | null
    cardId: number | null
    cardName: string | null
  }

function memoFields(memo: string | null, memos: boolean): MemoFields {
  return memos ? { memo } : { hasMemo: memo !== null && memo !== '' }
}
function accountLink(value: Flow['fromAccount']): Flow['fromAccount'] {
  return value === null ? null : { name: value.name, bank: value.bank, isActive: value.isActive }
}
export function purposeRecord(p: Purpose): Purpose {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    sortOrder: p.sortOrder,
    accountCount: p.accountCount
  }
}
export function accountRecord(
  a: Account,
  balance: AccountBalance,
  purposes: Purpose[],
  memos: boolean
): AccountRecord {
  const purpose = purposes.find((p) => p.id === a.purposeId)
  const s = a.savings
  return {
    id: a.id,
    name: a.name,
    bank: a.bank,
    numberTail: a.numberTail,
    type: a.type,
    purposeId: purpose?.id ?? null,
    purposeName: purpose?.name ?? null,
    isActive: a.isActive,
    ...memoFields(a.memo, memos),
    savings:
      s === null
        ? null
        : {
            startDate: s.startDate,
            maturityDate: s.maturityDate,
            interestRate: s.interestRate,
            interestType: s.interestType,
            taxType: s.taxType,
            targetAmount: s.targetAmount
          },
    flowCount: a.flowCount,
    monthlyContribution: a.monthlyContribution,
    balance: {
      date: balance.date,
      amount: balance.balance,
      predicted: balance.predicted,
      baseDate: balance.baseDate,
      baseBalance: balance.baseBalance
    }
  }
}
export function cardRecord(c: Card, memos: boolean): Omit<Card, 'memo'> & MemoFields {
  return {
    id: c.id,
    name: c.name,
    issuer: c.issuer,
    type: c.type,
    accountId: c.accountId,
    linkedAccount: accountLink(c.linkedAccount),
    paymentDay: c.paymentDay,
    numberTail: c.numberTail,
    isActive: c.isActive,
    ...memoFields(c.memo, memos),
    flowCount: c.flowCount
  }
}
export function flowRecord(f: Flow, memos: boolean): Omit<Flow, 'sortOrder' | 'memo'> & MemoFields {
  return {
    id: f.id,
    name: f.name,
    kind: f.kind,
    category: f.category,
    amount: f.amount,
    isVariable: f.isVariable,
    cycle: f.cycle,
    day: f.day,
    month: f.month,
    startDate: f.startDate,
    endDate: f.endDate,
    status: f.status,
    fromAccountId: f.fromAccountId,
    fromAccount: accountLink(f.fromAccount),
    toAccountId: f.toAccountId,
    toAccount: accountLink(f.toAccount),
    cardId: f.cardId,
    card:
      f.card === null
        ? null
        : { name: f.card.name, issuer: f.card.issuer, isActive: f.card.isActive },
    overrideCount: f.overrideCount,
    ...memoFields(f.memo, memos)
  }
}
export function occurrenceRecord(o: Occurrence, memos: boolean): OccurrenceRecord {
  const f = o.flow
  return {
    flowId: f.id,
    name: f.name,
    kind: o.kind,
    category: f.category,
    isVariable: f.isVariable,
    date: o.date,
    amount: o.amount,
    originalAmount: o.originalAmount,
    action: o.action,
    fromAccountId: f.fromAccount === null ? null : o.fromAccountId,
    fromAccountName: f.fromAccount?.name ?? null,
    toAccountId: f.toAccount === null ? null : o.toAccountId,
    toAccountName: f.toAccount?.name ?? null,
    cardId: f.card === null ? null : f.cardId,
    cardName: f.card?.name ?? null,
    ...memoFields(o.memo, memos)
  }
}
export function correctionRecord(
  c: BalanceHistory,
  memos: boolean
): Omit<BalanceHistory, 'memo'> & MemoFields {
  return {
    id: c.id,
    accountId: c.accountId,
    date: c.date,
    balance: c.balance,
    beforeBalance: c.beforeBalance,
    difference: c.difference,
    ...memoFields(c.memo, memos)
  }
}
