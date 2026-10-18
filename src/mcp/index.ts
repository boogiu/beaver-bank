import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { attempt } from '../main/db/service'
import { withReadDatabase } from './database'
import { notice } from './messages'
import { parseOptions, usage } from './options'
import { createServer } from './server'
import { getStatus } from './status'
import { createStdio } from './stdio'

console.log = console.info = console.warn = console.debug = console.error.bind(console)
function main(): void {
  const options = parseOptions(process.argv.slice(2))
  console.error(
    `${options.source === 'demo' ? '데모 데이터' : '실제 데이터'} · 읽기 전용 · 메모 ${options.memos ? '켜짐' : '꺼짐'} · ${options.path}`
  )
  if (options.source === 'real') console.error(notice)
  if (options.check) {
    const result = attempt(() => withReadDatabase(options, (state) => getStatus(options, state)))
    if (!result.ok) {
      process.stdout.write(`연결 상태 오류: ${result.error.message}\nDB 경로: ${options.path}\n`)
      process.exitCode = 1
      return
    }
    const status = result.data
    process.stdout.write(
      `데이터 대상: ${options.source === 'demo' ? '데모 데이터' : '실제 데이터'}\n쓰기: 읽기 전용\n메모: ${options.memos ? '켜짐' : '꺼짐'}\nDB 경로: ${options.path}\nDB 상태: ${status.database.state}\n${JSON.stringify({ ...status, database: { ...status.database, path: options.path } }, null, 2)}\n`
    )
    process.exitCode = status.database.state === 'ready' ? 0 : 1
  } else {
    serveStdio(() => createServer(options), {
      transport: createStdio(options),
      onerror: (error) => console.error(error)
    })
  }
}
try {
  main()
} catch (error) {
  console.error(
    `${error instanceof Error ? error.message : '서버를 시작하지 못했습니다.'}\n${usage}`
  )
  process.exitCode = 1
}
