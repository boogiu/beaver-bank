// main ↔ renderer 사이에 오가는 데이터 형태.

export interface DbStatus {
  path: string
  isDev: boolean
  migrations: number
  tables: { name: string; rows: number }[]
}
