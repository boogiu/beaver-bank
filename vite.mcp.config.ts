import { builtinModules } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
  entries: { tag: string; when: number }[]
}
const migrations = journal.entries.map(({ tag, when }) => ({
  hash: createHash('sha256')
    .update(readFileSync(`drizzle/${tag}.sql`, 'utf8'))
    .digest('hex'),
  createdAt: when
}))
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  define: {
    __MCP_VERSION__: JSON.stringify(pkg.version),
    __MCP_MIGRATIONS__: JSON.stringify(migrations)
  },
  build: {
    target: 'node24',
    outDir: 'out/mcp',
    emptyOutDir: true,
    lib: {
      entry: { server: resolve('src/mcp/index.ts'), 'chat-gate': resolve('src/mcp/chat-gate.ts') },
      formats: ['cjs'],
      fileName: (_format, entry) => `${entry}.cjs`
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith('node:') ||
        builtinModules.includes(id) ||
        ['@modelcontextprotocol/server', 'zod', 'better-sqlite3', 'drizzle-orm', 'electron'].some(
          (name) => id === name || id.startsWith(`${name}/`)
        )
    }
  }
})
