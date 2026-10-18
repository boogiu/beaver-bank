import { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { attempt } from '../main/db/service'
import { withReadDatabase } from './database'
import { instructions } from './messages'
import type { Options } from './options'
import { getStatus } from './status'
import { descriptions, readTool, schemas, titles, type ToolName } from './tools'
import { createSession } from './session'
import {
  writeSchemas,
  writeTitles,
  writeDescription,
  type WriteName,
  type WriteInput
} from './write-tools'
import { runWrite } from './write-pipeline'

export function createServer(options: Options): McpServer {
  const session = createSession()
  const server = new McpServer(
    { name: 'beaverbank', version: __MCP_VERSION__ },
    { capabilities: { tools: {} }, instructions: instructions(options) }
  )
  function register(name: ToolName): void {
    server.registerTool(
      name,
      {
        title: titles[name],
        description: descriptions[name],
        inputSchema: schemas[name],
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      (input: z.infer<(typeof schemas)[ToolName]>) => {
        const result = attempt(() =>
          withReadDatabase(options, (state) => {
            if (name === 'get_status') return getStatus(options, state, session)
            if (state.state !== 'ready')
              return {
                source: options.source,
                error: { kind: state.state, message: state.message }
              }
            return { source: options.source, ...readTool(name, input, options) }
          })
        )
        const value = result.ok ? result.data : { source: options.source, error: result.error }
        return {
          ...('error' in value ? { isError: true } : {}),
          content: [{ type: 'text' as const, text: JSON.stringify(value) }]
        }
      }
    )
  }
  for (const name of Object.keys(schemas) as ToolName[]) register(name)
  if (options.write) {
    for (const name of Object.keys(writeSchemas) as WriteName[]) {
      server.registerTool(
        name,
        {
          title: writeTitles[name],
          description: writeDescription(name),
          inputSchema: writeSchemas[name],
          annotations: {
            readOnlyHint: false,
            destructiveHint: !name.startsWith('add_'),
            openWorldHint: false
          }
        },
        (input: WriteInput<WriteName>) => {
          const value = runWrite(name, input, options, session)
          return {
            ...('error' in value ? { isError: true } : {}),
            content: [{ type: 'text' as const, text: JSON.stringify(value) }]
          }
        }
      )
    }
  }
  return server
}
