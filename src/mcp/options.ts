import { statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export interface Options {
  source: 'demo' | 'real'
  memos: boolean
  check: boolean
  root: string
  path: string
  displayFolder: string
}
export const usage =
  '허용 옵션: --data demo|real, --memos, --data-root <존재하는 절대 폴더>, --check'
export function parseOptions(args: string[], env = process.env): Options {
  let source: Options['source'] = 'demo'
  let memos = false
  let check = false
  let dataRoot: string | undefined
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--data': {
        const value = args[++i]
        if (value !== 'demo' && value !== 'real')
          throw new Error('데이터 대상은 demo 또는 real입니다.')
        source = value
        break
      }
      case '--memos':
        memos = true
        break
      case '--check':
        check = true
        break
      case '--data-root': {
        const value = args[++i]
        if (!value || !isAbsolute(value)) throw new Error('기준 폴더는 절대 경로로 지정해 주세요.')
        try {
          if (!statSync(value).isDirectory()) throw new Error()
        } catch {
          throw new Error('기준 폴더가 존재하지 않거나 폴더가 아닙니다.')
        }
        dataRoot = value
        break
      }
      default:
        throw new Error(`알 수 없는 실행 인수입니다: ${args[i]}`)
    }
  }
  const root =
    dataRoot || env.APPDATA || (env.USERPROFILE && join(env.USERPROFILE, 'AppData', 'Roaming'))
  if (!root) throw new Error('--data-root로 기준 폴더를 지정해 주세요.')
  const folder = source === 'demo' ? 'BeaverBank-demo' : 'BeaverBank'
  return {
    source,
    memos,
    check,
    root,
    path: join(root, folder, 'beaverbank-dev.sqlite'),
    displayFolder: join(dataRoot ? '<data-root>' : '%APPDATA%', folder)
  }
}
