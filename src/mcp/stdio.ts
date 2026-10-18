import type { JSONRPCMessage, Transport } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import type { Options } from './options'
import { schemas, type ToolName } from './tools'

// 공개 transport 경계에서 같은 입력 스키마를 검사한다. 규격 협상과 오류 생성은 SDK가 맡는다.
export function createStdio(options: Options): Transport {
  const wire = new StdioServerTransport()
  const invalid = new Map<string | number, { value: object; modern: boolean }>()
  const transport: Transport = {
    async start() {
      wire.onclose = () => transport.onclose?.()
      wire.onerror = (error) => transport.onerror?.(error)
      wire.onmessage = (message) => {
        if ('method' in message && message.method === 'tools/call' && 'id' in message) {
          const name = message.params?.name
          if (typeof name === 'string' && Object.hasOwn(schemas, name)) {
            const result = schemas[name as ToolName].safeParse(
              message.params?.arguments === undefined ? {} : message.params.arguments
            )
            if (!result.success) {
              const issue = result.error.issues[0]
              const field = issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path[0]
              const errorMessage =
                issue.code === 'unrecognized_keys'
                  ? `허용하지 않는 입력 항목입니다: ${issue.keys.join(', ')}`
                  : `${typeof field === 'string' ? field : '입력'} 항목의 값 종류 또는 필수 입력을 확인해 주세요.`
              invalid.set(message.id, {
                value: {
                  source: options.source,
                  error: {
                    kind: 'validation',
                    message: errorMessage,
                    ...(typeof field === 'string' ? { field } : {})
                  }
                },
                modern:
                  message.params?._meta?.['io.modelcontextprotocol/protocolVersion'] ===
                  '2026-07-28'
              })
            }
          }
        }
        transport.onmessage?.(message)
      }
      await wire.start()
    },
    async send(message: JSONRPCMessage) {
      if ('id' in message && message.id != null && invalid.has(message.id)) {
        const entry = invalid.get(message.id)!
        invalid.delete(message.id)
        if ('result' in message && message.result.isError === true) {
          message = {
            ...message,
            result: {
              ...message.result,
              content: [{ type: 'text', text: JSON.stringify(entry.value) }]
            }
          }
        } else if ('error' in message && isArgumentShapeError(message.error)) {
          message = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              ...(entry.modern ? { resultType: 'complete' } : {}),
              isError: true,
              content: [{ type: 'text', text: JSON.stringify(entry.value) }]
            }
          }
        }
      }
      await wire.send(message)
    },
    async close() {
      invalid.clear()
      await wire.close()
    }
  }
  return transport
}

// 배열/null arguments는 SDK의 요청 스키마에서 먼저 거절된다. 입력 꼴 오류만
// 정규화하고 규격 협상·인증·다른 JSON-RPC 오류는 그대로 통과시킨다.
function isArgumentShapeError(error: { code: number; message: string }): boolean {
  const prefix = 'Invalid tools/call request: '
  if (error.code !== -32602 || !error.message.startsWith(prefix)) return false
  try {
    const issues: unknown = JSON.parse(error.message.slice(prefix.length))
    return (
      Array.isArray(issues) &&
      issues.length > 0 &&
      issues.every(
        (issue) =>
          typeof issue === 'object' &&
          issue !== null &&
          'path' in issue &&
          Array.isArray(issue.path) &&
          issue.path[0] === 'params' &&
          issue.path[1] === 'arguments'
      )
    )
  } catch {
    return false
  }
}
