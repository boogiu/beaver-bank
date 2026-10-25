import { lstatSync, statSync } from 'node:fs'
import { machine, release } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import type { ChatSetupAction, ChatSetupTask, ChatStatus } from '../shared/chat'
import type { ChatClientName, Executable } from './chat-find'

// 설치·로그인 도우미의 공식 명령, 복사 글자, 선행 조건. electron을 불러오지 않는다.
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
    "경로에 ';'가 있어 Windows Terminal로 창을 열 수 없습니다. 아래 명령을 복사해 직접 실행해 주세요."
}

// PowerShell 작은따옴표 문자열(CS-56). 작은따옴표 다섯 종은 두 번 쓴다.
export const q = (value: string): string => `'${value.replace(/['‘’‚‛]/g, (mark) => mark + mark)}'`

// 복사하는 글자(CS-82). 로그인·업데이트는 찾은 실행 파일의 절대 경로로 바꾼다(CS-12).
export function copyText(task: ChatSetupTask, exe?: Executable | null): string | undefined {
  if (task === 'claude-install' || task === 'codex-install') return commands[task]
  if (!exe) return undefined
  const name = task.startsWith('claude') ? 'claude' : 'codex'
  return ['&', q(exe.command), ...exe.prefix.map(q)].join(' ') + commands[task].slice(name.length)
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
    userProfile: process.env.USERPROFILE || ''
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

// 작업 하나의 판정(CS-39, CS-80, 01의 중간 모습). 우선순위: 시스템 PowerShell·관리자·확인 실패 →
// Windows Terminal 없음 → 경로의 ';' → 64비트·빌드.
export function judge(
  task: ChatSetupTask,
  facts: SetupFacts,
  exe?: Executable | null
): ChatSetupAction | undefined {
  const install = task === 'claude-install' || task === 'codex-install'
  const command = copyText(task, exe)
  if (!command) return undefined
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
  const notice = !facts.terminal
    ? reasons.terminal
    : paths.some((path) => path.includes(';'))
      ? reasons.semicolon
      : undefined
  const reason = !install
    ? undefined
    : !facts.is64
      ? reasons.bits
      : task === 'claude-install' && !(facts.build >= 17763)
        ? reasons.build
        : undefined
  if (!notice) return { task, mode: 'window', reason }
  const [name, url] = sources[task]
  return {
    task,
    mode: 'copy',
    notice,
    command,
    source: `출처: ${name} · ${url} · 2026-10-20 확인`,
    reason,
    dimmed: !!reason
  }
}
