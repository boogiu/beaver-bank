import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { isAbsolute, join, delimiter, dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { constants, setPriority } from 'node:os'
import { chatModels, type ChatSnapshot, type ChatRequest, type ChatReply } from '../shared/chat'
import { readChatSettings, writeChatSettings } from './chat-settings'
import { checkChatData } from './chat-data'

const instructions = [
  'BeaverBank는 용도별 계좌와 정기 흐름으로 돈을 관리하는 앱이고, 건별 지출 가계부가 아니다.',
  '한국어로 답한다.',
  '데이터는 BeaverBank 도구로만 본다. 도구로 알 수 없는 것은 모른다고 말하고 지어내지 않는다.',
  '파일, 명령, 웹을 쓰지 않는다.',
  '금액은 천 단위 쉼표와 "원"을 붙여 쓰고, 날짜는 YYYY-MM-DD 또는 "10월 25일"처럼 쓴다.',
  '기입 도구를 부르기 전에 무엇을 어떻게 바꿀지 짧게 설명한다. 기입마다 사용자가 채팅창에서 확인한다. 거절된 기입은 다시 시도하지 말고 사용자에게 어떻게 할지 묻는다.',
  '표는 열 4개 이하로 짧게 쓴다.'
]
  .map((line, index) => `${index + 1}. ${line}`)
  .join('\n')
const readTools = [
  'get_status',
  'get_dashboard',
  'list_purposes',
  'list_accounts',
  'list_cards',
  'list_flows',
  'get_month_flows',
  'list_balance_corrections'
].map((name) => `mcp__beaverbank-chat__${name}`)
const errors = {
  tools: '허용되지 않은 도구가 보여 이 답을 멈췄습니다. Claude Code의 판이나 설정을 확인해 주세요.',
  missingTools: 'BeaverBank MCP 서버에 연결하지 못했습니다. 다시 시도해 주세요.',
  build:
    'BeaverBank MCP 서버가 빌드되지 않았습니다. 저장소에서 npm run build를 실행한 뒤 다시 시도해 주세요.',
  node: 'Node를 찾지 못했습니다. Node 22 이상을 설치한 뒤 앱을 다시 실행해 주세요.',
  login:
    'Claude Code에 로그인되어 있지 않습니다. 터미널에서 claude를 실행해 로그인한 뒤 [다시 확인]을 눌러 주세요.',
  rate: 'Claude 계정의 사용 한도에 닿았습니다. 한도가 풀린 뒤 다시 시도해 주세요.',
  overloaded: 'AI 서비스가 바빠 답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  connection: 'AI 서비스에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.',
  max: '한 번에 처리할 수 있는 단계를 넘어 멈췄습니다. 나눠서 부탁해 주세요.',
  silent: '응답이 없어 멈췄습니다.',
  other: '답을 받지 못했습니다.'
}
function errorMessage(value: string): string {
  if (/authentication_failed|not logged in|unauthorized/i.test(value)) return errors.login
  if (/rate_limit|usage.limit/i.test(value)) return errors.rate
  if (/overloaded/i.test(value)) return errors.overloaded
  if (/connection|ECONN|network/i.test(value)) return errors.connection
  if (/max_turns/i.test(value)) return errors.max
  return errors.other
}

interface Executable {
  command: string
  prefix: string[]
}
const system = (name: string): string =>
  join(process.env.SystemRoot || 'C:\\Windows', 'System32', name)
function file(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
function findNode(): string | null {
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    const candidate = resolve(directory.replace(/^"|"$/g, ''), 'node.exe')
    if (file(candidate)) return candidate
  }
  return null
}
function executable(path: string): Executable | null {
  if (!file(path)) return null
  if (/\.(exe|com)$/i.test(path)) return { command: path, prefix: [] }
  if (!/\.(cmd|bat)$/i.test(path)) return null
  // 단일 Node 호출만 해석한다. 조건문·변수 확장·여러 명령이 있는 shim은 실행하지 않는다.
  let shim: string
  try {
    shim = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  const lines = shim
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^@?echo off$/i.test(line))
  if (lines.length !== 1) return null
  const match = lines[0].match(
    /^@?(?:"node(?:\.exe)?"|node(?:\.exe)?|"%(?:~dp0|dp0%)[\\/]node\.exe")\s+"%(?:~dp0|dp0%)[\\/]([^"\r\n]+\.(?:js|cjs|mjs))"\s+%\*\s*$/i
  )
  if (!match || match[1].includes('%') || /[&|<>^]/.test(match[1])) return null
  const script = resolve(dirname(path), match[1])
  const node = file(join(dirname(path), 'node.exe')) ? join(dirname(path), 'node.exe') : findNode()
  return node && file(script) ? { command: node, prefix: [script] } : null
}
function findClaude(): Executable | null {
  const override = process.env.BEAVERBANK_CLAUDE_PATH
  if (override !== undefined) return isAbsolute(override) ? executable(override) : null
  const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const extension of extensions) {
      const result = executable(resolve(directory.replace(/^"|"$/g, ''), 'claude' + extension))
      if (result) return result
    }
  }
  return executable(join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe'))
}

