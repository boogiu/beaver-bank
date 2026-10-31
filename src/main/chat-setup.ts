import { randomBytes } from 'node:crypto'
import { lstatSync, readFileSync, statSync } from 'node:fs'
import { machine, release } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import type { ChatSetupAction, ChatSetupResult, ChatSetupTask, ChatStatus } from '../shared/chat'
import type { ChatClientName, Executable } from './chat-find'

// 설치·로그인 도우미의 공식 명령, 복사 글자, 선행 조건, 작업 창의 명령 줄. electron을 불러오지 않는다.
// 다섯 공식 명령은 여기에만 둔다(CS-11). 문서가 바뀌면 다시 확인하고 README와 함께 고친다.
const commands: Record<ChatSetupTask, string> = {
  // https://code.claude.com/docs/en/setup (2026-10-20 확인)
  'claude-install': 'irm https://claude.ai/install.ps1 | iex',
  // https://learn.chatgpt.com/docs/codex/cli (2026-10-20 확인)
  'codex-install':
    'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
  // https://code.claude.com/docs/en/cli-reference (2026-10-20 확인)
  'claude-login': 'claude auth login',
  // https://code.claude.com/docs/en/setup (2026-10-20 확인)
  'claude-update': 'claude update',
  // https://learn.chatgpt.com/docs/auth (2026-10-20 확인)
  'codex-login': 'codex login'
}
const sources: Record<ChatSetupTask, [string, string]> = {
  'claude-install': [
    'Claude Code 공식 문서 "Advanced setup" — Native Install (Recommended), Windows PowerShell',
    'https://code.claude.com/docs/en/setup'
  ],
  'codex-install': [
    'Codex 공식 문서 "Codex CLI" — Windows',
    'https://learn.chatgpt.com/docs/codex/cli'
  ],
  'claude-login': [
    'Claude Code 공식 문서 "CLI reference"',
    'https://code.claude.com/docs/en/cli-reference'
  ],
  'claude-update': [
    'Claude Code 공식 문서 "Advanced setup" — Update manually',
    'https://code.claude.com/docs/en/setup'
  ],
  'codex-login': [
    'Codex 공식 문서 "Authentication"과 "Command line options"',
    'https://learn.chatgpt.com/docs/auth'
  ]
}
const reasons = {
  powershell: (path: string): string =>
    `Windows PowerShell(${path})을 찾지 못해 앱에서 실행할 수 없습니다. 공식 문서의 방법으로 직접 설치·로그인한 뒤 [다시 확인]을 눌러 주세요.`,
  bits: '64비트 Windows에서만 설치할 수 있습니다.',
  build: 'Claude Code는 Windows 10 1809 이상에서 설치할 수 있습니다.',
  admin:
    '관리자 권한으로 실행한 BeaverBank에서는 설치·로그인을 시작하지 않습니다. 보통 권한으로 다시 실행해 주세요.',
  unknown: '권한 수준을 확인하지 못해 설치·로그인을 시작하지 않습니다.',
  terminal:
    'Windows Terminal이 필요합니다. 없으면 BeaverBank에서 창을 열 수 없으니, 아래 명령을 복사해 PowerShell 창에 붙여 넣어 실행한 뒤 [다시 확인]을 눌러 주세요.',
  semicolon:
    "경로에 ';'가 있어 Windows Terminal로 창을 열 수 없습니다. 아래 명령을 복사해 직접 실행해 주세요.",
  unreadable: '판정용 설치 명령을 읽지 못했습니다.',
  characters: '판정용 설치 명령에 쓸 수 없는 글자(", ;, 줄바꿈)가 있습니다.',
  busy: '다른 설치·로그인 창이 열려 있습니다.',
  replying: '답을 받는 동안에는 할 수 없습니다.'
}
export const setupReasons = { busy: reasons.busy, replying: reasons.replying }

// 작업 창 제목(CS-33). --title과 $Host.UI.RawUI.WindowTitle에 같은 글을 쓴다.
export const titles: Record<ChatSetupTask, string> = {
  'claude-install': 'BeaverBank · Claude Code 설치',
  'claude-login': 'BeaverBank · Claude Code 로그인',
  'claude-update': 'BeaverBank · Claude Code 업데이트',
  'codex-install': 'BeaverBank · Codex 설치',
  'codex-login': 'BeaverBank · Codex 로그인'
}

