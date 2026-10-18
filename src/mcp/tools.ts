import { z } from 'zod'
import * as service from '../main/db/service'
import { todayDate } from '../shared/balances'
import type { Options } from './options'
import {
  accountRecord,
  cardRecord,
  correctionRecord,
  flowRecord,
  occurrenceRecord,
  purposeRecord
} from './records'

const date = z
  .string()
  .describe('기준 날짜. YYYY-MM-DD 형식의 실제 날짜이며 생략하면 PC 현지 오늘입니다.')
  .optional()
const includeInactive = z
  .boolean()
  .describe('참이면 해지한 대상도 포함합니다. 생략하면 거짓입니다.')
  .optional()
export const schemas = {
  get_status: z.strictObject({}),
  get_dashboard: z.strictObject({ date }),
  list_purposes: z.strictObject({}),
  list_accounts: z.strictObject({ includeInactive, date }),
  list_cards: z.strictObject({ includeInactive }),
  list_flows: z.strictObject({
    includeEnded: z
      .boolean()
      .describe('참이면 종료한 흐름도 포함합니다. 생략하면 거짓입니다.')
      .optional()
  }),
  get_month_flows: z.strictObject({
    year: z
      .number()
      .describe('연도. 1~9999의 정수입니다. 연월을 모두 생략하면 오늘 연월입니다.')
      .optional(),
    month: z.number().describe('월. 1~12의 정수입니다. 연도와 함께 지정합니다.').optional()
  }),
  list_balance_corrections: z.strictObject({
    accountId: z.number().describe('계좌 id. 1 이상의 정수입니다.')
  })
}
export type ToolName = keyof typeof schemas
export const titles: Record<ToolName, string> = {
  get_status: '연결 상태',
  get_dashboard: '대시보드 요약',
  list_purposes: '용도 목록',
  list_accounts: '계좌 목록과 잔액',
  list_cards: '카드 목록',
  list_flows: '정기 흐름 목록',
  get_month_flows: '한 달의 회차',
  list_balance_corrections: '잔액 보정 이력'
}
export const descriptions: Record<ToolName, string> = {
  get_status:
    'BeaverBank는 용도별 계좌와 정기 흐름을 관리하며 건별 지출 가계부가 아닙니다. 데이터 대상, 읽기 전용 여부, 메모 여부, 오늘, DB 판·테이블 수, 백업·기록 폴더와 개인 정보 안내를 줍니다. 금액은 원 단위 정수, 날짜는 YYYY-MM-DD, 대상은 id입니다.',
  get_dashboard:
    '총자산·용도별 구성, 월 수입과 정기 결제, 다가오는 회차, 예상 추이, 적금·예금 진행을 조회합니다. 금액은 원 단위 정수입니다.',
  list_purposes: '모든 용도를 화면 순서로 조회하며 id, 이름, 색, 순서, 계좌 수를 줍니다.',
  list_accounts:
    '계좌를 id 순으로 조회하며 금융기관, 끝자리, 종류, 용도, 저축 조건, 정기 흐름 수, 월 납입액, 기준일 잔액과 예상 여부를 줍니다. 메모는 실행 옵션으로 공개한 경우에만 줍니다.',
  list_cards:
    '카드를 id 순으로 조회하며 카드사, 종류, 연결 계좌, 결제일, 끝자리와 흐름 수를 줍니다. 메모는 실행 옵션으로 공개한 경우에만 줍니다.',
  list_flows:
    '정기 흐름을 id 순으로 조회하며 종류·분류·금액·주기·기간·상태, 연결 계좌·카드, 예외 수를 줍니다. 메모는 실행 옵션으로 공개한 경우에만 줍니다.',
  get_month_flows:
    '고른 달의 회차를 날짜순으로 조회하며 금액·원래 금액·예외 처리, 연결 대상 이름, 월 합계와 계좌별 월말 잔액을 줍니다. 메모는 실행 옵션으로 공개한 경우에만 줍니다.',
  list_balance_corrections:
    '계좌 id로 보정 이력을 최신 날짜부터 조회하며 계좌 이름, 날짜, 잔액, 보정 전 잔액과 차이를 줍니다. 메모는 실행 옵션으로 공개한 경우에만 줍니다.'
}
export function readTool<N extends ToolName>(
  name: N,
  input: z.infer<(typeof schemas)[N]>,
  options: Options
): object {
  switch (name) {
    case 'get_dashboard':
      return service.getDashboard((input as z.infer<typeof schemas.get_dashboard>).date)
    case 'list_purposes':
      return { purposes: service.listPurposes().map(purposeRecord) }
    case 'list_accounts': {
      const args = input as z.infer<typeof schemas.list_accounts>
      const value = args.date ?? todayDate()
      const balances = new Map(service.listBalances(value).map((b) => [b.accountId, b]))
      const purposes = service.listPurposes()
      return {
        date: value,
        accounts: service
          .listAccounts(args.includeInactive ?? false)
          .sort((a, b) => a.id - b.id)
          .map((a) => accountRecord(a, balances.get(a.id)!, purposes, options.memos))
      }
    }
    case 'list_cards':
      return {
        cards: service
          .listCards((input as z.infer<typeof schemas.list_cards>).includeInactive ?? false)
          .sort((a, b) => a.id - b.id)
          .map((c) => cardRecord(c, options.memos))
      }
    case 'list_flows':
      return {
        flows: service
          .listFlows((input as z.infer<typeof schemas.list_flows>).includeEnded ?? false)
          .sort((a, b) => a.id - b.id)
          .map((f) => flowRecord(f, options.memos))
      }
    case 'get_month_flows': {
      const args = input as z.infer<typeof schemas.get_month_flows>
      const defaults =
        args.year === undefined && args.month === undefined
          ? todayDate().split('-').map(Number)
          : null
      const result = service.listMonthlyFlows(
        defaults ? defaults[0] : args.year!,
        defaults ? defaults[1] : args.month!
      )
      const accounts = new Map(service.listAccounts(true).map((a) => [a.id, a.name]))
      return {
        year: result.year,
        month: result.month,
        occurrences: result.occurrences.map((o) => occurrenceRecord(o, options.memos)),
        totals: {
          ...result.totals,
          accounts: result.totals.accounts.map((a) => ({ ...a, name: accounts.get(a.id) ?? null }))
        }
      }
    }
    case 'list_balance_corrections': {
      const { accountId } = input as z.infer<typeof schemas.list_balance_corrections>
      const corrections = service.listBalanceSnapshots(accountId)
      return {
        accountId,
        accountName: service.listAccounts(true).find((a) => a.id === accountId)!.name,
        corrections: corrections.map((c) => correctionRecord(c, options.memos))
      }
    }
    default:
      throw new Error('등록되지 않은 조회입니다.')
  }
}
