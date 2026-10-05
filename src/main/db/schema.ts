import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'
import {
  ACCOUNT_TYPES,
  CARD_TYPES,
  FLOW_CATEGORIES,
  FLOW_CYCLES,
  FLOW_KINDS,
  INTEREST_TYPES,
  TAX_TYPES
} from '../../shared/domain'

// 상수 목록을 CHECK 제약용 SQL `'a', 'b', ...` 로 바꾼다.
const inList = (values: readonly string[]): ReturnType<typeof sql.raw> =>
  sql.raw(values.map((v) => `'${v}'`).join(', '))

const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`)
}

// ① 용도: 생활비, 비상금, 여행 등 사용자가 직접 정의
export const purposes = sqliteTable('purposes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#8b5e3c'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps
})

// ② 계좌. 해지한 계좌는 삭제하지 않고 is_active로 숨겨 이력을 보존한다.
export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    bank: text('bank').notNull(),
    numberTail: text('number_tail'),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    purposeId: integer('purpose_id').references(() => purposes.id, { onDelete: 'set null' }),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    memo: text('memo'),
    ...timestamps
  },
  (t) => [check('accounts_type_check', sql`${t.type} in (${inList(ACCOUNT_TYPES)})`)]
)

// ②-1 결제 카드. 연결 계좌가 삭제돼도 카드 기록은 남는다.
export const cards = sqliteTable(
  'cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    issuer: text('issuer').notNull(),
    type: text('type', { enum: CARD_TYPES }).notNull(),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    paymentDay: integer('payment_day'),
    numberTail: text('number_tail'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    memo: text('memo'),
    ...timestamps
  },
  (t) => [
    check('cards_type_check', sql`${t.type} in (${inList(CARD_TYPES)})`),
    check(
      'cards_payment_day_check',
      sql`(${t.type} = 'debit' and ${t.paymentDay} is null) or (${t.type} = 'credit' and typeof(${t.paymentDay}) = 'integer' and ${t.paymentDay} between 1 and 31)`
    )
  ]
)

// ③ 적금·예금 전용 정보 (accounts와 1:1).
// 월 납입액은 이 계좌로 들어오는 transfer 흐름에서 가져오므로 따로 저장하지 않는다.
export const savingsDetails = sqliteTable(
  'savings_details',
  {
    accountId: integer('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    startDate: text('start_date').notNull(),
    maturityDate: text('maturity_date').notNull(),
    interestRate: real('interest_rate').notNull(), // 연이율(%), 예: 4.5
    interestType: text('interest_type', { enum: INTEREST_TYPES }).notNull().default('simple'),
    taxType: text('tax_type', { enum: TAX_TYPES }).notNull().default('normal'),
    targetAmount: integer('target_amount')
  },
  (t) => [
    check('savings_interest_type_check', sql`${t.interestType} in (${inList(INTEREST_TYPES)})`),
    check('savings_tax_type_check', sql`${t.taxType} in (${inList(TAX_TYPES)})`),
    check('savings_period_check', sql`${t.maturityDate} > ${t.startDate}`),
    check('savings_rate_check', sql`${t.interestRate} >= 0`),
    check(
      'savings_target_amount_check',
      sql`${t.targetAmount} is null or (typeof(${t.targetAmount}) = 'integer' and ${t.targetAmount} >= 0)`
    ),
    check(
      'savings_start_date_check',
      sql`${t.startDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', ${t.startDate}, '+0 days') is ${t.startDate} and ${t.startDate} > '0000-12-31'`
    ),
    check(
      'savings_maturity_date_check',
      sql`${t.maturityDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', ${t.maturityDate}, '+0 days') is ${t.maturityDate} and ${t.maturityDate} > '0000-12-31'`
    )
  ]
)