type InstallTask = 'claude-install' | 'codex-install'
const isInstall = (task: ChatSetupTask): task is InstallTask =>
  task === 'claude-install' || task === 'codex-install'

// PowerShell 작은따옴표 문자열(CS-56). 작은따옴표 다섯 종은 두 번 쓴다.
export const q = (value: string): string => `'${value.replace(/['‘’‚‛]/g, (mark) => mark + mark)}'`

// 판정용 명령 바꾸기(CS-38). 변수가 없으면 꺼짐(undefined). 켜져 있으면 두 설치마다 쓸 명령이나 막는 이유다.
// 읽지 못하면 공식 명령으로 돌아가지 않는다. 로그인·업데이트는 바꾸지 않는다.
export type SetupOverrides = Record<InstallTask, { command?: string; reason?: string }>
export function readSetupCommands(): SetupOverrides | undefined {
  const value = process.env.BEAVERBANK_SETUP_COMMANDS
  if (value === undefined) return undefined
  let json: unknown
  try {
    if (!isAbsolute(value)) throw Error('not absolute')
    json = JSON.parse(readFileSync(value, 'utf8'))
  } catch {
    json = undefined
  }
  const read = (task: InstallTask): { command?: string; reason?: string } => {
    const command =
      json && typeof json === 'object' && !Array.isArray(json)
        ? (json as Record<string, unknown>)[task]
        : undefined
    if (typeof command !== 'string') return { reason: reasons.unreadable }
    if (/[";\r\n]/.test(command)) return { reason: reasons.characters }
    return { command }
  }
  return { 'claude-install': read('claude-install'), 'codex-install': read('codex-install') }
}

// 복사하는 글자(CS-82). 로그인·업데이트는 찾은 실행 파일의 절대 경로로 바꾼다(CS-12).
// 판정용 명령 바꾸기가 켜져 있으면 설치는 바꾼 명령이고, 쓸 수 없으면 글자가 없다.
export function copyText(
  task: ChatSetupTask,
  exe?: Executable | null,
  override?: SetupOverrides
): string | undefined {
  if (isInstall(task)) return override ? override[task].command : commands[task]
  if (!exe) return undefined
  const name = task.startsWith('claude') ? 'claude' : 'codex'
  return ['&', q(exe.command), ...exe.prefix.map(q)].join(' ') + commands[task].slice(name.length)
}

// libuv가 Windows 명령 줄을 만드는 따옴표 규칙(quote_cmd_arg). 실행 확인 팝업의 글자가 실제 명령 줄과 같게 한다.
function quoteArg(value: string): string {
  if (!value) return '""'
  if (!/[ \t"]/.test(value)) return value
  if (!/["\\]/.test(value)) return `"${value}"`
  const out: string[] = []
  let quoteHit = true
  for (let index = value.length; index > 0; index--) {
    const unit = value[index - 1]
    out.push(unit)
    if (quoteHit && unit === '\\') out.push('\\')
    else if (unit === '"') {
      quoteHit = true
      out.push('\\')
    } else quoteHit = false
  }
  return `"${out.reverse().join('')}"`
}

// 창 스크립트의 실행 문장(CS-33). 설치는 창 PowerShell과 다른 자식 프로세스에서 실행한다.
function runStatement(
  task: ChatSetupTask,
  facts: SetupFacts,
  exe?: Executable | null
): string | undefined {
  if (!isInstall(task)) return copyText(task, exe)
  const command = copyText(task, exe, facts.override)
  if (!command) return undefined
  if (task === 'codex-install' && !facts.override) return command
  return `& ${q(facts.powershell)} -NoLogo -NoProfile -Command ${q(command)}`
}

// 작업 창 하나의 명령 줄(CS-31·CS-33). 토큰은 창마다 새 128비트 값이고, 표지 파일은 사용자 데이터 폴더 안이다.
export interface SetupWindow {
  task: ChatSetupTask
  title: string
  token: string
  marker: string
  program: string
  args: string[]
  display: string
}
export function setupWindow(
  task: ChatSetupTask,
  facts: SetupFacts,
  exe?: Executable | null,
  token = randomBytes(16).toString('hex')
): SetupWindow | undefined {
  const statement = runStatement(task, facts, exe)
  if (!facts.terminal || !statement) return undefined
  const title = titles[task]
  const marker = join(facts.setupFolder, `${token}.open`)
  // 보일 명령: 설치는 실행할 설치 명령(공식, 또는 판정용 바꾼 명령), 로그인·업데이트는 실행 문장
  const shown = isInstall(task) ? copyText(task, exe, facts.override)! : statement
  const script = [
    `$bbToken=${q(token)}`,
    `$m=${q(marker)}`,
    'New-Item -ItemType File -Path $m -Force | Out-Null',
    'try {',
    `$Host.UI.RawUI.WindowTitle = ${q(title)}`,
    `Set-Location -LiteralPath ${q(facts.userProfile)}`,
    "Write-Host 'BeaverBank가 연 창입니다. 다음 공식 명령을 실행합니다:'",
    `Write-Host ${q(shown)}`,
    "Write-Host ''",
    statement,
    '$code = $LASTEXITCODE',
    "Write-Host ''",
    "Write-Host ('끝났습니다 (종료 코드 {0}). 이 창을 닫으면 BeaverBank가 상태를 다시 확인합니다.' -f $code)",
    "[void](Read-Host 'Enter를 누르면 창을 닫습니다')",
    '} finally {',
    'Remove-Item -LiteralPath $m -Force -ErrorAction SilentlyContinue',
    '}'
  ].join('\n')
  const args = [
    'new-tab',
    '--title',
    title,
    '--',
    facts.powershell,
    '-NoLogo',
    '-NoProfile',
    '-Command',
    script
  ]
  const program = facts.terminal
  return {
    task,
    title,
    token,
    marker,
    program,
    args,
    display: [program, ...args].map(quoteArg).join(' ')
  }
}
// Windows Terminal은 ';'로 명령 줄을 쪼갠다. 어느 인수에라도 있으면 창을 열지 않는다(CS-31).
export const hasSemicolon = (window: SetupWindow): boolean =>
  window.args.some((arg) => arg.includes(';'))

// 창 PowerShell을 토큰으로 찾고 끝을 지켜보는 창 없는 조회(CS-32, CS-50). 앱에는 PID와 생성 시각만 돌려준다.
// 조회 대본이 자기를 찾지 않게 토큰 대입 글자는 이어 붙여 만든다. 찾는 동안 0.5초 안 간격으로 다시 조회하고
// 표지 파일도 본다. 찾지 못하고 표지 파일도 없이 findMs가 지나면 notfound, 표지 파일이 생겼다 없어지면 closed.
export function watchScript(
  token: string,
  marker: string,
  findMs: number,
  known?: { pid: number; created: string }
): string {
  return [
    `$t='$bb'+'Token='''+${q(token)}+''''`,
    "$ErrorActionPreference='Stop'",
    `$m=${q(marker)}`,
    `$until=[DateTime]::UtcNow.AddMilliseconds(${Math.max(0, Math.round(findMs))})`,
    '$seen=$false',
    '$p=$null',
    ...(known
      ? [
          `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${known.pid}'`,
          `if (-not $p -or $p.CreationDate.ToUniversalTime().ToString('o') -ne ${q(known.created)}) { [Console]::Out.WriteLine('closed'); exit }`,
          "if (-not $p.CommandLine -or -not $p.CommandLine.Contains($t)) { throw 'Window identity unavailable' }"
        ]
      : []),
    'while (-not $p) {',
    `  $p=@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($t) })[0]`,
    '  if ($p) { break }',
    "  if (Test-Path -LiteralPath $m) { $seen=$true } elseif ($seen) { [Console]::Out.WriteLine('closed'); exit }",
    "  if (-not $seen -and [DateTime]::UtcNow -gt $until) { [Console]::Out.WriteLine('notfound'); exit }",
    '  Start-Sleep -Milliseconds 300',
    '}',
    '$c=$p.CreationDate',
    "[Console]::Out.WriteLine('found ' + $p.ProcessId + ' ' + $c.ToUniversalTime().ToString('o'))",
    '$h=$null',
    'try {',
    '  $h=[Diagnostics.Process]::GetProcessById([int]$p.ProcessId)',
    '  if ([Math]::Abs(($h.StartTime.ToUniversalTime() - $c.ToUniversalTime()).TotalSeconds) -gt 1) { $h=$null }',
    '} catch { $h=$null }',
    'if ($h) { $h.WaitForExit() } else {',
    '  while ($true) {',
    "    $q=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p.ProcessId)",
    '    if (-not $q -or $q.CreationDate -ne $c) { break }',
    '    Start-Sleep -Milliseconds 400',
    '  }',
    '}',
    "[Console]::Out.WriteLine('closed')"
  ].join('\n')
}

// 작업 창을 열지 못했을 때(CS-41): 결과 줄이자 명령 복사의 안내 한 줄이다.
export const openFailed =
  'Windows Terminal 창을 열지 못했습니다. 보안 프로그램이 막았을 수 있습니다.'
// 작업 창이 닫힌 뒤의 상태 확인으로 정하는 결과 줄(CS-43). 표에 없는 조합: 업데이트는 판을 먼저 보고,
// 로그인 뒤 "없음"은 확인하지 못한 줄을 쓴다.
export function resultLine(task: ChatSetupTask, status: ChatStatus): ChatSetupResult {
  const ok = (text: string): ChatSetupResult => ({ task, ok: true, text })
  const fail = (text: string): ChatSetupResult => ({ task, ok: false, text })
  const unknown = '창이 닫혔지만 상태를 확인하지 못했습니다. [다시 확인]을 눌러 주세요.'
  if (isInstall(task)) {
    const name = task === 'claude-install' ? 'Claude Code' : 'Codex'
    if (status.state === 'missing')
      return fail(
        `설치 창이 닫혔지만 ${name}를 찾지 못했습니다. 창에 나온 안내를 확인한 뒤 다시 시도해 주세요.`
      )
    return ok(status.version ? `설치를 마쳤습니다 (${status.version}).` : '설치를 마쳤습니다.')
  }
  if (task === 'claude-update') {
    if (status.version && status.verified) return ok(`업데이트를 마쳤습니다 (${status.version}).`)
    if (status.state === 'unknown') return fail(unknown)
    return fail(`업데이트 창이 닫혔지만 판이 그대로입니다 (${status.version || '알 수 없음'}).`)
  }
  if (status.state === 'ready') return ok('로그인을 마쳤습니다.')
  if (status.state === 'login') return fail('로그인 창이 닫혔지만 아직 로그인되어 있지 않습니다.')
  return fail(unknown)
}

// whoami /groups /fo csv /nh 출력의 SID 열만 읽는다(CS-39). 그룹 이름은 언어마다 다르다.
function csv(line: string): string[] | null {
  const cells: string[] = []
  let index = 0
  while (index < line.length) {
    if (line[index] !== '"') return null
    let value = ''
    index++
    for (;;) {
      if (index >= line.length) return null
      if (line[index] === '"') {
        if (line[index + 1] === '"') {
          value += '"'
          index += 2
          continue
        }
        index++
        break
      }
      value += line[index++]
    }
    cells.push(value)
    if (index === line.length) break
    if (line[index] !== ',') return null
    index++
  }
  return cells
}
export function integrity(output: string): 'yes' | 'no' | 'unknown' {
  let level: number | undefined
  for (const line of output.split(/\r?\n/)) {
    const sid = line.trim() ? csv(line.trim())?.[2] : undefined
    const match = sid && /^S-1-16-(\d+)$/.exec(sid)
    if (match) level = Math.max(level ?? 0, Number(match[1]))
  }
  return level === undefined ? 'unknown' : level >= 12288 ? 'yes' : 'no'
}

export interface SetupFacts {
  powershell: string
  powershellExists: boolean
  is64: boolean
  build: number
  // pending: 아직 확인하지 않았거나 확인 중이라 판정을 미룬다
  admin: 'yes' | 'no' | 'unknown' | 'pending'
  terminal: string | null
  setupFolder: string
  userProfile: string
  // 판정용 명령 바꾸기(CS-38). 변수가 없으면 없다.
  override?: SetupOverrides
}
// 실행 별칭은 크기 0인 재분석 지점이라 따라가지 않고 항목이 있는지만 본다.
function present(path: string): boolean {
  try {
    return !lstatSync(path).isDirectory()
  } catch {
    return false
  }
}
export function findTerminal(): string | null {
  if (process.env.LOCALAPPDATA) {
    const alias = join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe')
    if (present(alias)) return alias
  }
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (!directory) continue
    const candidate = resolve(directory.replace(/^"|"$/g, ''), 'wt.exe')
    if (present(candidate)) return candidate
  }
  return null
}
export function readFacts(setupFolder: string, admin: SetupFacts['admin']): SetupFacts {
  const powershell = join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  let powershellExists = false
  try {
    powershellExists = statSync(powershell).isFile()
  } catch {
    /* 없음 */
  }
  return {
    powershell,
    powershellExists,
    is64:
      ['x86_64', 'arm64', 'aarch64'].includes(machine()) ||
      /^(amd64|arm64)$/i.test(process.env.PROCESSOR_ARCHITEW6432 || ''),
    build: Number(release().split('.')[2]),
    admin,
    terminal: findTerminal(),
    setupFolder,
    userProfile: process.env.USERPROFILE || '',
    override: readSetupCommands()
  }
}

// 상태에 맞는 작업: 없음 → 설치, 로그인 필요 → 로그인, Claude 판을 읽었고 2.1.284 미만 → 업데이트
export function taskFor(client: ChatClientName, status: ChatStatus): ChatSetupTask | undefined {
  if (status.state === 'missing') return `${client}-install`
  if (status.state === 'login') return `${client}-login`
  if (client === 'claude' && status.state === 'ready' && status.version && !status.verified)
    return 'claude-update'
  return undefined
}

// 작업 하나의 판정(CS-38, CS-39, CS-80). 우선순위: 시스템 PowerShell·관리자·확인 실패 →
// Windows Terminal 없음 → 창 명령 줄의 ';' → 64비트·빌드 → 판정용 명령 바꾸기.
// 창 작업이면 실행 확인 팝업이 쓸 것(제목, 공식 명령 글자, 출처 줄, 판정용 여부, 흐림과 이유)을 싣는다.
export function judge(
  task: ChatSetupTask,
  facts: SetupFacts,
  exe?: Executable | null
): ChatSetupAction | undefined {
  const install = isInstall(task)
  if (!install && !exe) return undefined
  if (!facts.powershellExists)
    return { task, mode: 'blocked', reason: reasons.powershell(facts.powershell) }
  if (facts.admin === 'pending') return undefined
  if (facts.admin !== 'no')
    return {
      task,
      mode: 'blocked',
      reason: facts.admin === 'yes' ? reasons.admin : reasons.unknown
    }
  const paths = [facts.setupFolder, facts.userProfile, facts.powershell]
  if (!install && exe) paths.push(exe.command, ...exe.prefix)
  // 창 명령 줄의 모든 인수를 실제로 만들어 ';'를 본다(토큰은 확인용 자리값).
  const probe = facts.terminal ? setupWindow(task, facts, exe, '0'.repeat(32)) : undefined
  const notice = !facts.terminal
    ? reasons.terminal
    : paths.some((path) => path.includes(';')) || (probe && hasSemicolon(probe))
      ? reasons.semicolon
      : undefined
  const reason = !install
    ? undefined
    : !facts.is64
      ? reasons.bits
      : task === 'claude-install' && !(facts.build >= 17763)
        ? reasons.build
        : undefined
  const override = install && facts.override ? facts.override[task] : undefined
  const [name, url] = sources[task]
  const source = override
    ? '출처: 환경 변수 BEAVERBANK_SETUP_COMMANDS'
    : `출처: ${name} · ${url} · 2026-10-20 확인`
  const disabled = reason || override?.reason
  const common = {
    task,
    source,
    reason,
    dimmed: !!disabled,
    disabled,
    ...(override ? { override: true, overrideReason: override.reason } : {})
  }
  // 창 작업: 실행 확인 팝업의 "공식 명령" 상자는 바꾸기 전의 글자(로그인·업데이트), 설치는 실행할 설치 명령이다.
  if (!notice)
    return {
      ...common,
      mode: 'window',
      title: titles[task],
      command: install ? copyText(task, exe, facts.override) : commands[task]
    }
  return { ...common, mode: 'copy', notice, command: copyText(task, exe, facts.override) }
}
