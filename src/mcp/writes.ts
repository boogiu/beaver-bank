import * as service from '../main/db/service'
import { todayDate } from '../shared/balances'
import { isRealDate } from '../shared/occurrences'
import type {
  Account,
  AccountInput,
  Card,
  CardInput,
  Flow,
  FlowInput,
  SavingsInput
} from '../shared/ipc'
import {
  accountRecord,
  cardRecord,
  correctionRecord,
  flowRecord,
  occurrenceRecord,
  purposeRecord
} from './records'
import type { WriteInput, WriteName } from './write-tools'

export interface WriteCapture {
  before: object | null
  after: object | null
}

// 입력 가능한 필드만 복사해 서비스의 전체 입력 계약으로 조립한다.
function accountInput(a: Account): AccountInput {
  return {
    name: a.name,
    bank: a.bank,
    type: a.type,
    numberTail: a.numberTail,
    purposeId: a.purposeId,
    memo: a.memo,
    savings: a.savings
  }
}
function cardInput(c: Card): CardInput {
  return {
    name: c.name,
    issuer: c.issuer,
    type: c.type,
    accountId: c.accountId,
    paymentDay: c.paymentDay,
    numberTail: c.numberTail,
    memo: c.memo
  }
}
function flowInput(f: Flow): FlowInput {
  return {
    name: f.name,
    kind: f.kind,
    amount: f.amount,
    category: f.category,
    day: f.day,
    startDate: f.startDate,
    fromAccountId: f.fromAccountId,
    toAccountId: f.toAccountId,
    cardId: f.cardId,
    isVariable: f.isVariable,
    cycle: f.cycle,
    month: f.month,
    endDate: f.endDate,
    memo: f.memo
  }
}
function account(a: Account, memos: boolean): ReturnType<typeof accountRecord> {
  const balance = service.listBalances(todayDate()).find((item) => item.accountId === a.id)
  if (!balance) throw new Error('계좌 잔액 결과를 찾을 수 없습니다.')
  return accountRecord(a, balance, service.listPurposes(), memos)
}
function occurrence(
  flowId: number,
  date: string
): ReturnType<typeof service.listMonthlyFlows>['occurrences'][number] | null {
  // 잘못된 날짜의 오류는 saveFlowOverride의 기존 검증에 맡긴다.
  if (!isRealDate(date)) return null
  const [year, month] = date.split('-').map(Number)
  return (
    service
      .listMonthlyFlows(year, month)
      .occurrences.find((item) => item.flow.id === flowId && item.date === date) ?? null
  )
}

