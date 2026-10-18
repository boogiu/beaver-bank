import { z } from 'zod'
import {
  ACCOUNT_TYPES,
  CARD_TYPES,
  INTEREST_TYPES,
  TAX_TYPES,
  FLOW_KINDS,
  FLOW_CATEGORIES,
  FLOW_CYCLES
} from '../shared/domain'

const id = z.number().describe('대상의 id. 1 이상의 정수입니다.')
const memo = z
  .string()
  .nullable()
  .describe(
    '메모. 200자 이하, null은 비움입니다. 등록 시 생략하면 null, 수정 시 생략하면 유지합니다.'
  )
  .optional()
const date = z.string().describe('YYYY-MM-DD 형식의 실제 날짜입니다.')
const amount = z.number().describe('금액. 원 단위 0 이상의 정수입니다.')
const savingFields = {
  startDate: date.describe('가입일. YYYY-MM-DD 형식의 실제 날짜입니다.'),
  maturityDate: date.describe('만기일. 가입일보다 뒤인 실제 날짜입니다.'),
  interestRate: z.number().describe('연이율(%). 0~100의 수입니다.'),
  interestType: z.enum(INTEREST_TYPES).describe('이자 방식. simple 단리, compound 복리입니다.'),
  taxType: z
    .enum(TAX_TYPES)
    .describe(
      '과세 방식. normal 일반과세 15.4%, tax_free 비과세, preferential 세금우대 9.5%입니다.'
    ),
  targetAmount: amount
    .nullable()
    .describe('목표액. 0원 이상의 정수 또는 null. 등록 시 생략하면 null, 수정 시 유지합니다.')
    .optional()
}
const savings = z.strictObject(savingFields)
const purposeFields = {
  name: z.string().describe('용도 이름. 1~20자이며 다른 용도와 같을 수 없습니다.'),
  color: z
    .string()
    .describe('용도 색상. 앱 팔레트 12색 중 하나이며 영문 대소문자를 가리지 않습니다.')
}
const accountFields = {
  name: z.string().describe('계좌 이름. 1~30자입니다.'),
  bank: z.string().describe('금융기관 이름. 1~20자입니다.'),
  type: z
    .enum(ACCOUNT_TYPES)
    .describe(
      '계좌 종류. checking 입출금, installment 적금, deposit 예금, parking 파킹통장, cma CMA, investment 투자입니다.'
    ),
  numberTail: z
    .string()
    .nullable()
    .describe(
      '계좌번호 끝자리. 숫자 1~4자리 또는 null입니다. 등록 시 생략하면 null, 수정 시 유지합니다.'
    )
    .optional(),
  purposeId: id
    .nullable()
    .describe('용도 id. 등록 시 생략하면 null, 수정 시 유지하며 null로 비웁니다.')
    .optional(),
  memo,
  savings: savings
    .nullable()
    .describe(
      '적금·예금 정보. 적금·예금이면 필요합니다. 등록 시 생략하면 null, 수정 시 항목별 유지, null은 비움입니다.'
    )
    .optional()
}
const cardFields = {
  name: z.string().describe('카드 이름. 1~30자입니다.'),
  issuer: z.string().describe('카드사 이름. 1~20자입니다.'),
  type: z.enum(CARD_TYPES).describe('카드 종류. debit 체크, credit 신용입니다.'),
  accountId: id
    .nullable()
    .describe(
      '연결 계좌 id. 해지 계좌는 새로 연결할 수 없습니다. 등록 시 생략하면 null, 수정 시 유지합니다.'
    )
    .optional(),
  paymentDay: z
    .number()
    .nullable()
    .describe(
      '결제일. 신용은 1~31 정수, 체크는 null입니다. 등록 시 생략하면 null, 수정 시 유지합니다.'
    )
    .optional(),
  numberTail: z
    .string()
    .nullable()
    .describe(
      '카드 번호 끝자리. 숫자 4자리 또는 null입니다. 등록 시 생략하면 null, 수정 시 유지합니다.'
    )
    .optional(),
  memo
}
const flowFields = {
  name: z.string().describe('흐름 이름. 1~30자입니다.'),
  kind: z
    .enum(FLOW_KINDS)
    .describe('흐름 종류. income 수입, transfer 이체, payment 정기 결제입니다.'),
  amount,
  category: z
    .enum(FLOW_CATEGORIES)
    .describe(
      '분류. salary 급여, savings 적금 납입, allocation 용도별 분배, subscription 구독, insurance 보험, telecom 통신, utility 공과금, loan 대출, other 기타입니다. 종류에 맞아야 합니다.'
    ),
  day: z.number().describe('지정일. 1~31 정수, 없는 날은 말일에 일어납니다.'),
  startDate: date.describe('시작일. YYYY-MM-DD 형식의 실제 날짜입니다.'),
  fromAccountId: id
    .nullable()
    .describe(
      '보내는 계좌 id. 이체·결제는 필수, 수입은 null입니다. 등록 시 생략하면 null, 수정 시 유지합니다.'
    )
    .optional(),
  toAccountId: id
    .nullable()
    .describe(
      '받는 계좌 id. 수입·이체는 필수, 결제는 null이며 이체의 보내는 계좌와 달라야 합니다. 등록 시 생략하면 null, 수정 시 유지합니다.'
    )
    .optional(),
  cardId: id
    .nullable()
    .describe('결제 카드 id. 정기 결제에만 지정합니다. 등록 시 생략하면 null, 수정 시 유지합니다.')
    .optional(),
  isVariable: z
    .boolean()
    .describe('변동 금액 여부. 등록 시 생략하면 거짓, 수정 시 유지합니다.')
    .optional(),
  cycle: z
    .enum(FLOW_CYCLES)
    .describe(
      '주기. monthly 매월, yearly 매년입니다. 등록 시 생략하면 monthly, 수정 시 유지합니다.'
    )
    .optional(),
  month: z
    .number()
    .nullable()
    .describe(
      '지정 월. 매년은 1~12 정수, 매월은 null입니다. 등록 시 생략하면 null, 수정 시 유지합니다.'
    )
    .optional(),
  endDate: date
    .nullable()
    .describe('종료일. 시작일과 같거나 뒤입니다. 등록 시 생략하면 null, 수정 시 유지합니다.')
    .optional(),
  memo
}
export const writeSchemas = {
  add_purpose: z.strictObject(purposeFields),
  update_purpose: z.strictObject(purposeFields).partial().extend({ id }),
  add_account: z.strictObject(accountFields),
  update_account: z
    .strictObject(accountFields)
    .partial()
    .extend({
      id,
      savings: savings
        .partial()
        .nullable()
        .describe('적금·예금 정보. 생략한 중첩 항목은 유지, null은 비움입니다.')
        .optional()
    }),
  add_card: z.strictObject(cardFields),
  update_card: z.strictObject(cardFields).partial().extend({ id }),
  add_flow: z.strictObject(flowFields),
  update_flow: z
    .strictObject(flowFields)
    .omit({ kind: true })
    .partial()
    .extend({
      id,
      effectiveStartDate: date
        .nullable()
        .describe(
          '적용 시작일. 조건 변경 시 시작일과 종료일 사이의 날짜가 필요합니다. 생략하면 null입니다.'
        )
        .optional()
    }),
  adjust_occurrence: z.strictObject({
    flowId: id.describe('흐름 id. 1 이상의 정수입니다.'),
    occurrenceDate: date.describe('그 흐름의 회차 날짜. YYYY-MM-DD 실제 날짜입니다.'),
    action: z
      .enum(['original', 'amount', 'skip'])
      .describe('회차 처리. original 원래대로, amount 금액 변경, skip 건너뛰기입니다.'),
    actualAmount: amount
      .nullable()
      .describe(
        '이번 금액. amount일 때 0 이상의 정수 필수, 다른 처리는 null입니다. 생략하면 null입니다.'
      )
      .optional(),
    memo: memo.describe(
      '메모. 200자 이하. 생략하면 기존 회차 예외의 메모 유지, original은 null이며 메모를 넣을 수 없습니다.'
    )
  }),
  close_account: z.strictObject({ id }),
  restore_account: z.strictObject({ id }),
  close_card: z.strictObject({ id }),
  restore_card: z.strictObject({ id }),
  end_flow: z.strictObject({
    id,
    endDate: date.describe('종료일. 시작일과 같거나 뒤인 실제 날짜이며 이 날까지 회차가 생깁니다.')
  }),
  resume_flow: z.strictObject({ id }),
  correct_balance: z.strictObject({
    accountId: id.describe('계좌 id. 해지 계좌는 보정할 수 없습니다.'),
    date: date.describe('보정 날짜. 오늘이거나 이전의 실제 날짜입니다.'),
    balance: z
      .number()
      .describe('그 날짜가 끝난 시점의 실제 잔액. 원 단위 정수이며 음수도 가능합니다.'),
    memo: memo.describe('메모. 200자 이하. 생략하면 같은 날짜 보정 메모 유지, 없으면 null입니다.')
  })
}
export type WriteName = keyof typeof writeSchemas
export type WriteInput<N extends WriteName> = z.infer<(typeof writeSchemas)[N]>
export const writeTitles: Record<WriteName, string> = {
  add_purpose: '용도 등록',
  update_purpose: '용도 수정',
  add_account: '계좌 등록',
  update_account: '계좌 수정',
  add_card: '카드 등록',
  update_card: '카드 수정',
  add_flow: '정기 흐름 등록',
  update_flow: '정기 흐름 수정',
  adjust_occurrence: '회차 예외',
  close_account: '계좌 해지',
  restore_account: '계좌 복구',
  close_card: '카드 해지',
  restore_card: '카드 복구',
  end_flow: '정기 흐름 종료',
  resume_flow: '정기 흐름 종료 취소',
  correct_balance: '잔액 보정'
}
export function writeDescription(name: WriteName): string {
  const index = Object.keys(writeSchemas).indexOf(name)
  const group = index < 9 ? '등록·수정' : index < 15 ? '상태 변경' : '잔액 보정'
  const key = name.includes('purpose')
    ? 'purpose'
    : name.includes('account')
      ? 'account'
      : name.includes('card')
        ? 'card'
        : name === 'adjust_occurrence'
          ? 'occurrence'
          : name === 'correct_balance'
            ? 'correction, accountName, replaced'
            : name === 'update_flow'
              ? 'flow, split 및 분할 시 previousFlowId'
              : 'flow'
  return `[쓰기 · ${group}] ${writeTitles[name]}으로 데이터를 바꿉니다. 결과는 source와 ${key} 레코드이며 첫 쓰기에는 backup.file, 기록 실패에는 warning이 있습니다. 수정 시 생략한 항목은 유지하고 null은 비웁니다.`
}
