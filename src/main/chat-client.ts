import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { constants, setPriority } from 'node:os'
import {
  chatModels,
  chatSetupTasks,
  type ChatSnapshot,
  type ChatRequest,
  type ChatReply,
  type ChatSetupAction,
  type ChatSetupTask,
  type ChatStatus
} from '../shared/chat'
import { readChatSettings, writeChatSettings } from './chat-settings'
import { checkChatData, readChatNames } from './chat-data'
import { writeToolNames } from '../shared/chat-gate'
import { ChatApproval } from './chat-approval'
import { findClient, findNode, type ChatClientName, type Executable } from './chat-find'
import {
  copyText,
  hasSemicolon,
  integrity,
  judge,
  openFailed,
  readFacts,
  resultLine,
  setupReasons,
  setupWindow,
  taskFor,
  watchScript,
  type SetupFacts,
  type SetupWindow
} from './chat-setup'

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

const system = (name: string): string =>
  join(process.env.SystemRoot || 'C:\\Windows', 'System32', name)

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
    writeEnabled: false,
    demo: process.argv.includes('--demo'),
    status: { state: 'unknown' },
    codex: { state: 'unknown' },
    setup: {},
    replies: []
  }
  private checking?: Promise<void>
  private codexChecking?: Promise<void>
  private checkAbort: Partial<Record<ChatClientName, AbortController>> = {}
  private checks = new Set<Managed>()
  private checked = false
  private lifecycle = 0
  private found: Partial<Record<ChatClientName, Executable | null>> = {}
  // 권한 수준은 성공한 결과만 앱이 도는 동안 기억한다. 실패는 다음 확인에서 다시 시도한다.
  private admin?: 'yes' | 'no'
  private adminCheck?: Promise<void>
  private adminTried = false
  private copies = 0
  private session?: string
  private loginCheck?: Promise<void>
  private run?: {
    id: string
    process?: Managed
    approval?: ChatApproval
    finish: (state: ChatReply['state'], error?: string, clear?: boolean) => Promise<void>
  }
  private runFolder = join(app.getPath('userData'), 'chat', 'run')
  private setupFolder = join(app.getPath('userData'), 'chat', 'setup')
  // 승인 직전에 준비한 작업 창(한 번만 쓴다, CS-48)
  private pending?: SetupWindow
  // 열려 있는 작업 창. 감시는 다시 불러오기에도 이어지고 앱 종료 때만 그친다(CS-37, CS-44).
  private window?: {
    task: ChatSetupTask
    client: ChatClientName
    token: string
    watcher?: ChildProcess
    retry?: ReturnType<typeof setTimeout>
    identity?: { pid: number; created: string }
    watchFailure?: { since: number; elapsedMs: number }
    phase: 'finding' | 'found' | 'done'
  }
  // 창을 열지 못한 작업(CS-41). 그 클라이언트의 다음 상태 확인이 끝나거나 다음 작업을 시작할 때까지 명령 복사다.
  private failed: Partial<Record<ChatClientName, ChatSetupTask>> = {}
  // 창이 닫힌 뒤 결과 줄을 정할 작업(CS-43)
  private awaiting: Partial<Record<ChatClientName, ChatSetupTask>> = {}
  constructor() {
    mkdirSync(this.runFolder, { recursive: true })
    for (const name of readdirSync(this.runFolder))
      if (/^[\da-f-]+\.(mcp\.json|settings\.json|instructions\.txt)$/.test(name))
        rmSync(join(this.runFolder, name), { force: true })
    // 켤 때 남은 표지 파일만 지운다(CS-46). 그 전에 연 작업 창은 지켜보지 않는다. 폴더가 없으면 만들지 않는다.
    if (existsSync(this.setupFolder))
      for (const name of readdirSync(this.setupFolder))
        if (/^[0-9a-f]{32}\.open$/.test(name)) rmSync(join(this.setupFolder, name), { force: true })
    // 앱을 끌 때만 작업 창 감시를 그친다. 창 PowerShell과 Windows Terminal은 끝내지 않는다(CS-44).
    app.on('before-quit', () => this.stopWatching())
  }
  private publish(): void {
    this.refreshSetup()
    this.snapshot.revision++
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed()) window.webContents.send('chat:changed', this.snapshot)
  }
  private facts(): SetupFacts {
    // 권한 확인이 아직 없거나 진행 중이면 판정을 미룬다(작업 표시 없음).
    const admin = this.admin ?? (this.adminCheck || !this.adminTried ? 'pending' : 'unknown')
    return readFacts(this.setupFolder, admin)
  }
  // 상태에 맞는 작업마다 선행 조건과 명령 복사를 다시 판정한다. 작업이 없으면 파일을 보지 않는다.
  // 작업 창이 열려 있으면 모든 작업 단추가, 답을 받는 동안에는 Claude 작업 단추가 흐리다(CS-47, CS-49).
  private refreshSetup(): void {
    const tasks = {
      claude: taskFor('claude', this.snapshot.status),
      codex: taskFor('codex', this.snapshot.codex)
    }
    const facts = tasks.claude || tasks.codex ? this.facts() : undefined
    const action = (client: ChatClientName): ChatSetupAction | undefined => {
      const task = tasks[client]
      const value = task && facts && judge(task, facts, this.found[client])
      if (!value || value.mode === 'blocked') return value
      // 창을 열지 못한 작업은 명령 복사다(CS-41, CS-80 셋째 경우).
      if (value.mode === 'window' && this.failed[client] === value.task) {
        const command = copyText(value.task, this.found[client], facts.override)
        return { ...value, mode: 'copy', notice: openFailed, command, title: undefined }
      }
      const busy =
        value.mode !== 'window'
          ? undefined
          : this.window
            ? setupReasons.busy
            : client === 'claude' && this.run
              ? setupReasons.replying
              : undefined
      return busy && !value.disabled ? { ...value, dimmed: true, disabled: busy } : value
    }
    this.snapshot.setup = {
      claude: action('claude'),
      codex: action('codex'),
      copy: this.snapshot.setup.copy,
      pending: this.snapshot.setup.pending,
      running: this.snapshot.setup.running,
      results: this.snapshot.setup.results
    }
  }
  // 실행 확인 팝업을 열 때: main이 다시 판단하고, 창 작업이면 새 토큰과 창 명령 줄을 준비만 한다(프로세스 없음).
  private prepareWindow(task: ChatSetupTask): void {
    this.pending = undefined
    this.snapshot.setup.pending = undefined
    this.refreshSetup()
    const client: ChatClientName = task.startsWith('claude') ? 'claude' : 'codex'
    const action = this.snapshot.setup[client]
    if (action?.task !== task || action.mode !== 'window' || action.dimmed) return
    const window = setupWindow(task, this.facts(), this.found[client])
    if (!window || hasSemicolon(window)) return
    this.pending = window
    this.snapshot.setup.pending = {
      task,
      token: window.token,
      title: window.title,
      display: window.display
    }
  }
  // 승인(CS-25, CS-47, CS-48): 준비한 작업·토큰과 같고, 다시 판단해도 시작할 수 있을 때만 그 인수 그대로 연다.
  private startWindow(task: ChatSetupTask, token: string): void {
    const window = this.pending
    this.pending = undefined
    this.snapshot.setup.pending = undefined
    if (!window || window.task !== task || window.token !== token || this.window) return
    this.refreshSetup()
    const client: ChatClientName = task.startsWith('claude') ? 'claude' : 'codex'
    const action = this.snapshot.setup[client]
    if (action?.task !== task || action.mode !== 'window' || action.dimmed) return
    this.openWindow(window, client)
  }
  // 작업 창을 여는 곳은 여기 하나다(CS-30, CS-31, CS-34, CS-35). wt.exe를 셸 없이, 창을 숨기지 않고,
  // 표준 입출력을 잇지 않고, 분리하지 않고 연다. 환경 변수는 앱 것 그대로다(CS-36). managed()를 쓰지 않아
  // 정리 코드의 taskkill이 작업 창에 닿지 않는다. wt.exe의 끝·종료 코드로 결과를 판단하지 않는다(CS-32).
  private openWindow(window: SetupWindow, client: ChatClientName): void {
    const approvedAt = Date.now()
    this.window = { task: window.task, client, token: window.token, phase: 'finding' }
    this.snapshot.setup.running = { task: window.task, client, title: window.title }
    delete this.failed[client]
    delete this.awaiting[client]
    if (this.snapshot.setup.results) delete this.snapshot.setup.results[client]
    // spawn()이 수백 ms 돌아오지 않을 수 있어 "작업 중"을 먼저 보이고 다음 차례에 띄운다.
    this.publish()
    setImmediate(() => {
      const state = this.window
      if (state?.token !== window.token) return
      let child: ChildProcess
      const started = Date.now()
      try {
        mkdirSync(this.setupFolder, { recursive: true })
        child = spawn(window.program, window.args, {
          shell: false,
          windowsHide: false,
          stdio: 'ignore',
          cwd: process.env.USERPROFILE
        })
      } catch {
        this.windowFailed(window.token)
        return
      }
      if (this.snapshot.setup.running?.task === window.task)
        this.snapshot.setup.running.spawnMs = Date.now() - started
      child.on('error', () => this.windowFailed(window.token))
      // 시작 뒤 10초 안에 찾아야 한다. 결과 줄이 승인 뒤 10초 안에 보이게 조금 앞서 판단한다(CS-41).
      this.watch(window, Math.max(1000, approvedAt + 9000 - Date.now()))
    })
  }
  // 창 없는 감시 하나가 토큰으로 창 PowerShell을 찾고, 그 프로세스가 끝나면 알린다(CS-32, CS-42).
  // this.checks에 넣지 않고 lifecycle과 무관하다(다시 불러오기에도 이어짐).
  private watch(window: SetupWindow, findMs: number): void {
    const state = this.window
    if (!state || state.token !== window.token) return
    const findUntil = Date.now() + findMs
    const watcher = spawn(
      system('WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        watchScript(window.token, window.marker, findMs, state.identity)
      ],
      { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    state.watcher = watcher
    let output = ''
    let verdict: 'found' | 'notfound' | 'closed' | undefined
    watcher.stdout.on('data', (chunk) => {
      output += chunk.toString()
      for (const line of output.split(/\r?\n/).slice(0, -1)) {
        if (line.startsWith('found ')) {
          const found = /^found (\d+) (\S+)$/.exec(line)
          if (
            found &&
            this.window === state &&
            state.watcher === watcher &&
            state.phase !== 'done'
          ) {
            verdict = 'found'
            state.phase = 'found'
            state.identity = { pid: Number(found[1]), created: found[2] }
            if (state.watchFailure) {
              state.watchFailure = undefined
              if (this.snapshot.setup.running) delete this.snapshot.setup.running.watchFailure
              this.publish()
            }
          }
        } else if (line === 'notfound' || line === 'closed') verdict = line
      }
      output = output.slice(output.lastIndexOf('\n') + 1)
    })
    const retry = (): void => {
      if (this.window !== state || state.phase === 'done' || state.watcher !== watcher) return
      state.watcher = undefined
      const now = Date.now()
      state.watchFailure ??= { since: now, elapsedMs: 0 }
      state.watchFailure.elapsedMs = now - state.watchFailure.since
      if (this.snapshot.setup.running)
        this.snapshot.setup.running.watchFailure = { ...state.watchFailure }
      this.publish()
      // 감시 상실은 창 닫힘이 아니다. 작업 중 안내·잠금을 유지하고 같은 창을 다시 조회한다.
      state.retry = setTimeout(() => {
        state.retry = undefined
        this.watch(window, Math.max(0, findUntil - Date.now()))
      }, 400)
    }
    watcher.on('error', retry)
    watcher.on('close', (code) => {
      if (this.window !== state || state.phase === 'done' || state.watcher !== watcher) return
      if (code === 0 && verdict === 'closed') this.windowClosed(window.token)
      else if (code === 0 && verdict === 'notfound' && state.phase === 'finding')
        this.windowFailed(window.token)
      else retry()
    })
  }
  // 창을 열지 못함(CS-41): 상태는 그대로, 결과 줄, 그 작업은 명령 복사.
  private windowFailed(token: string): void {
    const state = this.window
    if (state?.token !== token || state.phase === 'done') return
    state.phase = 'done'
    clearTimeout(state.retry)
    this.window = undefined
    state.watcher?.kill()
    this.snapshot.setup.running = undefined
    this.failed[state.client] = state.task
    this.snapshot.setup.results = {
      ...this.snapshot.setup.results,
      [state.client]: { task: state.task, ok: false, text: openFailed }
    }
    this.publish()
  }
  // 창이 닫힘(CS-42): 2초 안에 그 클라이언트의 상태 확인을 시작하고, 끝나면 결과 줄을 정한다(CS-43).
  private windowClosed(token: string): void {
    const state = this.window
    if (state?.token !== token || state.phase === 'done') return
    state.phase = 'done'
    clearTimeout(state.retry)
    this.window = undefined
    this.snapshot.setup.running = undefined
    const client = state.client
    // 닫히기 전 확인은 취소하고 정리만 기다린다. 남은 상태 명령은 실행하지 않는다(CS-19, CS-42).
    const inflight = client === 'claude' ? this.checking : this.codexChecking
    this.checkAbort[client]?.abort()
    const recheck = (): Promise<void> => {
      this.awaiting[client] = state.task
      return client === 'claude' ? this.check() : this.checkCodex()
    }
    if (inflight) void inflight.finally(recheck)
    else void recheck()
    this.publish()
  }
  // 앱 종료 때 우리 감시 조회 프로세스만 그친다. 창 PowerShell·Windows Terminal에는 닿지 않는다(CS-44).
  private stopWatching(): void {
    const state = this.window
    if (!state) return
    state.phase = 'done'
    clearTimeout(state.retry)
    state.watcher?.kill()
  }
  // 상태 확인이 끝날 때: 창이 닫힌 뒤의 확인이면 결과 줄을 정하고, 아니면 그 클라이언트의 결과 줄과 명령 복사 대체를 지운다.
  private settleSetup(client: ChatClientName, status: ChatStatus): void {
    const task = this.awaiting[client]
    delete this.awaiting[client]
    delete this.failed[client]
    const results = { ...this.snapshot.setup.results }
    if (task) results[client] = resultLine(task, status)
    else delete results[client]
    this.snapshot.setup.results = results
  }
  // 관리자 판정(CS-39): whoami의 무결성 SID. 결과가 필요해질 때 처음 한 번 실행한다.
  private ensureAdmin(): Promise<void> {
    if (this.admin) return Promise.resolve()
    if (this.adminCheck) return this.adminCheck
    const lifecycle = this.lifecycle
    this.adminTried = true
    this.adminCheck = this.statusCommand(
      { command: system('whoami.exe'), prefix: [] },
      ['/groups', '/fo', 'csv', '/nh'],
      Date.now() + 5000
    )
      .then(({ code, text }) => {
        const level = code === 0 ? integrity(text) : 'unknown'
        if (lifecycle === this.lifecycle && level !== 'unknown') this.admin = level
      })
      .finally(() => {
        this.adminCheck = undefined
      })
    return this.adminCheck
  }
  private async prepareSetup(
    lifecycle: number,
    claude: ChatStatus,
    codex: ChatStatus
  ): Promise<void> {
    if (lifecycle !== this.lifecycle || this.admin) return
    if (taskFor('claude', claude) || taskFor('codex', codex)) await this.ensureAdmin()
  }
  // 명령 복사(CS-83): main이 판정을 다시 하고 글자를 만들어 클립보드에 쓰기만 한다.
  private async copy(task: ChatSetupTask): Promise<void> {
    this.refreshSetup()
    const action = this.snapshot.setup[task.startsWith('claude') ? 'claude' : 'codex']
    if (action?.task !== task || action.mode !== 'copy' || action.dimmed || !action.command) return
    let ok = false
    try {
      await clipboard.writeText(action.command)
      ok = (await clipboard.readText()) === action.command
    } catch {
      ok = false
    }
    this.snapshot.setup.copy = { task, ok, sequence: ++this.copies }
  }
  private async statusCommand(
    exe: Executable,
    args: string[],
    deadline: number,
    read = true,
    signal?: AbortSignal
  ): Promise<{ code: number | null; text: string }> {
    if (signal?.aborted) return { code: null, text: '' }
    const task = managed(exe.command, [...exe.prefix, ...args])
    this.checks.add(task)
    // 자기 상태 명령만 중단한다. 창 PowerShell과 그 감시는 this.checks 밖에 있다.
    const abort = (): void => {
      task.child.kill()
    }
    signal?.addEventListener('abort', abort, { once: true })
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
        // read가 거짓이면 출력을 비우기만 하고 읽거나 남기지 않는다(Codex login status, CS-16).
        task.child.stdout.on('data', (chunk) => {
          if (read) text += decoder.write(chunk)
        })
        task.child.on('error', () => {
          clearTimeout(timer)
          resolve({ code: null, text: '' })
        })
        task.child.on('close', (code) => {
          clearTimeout(timer)
          resolve({ code, text: read ? text + decoder.end() : '' })
        })
      })
    } finally {
      signal?.removeEventListener('abort', abort)
      await task.close()
      this.checks.delete(task)
    }
  }
  async check(): Promise<void> {
    if (this.checking) return this.checking
    this.checked = true
    const lifecycle = this.lifecycle
    const controller = new AbortController()
    this.checkAbort.claude = controller
    const signal = controller.signal
    this.snapshot.status = { state: 'checking' }
    this.publish()
    // 결과는 권한 확인까지 마친 뒤 한 번에 싣는다. 진행 중 확인에 [다시 확인]이 묻히지 않게 한다.
    this.checking = (async () => {
      const status = await this.readClaude(lifecycle, signal)
      if (!status || signal.aborted) return
      await this.prepareSetup(lifecycle, status, this.snapshot.codex)
      if (lifecycle === this.lifecycle && !signal.aborted) {
        this.snapshot.status = status
        this.settleSetup('claude', status)
      }
    })().finally(() => {
      this.checking = undefined
      delete this.checkAbort.claude
      this.publish()
    })
    return this.checking
  }
  private async readClaude(
    lifecycle: number,
    signal: AbortSignal
  ): Promise<ChatStatus | undefined> {
    const exe = findClient('claude')
    this.found.claude = exe
    if (!exe) return { state: 'missing' }
    const deadline = Date.now() + 10000
    let timeout = false
    const timer = setTimeout(() => {
      if (signal.aborted) return
      timeout = true
      this.snapshot.status = { state: 'unknown' }
      this.publish()
    }, 10000)
    try {
      const versionResult = await this.statusCommand(exe, ['-v'], deadline, true, signal)
      if (lifecycle !== this.lifecycle || signal.aborted) return undefined
      if (versionResult.code !== 0 || Date.now() >= deadline) return { state: 'unknown' }
      const version = versionResult.text.match(/\b(\d+\.\d+\.\d+)\b/)?.[1]
      const auth = await this.statusCommand(exe, ['auth', 'status'], deadline, true, signal)
      if (lifecycle !== this.lifecycle || signal.aborted) return undefined
      if (timeout || auth.code === null) return { state: 'unknown' }
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
        (parts[0] > 2 || (parts[0] === 2 && (parts[1] > 1 || (parts[1] === 1 && parts[2] >= 284))))
      return {
        state: loggedIn && auth.code === 0 ? 'ready' : loggedIn === false ? 'login' : 'unknown',
        version,
        verified
      }
    } finally {
      clearTimeout(timer)
    }
  }
  // Codex 상태 확인(CS-16): AI 도구 팝업을 열 때와 그 [다시 확인]에서만 부른다.
  async checkCodex(): Promise<void> {
    if (this.codexChecking) return this.codexChecking
    const lifecycle = this.lifecycle
    const controller = new AbortController()
    this.checkAbort.codex = controller
    const signal = controller.signal
    this.snapshot.codex = { state: 'checking' }
    this.publish()
    this.codexChecking = (async () => {
      const status = await this.readCodex(lifecycle, signal)
      if (!status || signal.aborted) return
      await this.prepareSetup(lifecycle, this.snapshot.status, status)
      if (lifecycle === this.lifecycle && !signal.aborted) {
        this.snapshot.codex = status
        this.settleSetup('codex', status)
      }
    })().finally(() => {
      this.codexChecking = undefined
      delete this.checkAbort.codex
      this.publish()
    })
    return this.codexChecking
  }
  private async readCodex(lifecycle: number, signal: AbortSignal): Promise<ChatStatus | undefined> {
    const exe = findClient('codex')
    this.found.codex = exe
    if (!exe) return { state: 'missing' }
    const deadline = Date.now() + 10000
    let timeout = false
    const timer = setTimeout(() => {
      if (signal.aborted) return
      timeout = true
      this.snapshot.codex = { state: 'unknown' }
      this.publish()
    }, 10000)
    try {
      const versionResult = await this.statusCommand(exe, ['--version'], deadline, true, signal)
      if (lifecycle !== this.lifecycle || signal.aborted) return undefined
      const version = versionResult.text.match(/(?<![\d.])(\d+\.\d+\.\d+)(?![\d.])/)?.[1]
      if (timeout || versionResult.code !== 0 || !version) return { state: 'unknown' }
      const login = await this.statusCommand(exe, ['login', 'status'], deadline, false, signal)
      if (lifecycle !== this.lifecycle || signal.aborted) return undefined
      return timeout || login.code === null
        ? { state: 'unknown' }
        : { state: login.code === 0 ? 'ready' : 'login', version }
    } finally {
      clearTimeout(timer)
    }
  }
  async request(request: ChatRequest): Promise<ChatSnapshot> {
    if (!request || typeof request !== 'object' || typeof request.kind !== 'string')
      return this.snapshot
    if (
      (request.kind === 'card-decision' || request.kind === 'card-received') &&
      request.epoch === this.snapshot.epoch &&
      request.runId === this.run?.id &&
      typeof request.cardId === 'string'
    ) {
      const keys =
        request.kind === 'card-decision'
          ? ['kind', 'epoch', 'runId', 'cardId', 'decision']
          : ['kind', 'epoch', 'runId', 'cardId']
      if (Object.keys(request).every((key) => keys.includes(key))) {
        if (request.kind === 'card-received') this.run?.approval?.received(request.cardId)
        else if (request.decision === 'approve' || request.decision === 'reject')
          this.run?.approval?.decide(request.cardId, request.decision)
      }
    }
    if (
      request.kind === 'write-enabled' &&
      request.epoch === this.snapshot.epoch &&
      !this.run &&
      typeof request.enabled === 'boolean'
    )
      this.snapshot.writeEnabled = request.enabled
    if (request.kind === 'settings') {
      if (typeof request.open === 'boolean') this.snapshot.settings.open = request.open
      if (!this.run && request.model && chatModels.includes(request.model))
        this.snapshot.settings.model = request.model
      writeChatSettings(this.snapshot.settings)
      if (this.snapshot.settings.open && !this.checked) void this.check()
    }
    if (request.kind === 'check' && !this.run) void this.check()
    // AI 도구 팝업 열기와 그 [다시 확인]. 답을 받는 동안 Claude는 마지막 상태를 둔다(CS-21).
    if (request.kind === 'tools-check') {
      // 두 클라이언트의 "확인 중"을 먼저 한 번에 싣고 나서 실행한다. 실행 시작이 늦어도 한쪽만 바뀌어 보이지 않는다.
      if (!this.codexChecking) this.snapshot.codex = { state: 'checking' }
      if (!this.run && !this.checking) this.snapshot.status = { state: 'checking' }
      this.publish()
      void this.checkCodex()
      if (!this.run) void this.check()
      void this.ensureAdmin().then(() => this.publish())
    }
    if (
      request.kind === 'copy' &&
      Object.keys(request).every((key) => key === 'kind' || key === 'task') &&
      chatSetupTasks.includes(request.task)
    )
      await this.copy(request.task)
    // 실행 확인 팝업(CS-25): 준비 → 승인(시작) 또는 취소. 시작은 main이 다시 판단한다(CS-47, CS-48).
    if (
      request.kind === 'setup-prepare' &&
      Object.keys(request).every((key) => key === 'kind' || key === 'task') &&
      chatSetupTasks.includes(request.task)
    )
      this.prepareWindow(request.task)
    if (
      request.kind === 'setup-start' &&
      Object.keys(request).every((key) => ['kind', 'task', 'token'].includes(key)) &&
      chatSetupTasks.includes(request.task) &&
      typeof request.token === 'string'
    )
      this.startWindow(request.task, request.token)
    if (request.kind === 'setup-cancel') {
      this.pending = undefined
      this.snapshot.setup.pending = undefined
    }
    // Claude 작업 창이 열려 있으면 보내기와 다시 시도를 받지 않는다(CS-49).
    const working = this.window?.client === 'claude'
    if (
      request.kind === 'send' &&
      request.epoch === this.snapshot.epoch &&
      !this.run &&
      !working &&
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
    if (
      request.kind === 'retry' &&
      request.epoch === this.snapshot.epoch &&
      !this.run &&
      !working
    ) {
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
      if (request.source && request.source !== this.snapshot.source) {
        this.snapshot.source = request.source
        this.snapshot.writeEnabled = false
      }
    }
    this.publish()
    return this.snapshot
  }
  private confirmLoginFailure(lifecycle: number): Promise<void> {
    if (lifecycle !== this.lifecycle) return Promise.resolve()
    if (this.loginCheck) return this.loginCheck
    const exe = findClient('claude')
    this.found.claude = exe
    if (!exe) {
      this.snapshot.status = { state: 'missing' }
      this.publish()
      return Promise.resolve()
    }
    // 실제 응답의 인증 실패를 상태 명령의 캐시된 로그인 결과로 덮지 않는다.
    this.loginCheck = this.statusCommand(exe, ['auth', 'status'], Date.now() + 10000)
      .then(() => this.prepareSetup(lifecycle, this.snapshot.status, this.snapshot.codex))
      .finally(() => {
        this.loginCheck = undefined
        this.publish()
      })
    return this.loginCheck
  }
  private async start(reply: ChatReply): Promise<void> {
    const lifecycle = this.lifecycle
    const runId = randomUUID()
    const source = this.snapshot.source
    const writeEnabled = this.snapshot.writeEnabled
    const allowedTools = [
      ...readTools,
      ...(writeEnabled ? writeToolNames.map((name) => `mcp__beaverbank-chat__${name}`) : [])
    ]
    reply.runId = runId
    const files: string[] = []
    let task: Managed | undefined
    let closed = false
    let cleanup: Promise<void> | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let stderr = ''
    let approval: ChatApproval | undefined
    let initialized = false
    let silence = 0
    let lastTick = Date.now()
    let paused = false
    const updateSilence = (): void => {
      const now = Date.now()
      if (!paused) silence += now - lastTick
      lastTick = now
      paused = approval?.pending ?? false
    }
    const finish = (state: ChatReply['state'], error?: string, clear = false): Promise<void> => {
      if (cleanup) return cleanup
      closed = true
      approval?.cancel()
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
      const exe = findClient('claude')
      if (!exe) {
        this.snapshot.status = { state: 'missing' }
        await finish('error', 'Claude Code를 찾지 못했습니다.')
        void this.check()
        return
      }
      if (this.snapshot.status.state !== 'ready' || this.window?.client === 'claude') {
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
      const dataError = checkChatData(source)
      if (dataError) {
        await finish('error', dataError)
        return
      }
      const workspace = join(app.getPath('userData'), 'chat', 'workspace')
      if (writeEnabled) {
        approval = new ChatApproval(
          { epoch: this.snapshot.epoch, replyId: reply.id, runId, source },
          (card) => {
            card.names = readChatNames(source)
            reply.blocks.push(card)
            reply.waiting = false
          },
          () => {
            updateSilence()
            this.publish()
          },
          () => !closed && initialized && this.run?.id === runId,
          () => {
            void finish('error', errors.tools, true)
          }
        )
        this.run!.approval = approval
        await approval.listen()
        if (closed) {
          approval.cancel()
          return
        }
      }
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
                ...(approval
                  ? [
                      '--approval-pipe',
                      approval.pipe,
                      '--approval-token',
                      approval.token,
                      '--approval-run',
                      runId
                    ]
                  : []),
                '--',
                node,
                server,
                '--data',
                source,
                '--data-root',
                app.getPath('appData'),
                ...(writeEnabled ? ['--write'] : [])
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
      let partial = false
      let retryError = ''
      lastTick = Date.now()
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
              (name: unknown) => typeof name !== 'string' || !allowedTools.includes(name)
            ) ||
            item.permissionMode !== 'default'
          ) {
            void finish('error', errors.tools, true)
            return
          }
          if (
            item.tools.length !== allowedTools.length ||
            allowedTools.some((name) => !item.tools.includes(name))
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
        silence = 0
        lastTick = Date.now()
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
        silence = 0
        lastTick = Date.now()
        stderr = (stderr + errorDecoder.write(chunk)).split(/\r?\n/).slice(-21).join('\n')
      })
      task.child.on('error', (error) => {
        stderr += error.message
        void finish('error', errors.other)
      })
      task.child.on('exit', () => approval?.cancel())
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
        updateSilence()
        reply.elapsed = Math.floor((Date.now() - waitingSince) / 1000)
        if (silence >= 600000) void finish('error', errors.silent)
        else this.publish()
      }, 1000)
    } catch (error) {
      stderr += String(error)
      await finish('error', errors.other)
    }
  }
  // 다시 불러오기·렌더러 종료·앱 종료 때의 정리. 작업 창과 그 감시는 건드리지 않는다(CS-37). 감시는 앱 종료 때만 그친다.
  async dispose(): Promise<void> {
    this.pending = undefined
    this.snapshot.setup.pending = undefined
    this.lifecycle++
    this.snapshot.epoch = randomUUID()
    if (this.snapshot.status.state === 'checking') this.snapshot.status = { state: 'unknown' }
    if (this.snapshot.codex.state === 'checking') this.snapshot.codex = { state: 'unknown' }
    await this.run?.finish('stopped')
    await Promise.all([...this.checks].map((task) => task.close()))
    await this.loginCheck
    await this.adminCheck
  }
}

export function registerChat(): ChatClient {
  const chat = new ChatClient()
  ipcMain.handle('chat:get', () => chat.snapshot)
  ipcMain.handle('chat:request', (_, request: ChatRequest) => chat.request(request))
  if (chat.snapshot.settings.open) void chat.check()
  return chat
}