// 동기 호출 전용. 예외는 밖으로 전파해 호출자의 트랜잭션을 rollback한다.
export function writeTool<N extends WriteName>(
  name: N,
  input: WriteInput<N>,
  memos: boolean,
  capture: WriteCapture
): object {
  switch (name) {
    case 'add_purpose': {
      const p = service.addPurpose(input as WriteInput<'add_purpose'>)
      capture.after = purposeRecord(p)
      return { purpose: purposeRecord(p) }
    }
    case 'update_purpose': {
      const { id, ...patch } = input as WriteInput<'update_purpose'>
      const p = service.requirePurpose(id)
      capture.before = purposeRecord(p)
      const result = service.updatePurpose(id, { name: p.name, color: p.color, ...patch })
      capture.after = purposeRecord(result)
      return { purpose: purposeRecord(result) }
    }
    case 'add_account': {
      const args = input as WriteInput<'add_account'>
      const a = service.addAccount({
        numberTail: null,
        purposeId: null,
        memo: null,
        ...args,
        savings: args.savings ? { targetAmount: null, ...args.savings } : null
      })
      capture.after = account(a, true)
      return { account: account(a, memos) }
    }
    case 'update_account': {
      const { id, savings, ...patch } = input as WriteInput<'update_account'>
      const a = service.requireAccount(id)
      capture.before = account(a, true)
      const merged =
        savings === undefined ? a.savings : savings === null ? null : { ...a.savings, ...savings }
      // 기존 정보가 없으면 미완성 입력도 그대로 서비스 검증에 넘긴다.
      const result = service.updateAccount(id, {
        ...accountInput(a),
        ...patch,
        savings: merged as SavingsInput | null
      })
      capture.after = account(result, true)
      return { account: account(result, memos) }
    }
    case 'add_card': {
      const c = service.addCard({
        accountId: null,
        paymentDay: null,
        numberTail: null,
        memo: null,
        ...(input as WriteInput<'add_card'>)
      })
      capture.after = cardRecord(c, true)
      return { card: cardRecord(c, memos) }
    }
    case 'update_card': {
      const { id, ...patch } = input as WriteInput<'update_card'>
      const c = service.requireCard(id)
      capture.before = cardRecord(c, true)
      const result = service.updateCard(id, { ...cardInput(c), ...patch })
      capture.after = cardRecord(result, true)
      return { card: cardRecord(result, memos) }
    }
    case 'add_flow': {
      const f = service.addFlow({
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        isVariable: false,
        cycle: 'monthly',
        month: null,
        endDate: null,
        memo: null,
        ...(input as WriteInput<'add_flow'>)
      })
      capture.after = flowRecord(f, true)
      return { flow: flowRecord(f, memos) }
    }
    case 'update_flow': {
      const { id, effectiveStartDate, ...patch } = input as WriteInput<'update_flow'>
      const f = service.requireFlow(id)
      capture.before = flowRecord(f, true)
      const result = service.updateFlow(
        id,
        { ...flowInput(f), ...patch },
        effectiveStartDate ?? null
      )
      capture.after = flowRecord(result, true)
      return {
        flow: flowRecord(result, memos),
        split: result.id !== id,
        ...(result.id !== id ? { previousFlowId: id } : {})
      }
    }
    case 'adjust_occurrence': {
      const args = input as WriteInput<'adjust_occurrence'>
      const before = occurrence(args.flowId, args.occurrenceDate)
      capture.before = before ? occurrenceRecord(before, true) : null
      service.saveFlowOverride({
        ...args,
        actualAmount: args.actualAmount ?? null,
        memo:
          args.memo === undefined
            ? args.action === 'original'
              ? null
              : (before?.memo ?? null)
            : args.memo
      })
      const after = occurrence(args.flowId, args.occurrenceDate)
      if (!after) throw new Error('회차 결과를 찾을 수 없습니다.')
      capture.after = occurrenceRecord(after, true)
      return { occurrence: occurrenceRecord(after, memos) }
    }
    case 'close_account':
    case 'restore_account': {
      const { id } = input as WriteInput<'close_account'>
      capture.before = account(service.requireAccount(id), true)
      service.setAccountActive(id, name === 'restore_account')
      const a = service.requireAccount(id)
      capture.after = account(a, true)
      return { account: account(a, memos) }
    }
    case 'close_card':
    case 'restore_card': {
      const { id } = input as WriteInput<'close_card'>
      capture.before = cardRecord(service.requireCard(id), true)
      service.setCardActive(id, name === 'restore_card')
      const c = service.requireCard(id)
      capture.after = cardRecord(c, true)
      return { card: cardRecord(c, memos) }
    }
    case 'end_flow':
    case 'resume_flow': {
      const args = input as WriteInput<'end_flow'>
      capture.before = flowRecord(service.requireFlow(args.id), true)
      if (name === 'end_flow') service.endFlow(args.id, args.endDate)
      else service.resumeFlow(args.id)
      const f = service.requireFlow(args.id)
      capture.after = flowRecord(f, true)
      return { flow: flowRecord(f, memos) }
    }
    case 'correct_balance': {
      const args = input as WriteInput<'correct_balance'>
      const { existing } = service.getBalanceBefore(args.accountId, args.date)
      const before = existing
        ? service.listBalanceSnapshots(args.accountId).find((item) => item.id === existing.id)
        : null
      capture.before = before ? correctionRecord(before, true) : null
      service.saveBalanceSnapshot({
        ...args,
        memo: args.memo === undefined ? (existing?.memo ?? null) : args.memo
      })
      const after = service
        .listBalanceSnapshots(args.accountId)
        .find((item) => item.date === args.date)
      if (!after) throw new Error('잔액 보정 결과를 찾을 수 없습니다.')
      capture.after = correctionRecord(after, true)
      return {
        correction: correctionRecord(after, memos),
        accountName: service.requireAccount(args.accountId).name,
        replaced: existing !== null
      }
    }
    default:
      throw new Error('등록되지 않은 기입입니다.')
  }
}