// ④ 정기 흐름: 수입 / 계좌 간 이체 / 결제.
// 금액이 바뀌면 기존 흐름에 end_date를 넣고 새 흐름을 만들어 과거 이력을 보존한다.
// 29~31일이 없는 달은 말일로 처리한다 (계산 로직에서).
export const flows = sqliteTable(
  'flows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    kind: text('kind', { enum: FLOW_KINDS }).notNull(),
    amount: integer('amount').notNull(), // 변동 금액이면 예상액
    isVariable: integer('is_variable', { mode: 'boolean' }).notNull().default(false),
    fromAccountId: integer('from_account_id').references(() => accounts.id, {
      onDelete: 'restrict'
    }),
    toAccountId: integer('to_account_id').references(() => accounts.id, {
      onDelete: 'restrict'
    }),
    cardId: integer('card_id').references(() => cards.id, { onDelete: 'set null' }),
    category: text('category', { enum: FLOW_CATEGORIES }).notNull().default('other'),
    cycle: text('cycle', { enum: FLOW_CYCLES }).notNull().default('monthly'),
    day: integer('day').notNull(), // 1~31
    month: integer('month'), // 연 단위일 때만 1~12
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    memo: text('memo'),
    ...timestamps
  },
  (t) => [
    check('flows_kind_check', sql`${t.kind} in (${inList(FLOW_KINDS)})`),
    check('flows_category_check', sql`${t.category} in (${inList(FLOW_CATEGORIES)})`),
    check('flows_cycle_check', sql`${t.cycle} in (${inList(FLOW_CYCLES)})`),
    check('flows_amount_check', sql`typeof(${t.amount}) = 'integer' and ${t.amount} >= 0`),
    check('flows_day_check', sql`typeof(${t.day}) = 'integer' and ${t.day} between 1 and 31`),
    check(
      'flows_month_check',
      sql`(${t.cycle} = 'monthly' and ${t.month} is null) or (${t.cycle} = 'yearly' and ${t.month} is not null and typeof(${t.month}) = 'integer' and ${t.month} between 1 and 12)`
    ),
    // 종류별로 외부(null)가 되는 쪽이 정해져 있다.
    check(
      'flows_accounts_check',
      sql`(${t.kind} = 'income' and ${t.fromAccountId} is null and ${t.toAccountId} is not null)
        or (${t.kind} = 'transfer' and ${t.fromAccountId} is not null and ${t.toAccountId} is not null and ${t.fromAccountId} <> ${t.toAccountId})
        or (${t.kind} = 'payment' and ${t.fromAccountId} is not null and ${t.toAccountId} is null)`
    ),
    check('flows_period_check', sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    check('flows_card_check', sql`${t.kind} = 'payment' or ${t.cardId} is null`),
    check(
      'flows_start_date_check',
      sql`${t.startDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', ${t.startDate}, '+0 days') is ${t.startDate} and ${t.startDate} > '0000-12-31'`
    ),
    check(
      'flows_end_date_check',
      sql`${t.endDate} is null or (${t.endDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', ${t.endDate}, '+0 days') is ${t.endDate} and ${t.endDate} > '0000-12-31')`
    ),
    index('flows_from_account_idx').on(t.fromAccountId),
    index('flows_to_account_idx').on(t.toAccountId)
  ]
)

// ⑤ 특정 회차 예외: 이번 회차만 금액 변경 또는 건너뜀
export const flowOverrides = sqliteTable(
  'flow_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    flowId: integer('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    occurrenceDate: text('occurrence_date').notNull(), // 원래 예정일
    actualAmount: integer('actual_amount'),
    skipped: integer('skipped', { mode: 'boolean' }).notNull().default(false),
    memo: text('memo')
  },
  (t) => [
    uniqueIndex('flow_overrides_flow_date_idx').on(t.flowId, t.occurrenceDate),
    check('flow_overrides_effect_check', sql`${t.skipped} = 1 or ${t.actualAmount} is not null`),
    check(
      'flow_overrides_amount_check',
      sql`${t.actualAmount} is null or (typeof(${t.actualAmount}) = 'integer' and ${t.actualAmount} >= 0)`
    ),
    check(
      'flow_overrides_occurrence_date_check',
      sql`${t.occurrenceDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', ${t.occurrenceDate}, '+0 days') is ${t.occurrenceDate} and ${t.occurrenceDate} > '0000-12-31'`
    )
  ]
)

// ⑥ 잔액 보정: 해당 날짜가 끝난 시점의 실제 잔액. 계좌당 하루 하나.
// 잔액은 마이너스 통장을 고려해 음수를 허용한다.
export const balanceSnapshots = sqliteTable(
  'balance_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    balance: integer('balance').notNull(),
    memo: text('memo'),
    ...timestamps
  },
  (t) => [
    uniqueIndex('balance_snapshots_account_date_idx').on(t.accountId, t.date),
    check('balance_snapshots_balance_check', sql`typeof(${t.balance}) = 'integer'`),
    check(
      'balance_snapshots_date_check',
      sql`${t.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and strftime('%Y-%m-%d', ${t.date}, '+0 days') is ${t.date} and ${t.date} > '0000-12-31'`
    )
  ]
)
