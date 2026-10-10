import { app } from 'electron'
import { mkdirSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { getDbPath } from './db'
import * as service from './db/service'
import type { AccountInput, FlowInput, SavingsInput } from '../shared/ipc'

// Chromium 세션 파일까지 DB를 열기 전에 데모 폴더로 격리한다.
export function configureDemo(): void {
  const folder = join(app.getPath('appData'), 'BeaverBank-demo')
  mkdirSync(folder, { recursive: true })
  app.setPath('userData', folder)
  app.setPath('sessionData', folder)
  app.setAppLogsPath(join(folder, 'logs'))
  const crashes = join(folder, 'Crashpad')
  mkdirSync(crashes, { recursive: true })
  app.setPath('crashDumps', crashes)
}

export function resetDemoDatabase(): void {
  const expected = resolve(app.getPath('appData'), 'BeaverBank-demo')
  const file = getDbPath()
  if (resolve(app.getPath('userData')) !== expected || resolve(dirname(file)) !== expected) {
    throw new Error('데모 데이터 폴더를 확인하지 못했습니다.')
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
}

export function seedDemo(today = new Date()): void {
  const year = today.getFullYear()
  const month = today.getMonth()
  const date = (offset: number, day = 1): string => {
    const value = new Date(year, month + offset, day)
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  const purposeIds = [
    ['생활비', '#397768'],
    ['고정 지출', '#346D82'],
    ['비상금', '#84723E'],
    ['여행', '#8E5868'],
    ['내 집 마련', '#4F6F97']
  ].map(([name, color]) => service.addPurpose({ name, color }).id)
  const savings: Record<string, SavingsInput> = {
    '여행 적금': {
      startDate: date(-8),
      maturityDate: date(16),
      interestRate: 4.5,
      interestType: 'simple',
      taxType: 'normal',
      targetAmount: 7_200_000
    },
    '내 집 마련 적금': {
      startDate: date(-26),
      maturityDate: date(10),
      interestRate: 3.8,
      interestType: 'compound',
      taxType: 'preferential',
      targetAmount: 18_000_000
    },
    정기예금: {
      startDate: date(-10),
      maturityDate: date(2),
      interestRate: 3.5,
      interestType: 'simple',
      taxType: 'normal',
      targetAmount: null
    }
  }
  const definitions: [string, AccountInput['type'], number | null, number | null][] = [
    ['월급 통장', 'checking', 0, 1_500_000],
    ['생활비 통장', 'checking', 0, 1_000_000],
    ['고정 지출 통장', 'checking', 1, 700_000],
    ['비상금 통장', 'parking', 2, 3_000_000],
    ['여행 적금', 'installment', 3, 2_400_000],
    ['내 집 마련 적금', 'installment', 4, 13_000_000],
    ['정기예금', 'deposit', 4, 10_000_000],
    ['자유 통장', 'cma', null, 1_200_000],
    ['새 통장', 'checking', 0, null],
    ['옛 통장', 'checking', 0, null]
  ]
  const accountIds = definitions.map(([name, type, purpose, balance]) => {
    const account = service.addAccount({
      name,
      type,
      bank: type === 'cma' ? '가짜증권' : '가짜은행',
      purposeId: purpose === null ? null : purposeIds[purpose],
      numberTail: null,
      memo: null,
      savings: savings[name] ?? null
    })
    if (balance !== null)
      service.saveBalanceSnapshot({ accountId: account.id, date: date(0, 0), balance, memo: null })
    return account.id
  })
  service.saveBalanceSnapshot({
    accountId: accountIds[0],
    date: date(-1, 0),
    balance: 1_000_000,
    memo: null
  })
  service.setAccountActive(accountIds[9], false)
  const cardIds = [
    service.addCard({
      name: '생활비 카드',
      issuer: '가짜카드',
      type: 'credit',
      accountId: accountIds[1],
      paymentDay: 14,
      numberTail: null,
      memo: null
    }).id,
    service.addCard({
      name: '고정 지출 카드',
      issuer: '가짜카드',
      type: 'credit',
      accountId: accountIds[2],
      paymentDay: 25,
      numberTail: null,
      memo: null
    }).id,
    service.addCard({
      name: '체크 카드',
      issuer: '가짜카드',
      type: 'debit',
      accountId: accountIds[0],
      paymentDay: null,
      numberTail: null,
      memo: null
    }).id,
    service.addCard({
      name: '옛 카드',
      issuer: '가짜카드',
      type: 'debit',
      accountId: null,
      paymentDay: null,
      numberTail: null,
      memo: null
    }).id
  ]
  service.setCardActive(cardIds[3], false)
  type Definition = [
    string,
    FlowInput['kind'],
    number,
    FlowInput['category'],
    number,
    number | null,
    number | null,
    number | null,
    Partial<FlowInput>?
  ]
  const flows: Definition[] = [
    ['월급', 'income', 3_200_000, 'salary', 25, null, 0, null],
    ['부수입', 'income', 300_000, 'other', 10, null, 7, null, { isVariable: true }],
    ['생활비 이체', 'transfer', 900_000, 'allocation', 26, 0, 1, null],
    ['고정 지출 이체', 'transfer', 700_000, 'allocation', 26, 0, 2, null],
    ['비상금 이체', 'transfer', 200_000, 'allocation', 26, 0, 3, null],
    ['여행 적금 납입', 'transfer', 300_000, 'savings', 27, 0, 4, null, { startDate: date(-8) }],
    [
      '내 집 마련 적금 납입',
      'transfer',
      500_000,
      'savings',
      27,
      0,
      5,
      null,
      { startDate: date(-26) }
    ],
    ['생활비 보충', 'transfer', 100_000, 'other', 12, 3, 1, null],
    ['남은 생활비 모으기', 'transfer', 50_000, 'other', 24, 1, 3, null],
    ['가짜 통신비', 'payment', 55_000, 'telecom', 5, 2, null, 1],
    ['가짜 보험', 'payment', 120_000, 'insurance', 10, 2, null, null],
    ['가짜 공과금', 'payment', 150_000, 'utility', 20, 2, null, null, { isVariable: true }],
    ['가짜 대출 이자', 'payment', 250_000, 'loan', 21, 2, null, null],
    ['가짜 카드 대금', 'payment', 800_000, 'other', 14, 1, null, 0, { isVariable: true }],
    ['가짜 구독', 'payment', 17_000, 'subscription', 8, 1, null, 0],
    [
      '가짜 연회비',
      'payment',
      30_000,
      'other',
      15,
      1,
      null,
      0,
      { cycle: 'yearly', month: ((month + 2) % 12) + 1 }
    ],
    [
      '가짜 운동 회원권',
      'payment',
      60_000,
      'subscription',
      2,
      1,
      null,
      null,
      { startDate: date(1) }
    ],
    [
      '끝난 구독',
      'payment',
      9_900,
      'subscription',
      3,
      1,
      null,
      null,
      { startDate: date(-12), endDate: date(0, 0) }
    ]
  ]
  const flowIds = flows.map(
    ([name, kind, amount, category, day, from, to, card, extra]) =>
      service.addFlow({
        name,
        kind,
        amount,
        category,
        day,
        fromAccountId: from === null ? null : accountIds[from],
        toAccountId: to === null ? null : accountIds[to],
        cardId: card === null ? null : cardIds[card],
        isVariable: false,
        cycle: 'monthly',
        month: null,
        startDate: date(-36),
        endDate: null,
        memo: null,
        ...extra
      }).id
  )
  service.saveFlowOverride({
    flowId: flowIds[11],
    occurrenceDate: date(0, 20),
    action: 'amount',
    actualAmount: 132_000,
    memo: null
  })
  service.saveFlowOverride({
    flowId: flowIds[14],
    occurrenceDate: date(0, 8),
    action: 'skip',
    actualAmount: null,
    memo: null
  })
}
