import type { Options } from './options'

export const notice =
  'AI가 도구로 읽은 계좌·카드 이름, 금융기관, 끝자리, 금액·잔액, 날짜, 정기 흐름과 --memos 사용 시 메모는 연결한 AI 서비스의 서버로 전송되며, 이후 보관·사용은 그 서비스의 약관·설정을 따르고 BeaverBank가 통제할 수 없습니다.'
export const mismatchMessage =
  'DB가 이 서버와 다른 판입니다. 저장소를 최신으로 받아 다시 빌드하고 앱을 한 번 실행한 뒤 다시 시도해 주세요.'
export const noDatabaseMessage = (source: Options['source']): string =>
  source === 'demo'
    ? '데모 데이터가 없습니다. 저장소에서 npm run demo를 한 번 실행한 뒤 다시 시도해 주세요.'
    : 'BeaverBank 데이터가 없습니다. 앱을 한 번 실행한 뒤 다시 시도해 주세요.'
export const instructions = (options: Options): string =>
  `BeaverBank는 용도별 계좌와 정기 흐름으로 돈을 관리하는 앱이며 건별 지출 가계부가 아닙니다. ${options.source === 'demo' ? '데모 데이터' : '실제 데이터'}, 읽기 전용, 메모 ${options.memos ? '켜짐' : '꺼짐'}입니다. 금액은 원 단위 정수, 날짜는 YYYY-MM-DD, 대상은 1 이상의 정수 id로 가리킵니다. ${notice}`
