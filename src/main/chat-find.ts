import { readFileSync, statSync } from 'node:fs'
import { delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path'

// 클라이언트 찾기와 .cmd 해석. electron을 불러오지 않는다.
export interface Executable {
  command: string
  prefix: string[]
}
export type ChatClientName = 'claude' | 'codex'

export function file(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
export function findNode(): string | null {
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    const candidate = resolve(directory.replace(/^"|"$/g, ''), 'node.exe')
    if (file(candidate)) return candidate
  }
  return null
}

// npm(cmd-shim)이 만드는 .cmd의 세 꼴(CS-14). 비교는 빈 줄을 빼고, 앞뒤 공백을 지우고,
// 이어진 공백을 하나로 보고, 대소문자를 가리지 않는다. 머리부터 끝 줄까지 같아야 받는다.
const npmHead = [
  '@echo off',
  'goto start',
  ':find_dp0',
  'set dp0=%~dp0',
  'exit /b',
  ':start',
  'setlocal',
  'call :find_dp0'
]
const npmForms = [
  {
    // (가) Node 꼴, 옛 판
    body: [
      'if exist "%dp0%\\node.exe" (',
      'set "_prog=%dp0%\\node.exe"',
      ') else (',
      'set "_prog=node"',
      'set pathext=%pathext:;.js;=;%',
      ')'
    ],
    last: /^endlocal & goto #_undefined_# 2>nul \|\| title %comspec% & "%_prog%" "%dp0%\\([^"]*)" %\*$/i,
    script: true
  },
  {
    // (나) Node 꼴, 지금 판
    body: [
      'if exist "%dp0%\\node.exe" (',
      'set "_prog=%dp0%\\node.exe"',
      ') else (',
      'set "_prog=node"',
      ')'
    ],
    last: /^endlocal & goto #_undefined_# 2>nul \|\| title %comspec% & set pathext=%pathext:;\.js;=;% & "%_prog%" "%dp0%\\([^"]*)" %\*$/i,
    script: true
  },
  {
    // (다) 바로 실행 꼴
    body: [],
    last: /^"%dp0%\\([^"]*)" %\*$/i,
    script: false
  }
]
function npmShim(path: string, shim: string): Executable | null {
  const lines = shim
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  if (
    lines.length <= npmHead.length ||
    npmHead.some((line, index) => lines[index].toLowerCase() !== line)
  )
    return null
  const body = lines.slice(npmHead.length, -1).map((line) => line.toLowerCase())
  const form = npmForms.find(
    (item) =>
      item.body.length === body.length && item.body.every((line, index) => body[index] === line)
  )
  const target = form && lines[lines.length - 1].match(form.last)?.[1]
  if (!form || !target) return null
  if (!/^node_modules\\/i.test(target) || /[%"&|<>^;]/.test(target)) return null
  if (!(form.script ? /\.(js|cjs|mjs)$/i : /\.exe$/i).test(target)) return null
  const folder = dirname(path)
  const absolute = resolve(folder, target)
  // `..`로 그 폴더의 node_modules 밖을 가리키면 받지 않는다.
  if (!absolute.toLowerCase().startsWith(resolve(folder, 'node_modules').toLowerCase() + sep))
    return null
  if (!file(absolute)) return null
  if (!form.script) return { command: absolute, prefix: [] }
  const node = file(join(folder, 'node.exe')) ? join(folder, 'node.exe') : findNode()
  return node ? { command: node, prefix: [absolute] } : null
}

export function executable(path: string): Executable | null {
  if (!file(path)) return null
  if (/\.(exe|com)$/i.test(path)) return { command: path, prefix: [] }
  if (!/\.(cmd|bat)$/i.test(path)) return null
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
  if (lines.length !== 1) return /\.cmd$/i.test(path) ? npmShim(path, shim) : null
  // 단일 Node 호출만 해석한다. 조건문·변수 확장·여러 명령이 있는 shim은 실행하지 않는다.
  const match = lines[0].match(
    /^@?(?:"node(?:\.exe)?"|node(?:\.exe)?|"%(?:~dp0|dp0%)[\\/]node\.exe")\s+"%(?:~dp0|dp0%)[\\/]([^"\r\n]+\.(?:js|cjs|mjs))"\s+%\*\s*$/i
  )
  if (!match || match[1].includes('%') || /[&|<>^]/.test(match[1])) return null
  const script = resolve(dirname(path), match[1])
  const node = file(join(dirname(path), 'node.exe')) ? join(dirname(path), 'node.exe') : findNode()
  return node && file(script) ? { command: node, prefix: [script] } : null
}

// 판정용 변수, PATH와 PATHEXT, 그다음 공식 설치 위치(CS-13). PATH는 앱이 받은 값이다.
export function findClient(name: ChatClientName): Executable | null {
  const override =
    process.env[name === 'claude' ? 'BEAVERBANK_CLAUDE_PATH' : 'BEAVERBANK_CODEX_PATH']
  if (override !== undefined) return isAbsolute(override) ? executable(override) : null
  const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const extension of extensions) {
      const result = executable(resolve(directory.replace(/^"|"$/g, ''), name + extension))
      if (result) return result
    }
  }
  return executable(
    name === 'claude'
      ? join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe')
      : join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')
  )
}
