import { defineConfig } from 'drizzle-kit'

// 마이그레이션 SQL만 생성한다. 실제 적용은 앱 시작 시 main 프로세스에서 한다.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle'
})