interface Managed {
  child: ChildProcessWithoutNullStreams
  close: () => Promise<void>
}
function managed(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Managed {
  const child = spawn(command, args, { ...options, windowsHide: true, shell: false, stdio: 'pipe' })
  const owned = new Map<number, string>()
  let scanning: Promise<void> | undefined
  let cleanup: Promise<void> | undefined
  const scan = (): Promise<void> => {
    if (scanning) return scanning
    if (!child.pid) return Promise.resolve()
    const roots = [child.exitCode === null ? child.pid : undefined, ...owned.keys()]
      .filter(Number.isInteger)
      .join(',')
    if (!roots) return Promise.resolve()
    const code = `$all=Get-CimInstance Win32_Process; $ids=@(${roots}); do {$new=@($all | Where-Object {$ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId} | ForEach-Object {$_.ProcessId}); $ids+= $new} while ($new.Count); @($all | Where-Object {$ids -contains $_.ProcessId} | Select-Object ProcessId,@{n='created';e={$_.CreationDate.ToUniversalTime().Ticks.ToString()}}) | ConvertTo-Json -Compress`
    scanning = new Promise<void>((done) => {
      const probe = spawn(
        system('WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-Command', code],
        { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
      )
      if (probe.pid) {
        try {
          // 백그라운드 추적이 클라이언트의 첫 답과 CPU를 다투지 않게 한다.
          setPriority(probe.pid, constants.priority.PRIORITY_BELOW_NORMAL)
        } catch {
          /* 이미 종료된 조회 */
        }
      }
      let output = ''
      probe.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })
      const timer = setTimeout(() => probe.kill(), 1500)
      probe.on('error', () => {
        clearTimeout(timer)
        done()
      })
      probe.on('close', () => {
        clearTimeout(timer)
        try {
          const rows = JSON.parse(output)
          for (const row of Array.isArray(rows) ? rows : [rows])
            owned.set(row.ProcessId, row.created)
        } catch {
          /* 종료와 겹친 빈 표본 */
        }
        done()
      })
    }).finally(() => {
      scanning = undefined
    })
    return scanning
  }
  // 클라이언트 실행 직후 추적한다. 의도적으로 분리된 짧은 부모의 자손은 보장하지 않는다.
  void scan()
  const interval = setInterval(() => {
    void scan()
  }, 500)
  child.stdin.on('error', () => {})
  const kill = (pid: number): Promise<void> =>
    new Promise((done) => {
      const killer = spawn(system('taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        shell: false,
        stdio: 'ignore'
      })
      killer.on('error', () => done())
      killer.on('close', () => done())
    })
  return {
    child,
    close: () => {
      if (cleanup) return cleanup
      clearInterval(interval)
      cleanup = (async () => {
        // 살아 있는 트리를 먼저 끝내고, 기록한 자손은 생성 시각까지 확인한다.
        if (child.pid && child.exitCode === null) await kill(child.pid)
        await scanning
        if (owned.size) {
          const code = `@(${[...owned].map(([pid, created]) => `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p -and $p.CreationDate.ToUniversalTime().Ticks.ToString() -eq '${created}') {${pid}}`).join(';')}) | ConvertTo-Json -Compress`
          await new Promise<void>((done) => {
            const probe = spawn(
              system('WindowsPowerShell/v1.0/powershell.exe'),
              ['-NoProfile', '-NonInteractive', '-Command', code],
              { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] }
            )
            let output = ''
            probe.stdout.on('data', (chunk) => {
              output += chunk.toString()
            })
            probe.on('error', () => done())
            probe.on('close', () => {
              void (async () => {
                try {
                  const ids = JSON.parse(output)
                  await Promise.all(
                    (Array.isArray(ids) ? ids : [ids]).filter(Number.isInteger).map(kill)
                  )
                } catch {
                  /* 이미 종료됨 */
                }
                done()
              })()
            })
          })
        }
        child.stdin.destroy()
        child.stdout.destroy()
        child.stderr.destroy()
      })()
      return cleanup
    }
  }
}
export class ChatClient {
  readonly snapshot: ChatSnapshot = {
    revision: 0,
    epoch: randomUUID(),
    settings: readChatSettings(),
    source: 'demo',
    demo: process.argv.includes('--demo'),
    status: { state: 'unknown' },
    replies: []
  }
  private checking?: Promise<void>
  private checks = new Set<Managed>()
  private checked = false
  private lifecycle = 0
  private session?: string
  private loginCheck?: Promise<void>
  private run?: {
    id: string
    process?: Managed
    finish: (state: ChatReply['state'], error?: string, clear?: boolean) => Promise<void>
  }
  private runFolder = join(app.getPath('userData'), 'chat', 'run')
  constructor() {
    mkdirSync(this.runFolder, { recursive: true })
    for (const name of readdirSync(this.runFolder))
      if (/^[\da-f-]+\.(mcp\.json|settings\.json|instructions\.txt)$/.test(name))
        rmSync(join(this.runFolder, name), { force: true })
  }
  private publish(): void {
    this.snapshot.revision++
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed()) window.webContents.send('chat:changed', this.snapshot)
  }
  private async statusCommand(
    exe: Executable,
    args: string[],
    deadline: number
  ): Promise<{ code: number | null; text: string }> {
    const task = managed(exe.command, [...exe.prefix, ...args])
    this.checks.add(task)
    try {
      return await new Promise((resolve) => {
        let text = ''
        const decoder = new StringDecoder('utf8')
        const timer = setTimeout(
          () => {
            resolve({ code: null, text: '' })
            void task.close()
          },
          Math.max(1, deadline - Date.now())
        )
        task.child.stdout.on('data', (chunk) => {
          text += decoder.write(chunk)
        })
        task.child.on('error', () => {
          clearTimeout(timer)
          resolve({ code: null, text: '' })
        })
        task.child.on('close', (code) => {
          clearTimeout(timer)
          resolve({ code, text: text + decoder.end() })
        })
      })
    } finally {
      await task.close()
      this.checks.delete(task)
    }
  }
  async check(): Promise<void> {
    if (this.checking) return this.checking
    this.checked = true
    const lifecycle = this.lifecycle
    this.snapshot.status = { state: 'checking' }
    this.publish()
    this.checking = (async () => {
      const exe = findClaude()
      if (!exe) {
        this.snapshot.status = { state: 'missing' }
        return
      }
      const deadline = Date.now() + 10000
      let timeout = false
      const timer = setTimeout(() => {
        timeout = true
        this.snapshot.status = { state: 'unknown' }
        this.publish()
      }, 10000)
      try {
        const versionResult = await this.statusCommand(exe, ['-v'], deadline)
        if (lifecycle !== this.lifecycle) return
        if (versionResult.code !== 0 || Date.now() >= deadline) {
          this.snapshot.status = { state: 'unknown' }
          return
        }
        const version = versionResult.text.match(/\b(\d+\.\d+\.\d+)\b/)?.[1]
        const auth = await this.statusCommand(exe, ['auth', 'status'], deadline)
        if (lifecycle !== this.lifecycle) return
        if (timeout || auth.code === null) {
          this.snapshot.status = { state: 'unknown' }
          return
        }
        let loggedIn: boolean | undefined
        try {
          const value = JSON.parse(auth.text).loggedIn
          if (typeof value === 'boolean') loggedIn = value
        } catch {
          /* JSON 없는 상태는 확인 불가 */
        }
        const parts = version?.split('.').map(Number)
        const verified =
          !!parts &&
          (parts[0] > 2 ||
            (parts[0] === 2 && (parts[1] > 1 || (parts[1] === 1 && parts[2] >= 284))))
        this.snapshot.status = {
          state:
            loggedIn && auth.code === 0
              ? 'ready'
              : loggedIn === false
                ? 'login'
                : 'unknown',
          version,
          verified
        }
      } finally {
        clearTimeout(timer)
      }
    })().finally(() => {
      this.checking = undefined
      this.publish()
    })
    return this.checking
  }
  async request(request: ChatRequest): Promise<ChatSnapshot> {
    if (request.kind === 'settings') {
      if (typeof request.open === 'boolean') this.snapshot.settings.open = request.open
      if (!this.run && request.model && chatModels.includes(request.model))
        this.snapshot.settings.model = request.model
      writeChatSettings(this.snapshot.settings)
      if (this.snapshot.settings.open && !this.checked) void this.check()
    }
    if (request.kind === 'check' && !this.run) void this.check()
    if (
      request.kind === 'send' &&
      request.epoch === this.snapshot.epoch &&
      !this.run &&
      typeof request.text === 'string' &&
      request.text.trim() &&
      request.text.length <= 4000
    ) {
      const reply: ChatReply = {
        id: randomUUID(),
        prompt: request.text,
        model: this.snapshot.settings.model,
        blocks: [],
        state: 'running',
        elapsed: 0,
        waiting: true
      }
      this.snapshot.replies.push(reply)
      void this.start(reply)
    }
    if (request.kind === 'retry' && request.epoch === this.snapshot.epoch && !this.run) {
      const reply = this.snapshot.replies.find(
        (item) => item.id === request.id && item.state === 'error'
      )
      if (reply) {
        reply.blocks = []
        reply.error = undefined
        reply.detail = undefined
        reply.retry = undefined
        reply.state = 'running'
        reply.elapsed = 0
        reply.waiting = true
        void this.start(reply)
      }
    }
    if (request.kind === 'stop') await this.run?.finish('stopped')
    if (
      request.kind === 'reset' &&
      (!request.source ||
        request.source === 'demo' ||
        (!this.snapshot.demo && request.source === 'real'))
    ) {
      await this.run?.finish('stopped')
      this.session = undefined
      this.snapshot.epoch = randomUUID()
      this.snapshot.replies = []
      if (request.source) this.snapshot.source = request.source
    }
    this.publish()
    return this.snapshot
  }
  private confirmLoginFailure(lifecycle: number): Promise<void> {
    if (lifecycle !== this.lifecycle) return Promise.resolve()
    if (this.loginCheck) return this.loginCheck
    const exe = findClaude()
    if (!exe) {
      this.snapshot.status = { state: 'missing' }
      this.publish()
      return Promise.resolve()
    }
    // 실제 응답의 인증 실패를 상태 명령의 캐시된 로그인 결과로 덮지 않는다.
    this.loginCheck = this.statusCommand(exe, ['auth', 'status'], Date.now() + 10000)
      .then(() => {})
      .finally(() => {
        this.loginCheck = undefined
      })
    return this.loginCheck
  }
  private async start(reply: ChatReply): Promise<void> {
    const lifecycle = this.lifecycle
    const runId = randomUUID()
    reply.runId = runId
    const files: string[] = []
    let task: Managed | undefined
    let closed = false
    let cleanup: Promise<void> | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let stderr = ''
    const finish = (state: ChatReply['state'], error?: string, clear = false): Promise<void> => {
      if (cleanup) return cleanup
      closed = true
      clearInterval(timer)
      if (clear) reply.blocks = []
      reply.waiting = false
      reply.retry = undefined
      reply.error = error
      if (error === errors.other)
        reply.detail = stderr.trimEnd().split(/\r?\n/).slice(-20).join('\n')
      for (const block of reply.blocks)
        if (block.kind === 'tool' && block.state === 'running') block.state = 'error'
      this.publish()
      cleanup = (async () => {
        await task?.close()
        for (const path of files) rmSync(path, { force: true })
        reply.state = state
        if (this.run?.id === runId) this.run = undefined
        this.publish()
      })()
      return cleanup
    }
    this.run = { id: runId, finish }
    this.publish()
    try {
      const exe = findClaude()
      if (!exe) {
        this.snapshot.status = { state: 'missing' }
        await finish('error', 'Claude Code를 찾지 못했습니다.')
        void this.check()
        return
      }
      if (this.snapshot.status.state !== 'ready') {
        await finish('error', errors.login)
        void this.check()
        return
      }
      const gate = join(__dirname, '../mcp/chat-gate.cjs')
      const server = join(__dirname, '../mcp/server.cjs')
      if (!existsSync(gate) || !existsSync(server)) {
        await finish('error', errors.build)
        return
      }
      const node = findNode()
      if (!node) {
        await finish('error', errors.node)
        return
      }
      const dataError = checkChatData(this.snapshot.source)
      if (dataError) {
        await finish('error', dataError)
        return
      }
      const workspace = join(app.getPath('userData'), 'chat', 'workspace')
      mkdirSync(workspace, { recursive: true })
      const mcp = join(this.runFolder, `${runId}.mcp.json`)
      const settings = join(this.runFolder, `${runId}.settings.json`)
      const prompt = join(this.runFolder, `${runId}.instructions.txt`)
      files.push(mcp, settings, prompt)
      writeFileSync(
        mcp,
        JSON.stringify({
          mcpServers: {
            'beaverbank-chat': {
              type: 'stdio',
              command: node,
              args: [
                gate,
                '--',
                node,
                server,
                '--data',
                this.snapshot.source,
                '--data-root',
                app.getPath('appData')
              ]
            }
          }
        })
      )
      writeFileSync(settings, '{"disableAllHooks":true}')
      writeFileSync(prompt, instructions, 'utf8')
      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--strict-mcp-config',
        '--mcp-config',
        mcp,
        '--tools',
        '',
        '--allowedTools',
        'mcp__beaverbank-chat__*',
        '--permission-prompts',
        'none',
        '--settings',
        settings,
        '--append-system-prompt-file',
        prompt,
        '--max-turns',
        '12',
        '--restricted'
      ]
      if (reply.model !== 'default') args.push('--model', reply.model)
      if (this.session) args.push('--resume', this.session)
      task = managed(exe.command, [...exe.prefix, ...args], {
        cwd: workspace,
        env: {
          ...process.env,
          CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1'
        }
      })
      this.run.process = task
      task.child.stdin.end(reply.prompt, 'utf8')
      const decoder = new StringDecoder('utf8')
      const errorDecoder = new StringDecoder('utf8')
      let buffer = ''
      let initialized = false
      let partial = false
      let retryError = ''
      let lastOutput = Date.now()
      let waitingSince = Date.now()
      const text = (value: string): void => {
        if (!value) return
        const last = reply.blocks[reply.blocks.length - 1]
        if (last?.kind === 'text') last.text += value
        else reply.blocks.push({ kind: 'text', text: value })
        reply.waiting = false
      }
      const event = (line: string): void => {
        if (closed || !line.trim()) return
        // CLI 사건은 신뢰 경계 밖이다. 식별한 필드만 화면 계약으로 옮긴다.
        const item = JSON.parse(line)
        if (item.type === 'system' && item.subtype === 'init') {
          if (
            !Array.isArray(item.tools) ||
            item.tools.some(
              (name: unknown) => typeof name !== 'string' || !readTools.includes(name)
            ) ||
            item.permissionMode !== 'default'
          ) {
            void finish('error', errors.tools, true)
            return
          }
          if (
            item.tools.length !== readTools.length ||
            readTools.some((name) => !item.tools.includes(name))
          ) {
            void finish('error', errors.missingTools, true)
            return
          }
          initialized = true
          if (typeof item.session_id === 'string') this.session = item.session_id
        } else if (item.type === 'system' && item.subtype === 'api_retry') {
          retryError = typeof item.error === 'string' ? item.error : JSON.stringify(item.error)
          if (retryError.includes('authentication_failed')) {
            this.snapshot.status = { state: 'login' }
            void finish('error', errors.login).then(() => this.confirmLoginFailure(lifecycle))
            return
          }
          reply.retry = `다시 시도하는 중 (${item.attempt}/${item.max_retries})`
          reply.waiting = true
        } else if (
          item.type === 'stream_event' ||
          item.type === 'assistant' ||
          item.type === 'user'
        ) {
          if (!initialized) {
            void finish('error', errors.tools, true)
            return
          }
          const delta = item.event?.delta
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            text(delta.text)
            partial = true
          }
          if (Array.isArray(item.message?.content)) {
            for (const block of item.message.content) {
              if (block.type === 'text' && typeof block.text === 'string' && !partial)
                text(block.text)
              if (block.type === 'tool_use') {
                if (!readTools.includes(block.name)) continue
                if (!reply.blocks.some((old) => old.kind === 'tool' && old.id === block.id))
                  reply.blocks.push({
                    kind: 'tool',
                    id: block.id,
                    name: block.name.slice('mcp__beaverbank-chat__'.length),
                    input: block.input,
                    state: 'running'
                  })
                reply.waiting = false
              }
              if (block.type === 'tool_result') {
                const tool = reply.blocks.find(
                  (old) => old.kind === 'tool' && old.id === block.tool_use_id
                )
                if (tool?.kind === 'tool') tool.state = block.is_error ? 'error' : 'done'
                reply.waiting = true
                waitingSince = Date.now()
              }
            }
            if (item.type === 'assistant') partial = false
          }
        } else if (item.type === 'result') {
          if (!initialized) {
            void finish('error', errors.missingTools, true)
            return
          }
          if (typeof item.session_id === 'string') this.session = item.session_id
          if (item.is_error || item.subtype !== 'success') {
            const message = errorMessage(
              `${item.subtype} ${retryError} ${JSON.stringify(item.errors || '')}`
            )
            if (message === errors.login) this.snapshot.status = { state: 'login' }
            void finish('error', message).then(() => {
              if (message === errors.login) return this.confirmLoginFailure(lifecycle)
              return undefined
            })
            return
          }
          if (
            !reply.blocks.some((block) => block.kind === 'text') &&
            typeof item.result === 'string'
          )
            text(item.result)
          void finish('done')
          return
        }
        this.publish()
      }
      task.child.stdout.on('data', (chunk) => {
        if (closed) return
        lastOutput = Date.now()
        buffer += decoder.write(chunk)
        let newline: number
        try {
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline)
            buffer = buffer.slice(newline + 1)
            event(line)
          }
        } catch {
          void finish('error', errors.other)
        }
      })
      task.child.stderr.on('data', (chunk) => {
        if (closed) return
        lastOutput = Date.now()
        stderr = (stderr + errorDecoder.write(chunk)).split(/\r?\n/).slice(-21).join('\n')
      })
      task.child.on('error', (error) => {
        stderr += error.message
        void finish('error', errors.other)
      })
      task.child.on('close', () => {
        if (closed) return
        try {
          buffer += decoder.end()
          if (buffer.trim()) event(buffer)
        } catch {
          /* 아래 일반 오류 */
        }
        if (!closed) {
          const message = errorMessage(retryError + stderr)
          if (message === errors.login) this.snapshot.status = { state: 'login' }
          void finish('error', message).then(() => {
            if (message === errors.login) return this.confirmLoginFailure(lifecycle)
            return undefined
          })
        }
      })
      timer = setInterval(() => {
        if (closed) return
        reply.elapsed = Math.floor((Date.now() - waitingSince) / 1000)
        if (Date.now() - lastOutput >= 600000) void finish('error', errors.silent)
        else this.publish()
      }, 1000)
    } catch (error) {
      stderr += String(error)
      await finish('error', errors.other)
    }
  }
  async dispose(): Promise<void> {
    this.lifecycle++
    this.snapshot.epoch = randomUUID()
    if (this.snapshot.status.state === 'checking') this.snapshot.status = { state: 'unknown' }
    await this.run?.finish('stopped')
    await Promise.all([...this.checks].map((task) => task.close()))
    await this.loginCheck
  }
}

export function registerChat(): ChatClient {
  const chat = new ChatClient()
  ipcMain.handle('chat:get', () => chat.snapshot)
  ipcMain.handle('chat:request', (_, request: ChatRequest) => chat.request(request))
  if (chat.snapshot.settings.open) void chat.check()
  return chat
}
