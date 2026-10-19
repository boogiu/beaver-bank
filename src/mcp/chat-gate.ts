import { spawn } from 'node:child_process'
import { isAbsolute, join } from 'node:path'

// 읽기 전용 단계에서는 바이트를 바꾸지 않는다. 도구 허용 여부는 서버가 결정한다.
const separator = process.argv.indexOf('--', 2)
const [command, ...args] = process.argv.slice(separator + 1)
if (separator < 2 || !command || !isAbsolute(command)) {
  console.error('관문 실행 경로를 확인하지 못했습니다.')
  process.exitCode = 1
} else {
  const server = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let closing = false
  const close = (): void => {
    if (closing) return
    closing = true
    if (server.pid && server.exitCode === null) {
      const killer = spawn(
        join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(server.pid), '/T', '/F'],
        { shell: false, windowsHide: true, stdio: 'ignore' }
      )
      killer.on('error', () => server.kill())
    }
  }
  process.stdin.pipe(server.stdin)
  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)
  process.stdin.on('end', close)
  process.stdin.on('error', close)
  server.stdin.on('error', close)
  process.stdout.on('error', close)
  process.on('SIGTERM', close)
  process.on('SIGINT', close)
  server.on('error', (error) => {
    console.error(error.message)
    process.exitCode = 1
    close()
  })
  server.on('close', (code) => {
    process.stdin.destroy()
    process.exitCode = code ?? 1
  })
}
