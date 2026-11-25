import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { readEditorSessions } from '../src/host/integration-manager.js'

const sessions = new Set<string>()
const methods: string[] = []
let server: Server | undefined

async function listen(): Promise<number> {
  server = createServer((request, response) => { void handle(request, response) })
  await new Promise<void>(resolve => { server!.listen(0, '127.0.0.1', resolve) })
  return (server!.address() as AddressInfo).port
}

function send(response: ServerResponse, payload: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(payload)
  response.writeHead(200, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), ...headers })
  response.end(body)
}

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const body = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  methods.push(`${request.method} ${header(request, 'authorization')}`)

  if (request.method === 'DELETE') {
    sessions.delete(header(request, 'mcp-session-id'))
    response.writeHead(200).end()
    return
  }
  const id = body.id
  if (body.method === 'initialize') {
    const session = `session-${sessions.size + 1}-${Math.random().toString(16).slice(2)}`
    sessions.add(session)
    send(response, {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: header(request, 'mcp-protocol-version') || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'godot-ai', version: '4.4.2' },
      },
    }, { 'mcp-session-id': session })
    return
  }
  if (body.method === 'tools/call') {
    expect(header(request, 'mcp-session-id')).not.toBe('')
    send(response, {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: '{"ok":true}' }],
        structuredContent: {
          sessions: [{
            session_id: '3f1c9d0a-2b7e-4c55-9a10-8e6f2b4d7c11',
            name: '新建游戏项目',
            project_path: 'F:/godot/新建游戏项目',
            godot_version: '4.7.2-stable (official)',
            plugin_version: '4.4.2',
            server_version: '4.4.2',
            protocol_version: 2,
            readiness: 'no_scene',
            play_state: 'stopped',
            is_active: true,
          }],
        },
      },
    })
    return
  }
  send(response, { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found' } })
}

afterEach(async () => {
  sessions.clear()
  methods.length = 0
  await new Promise<void>(resolve => { server === undefined ? resolve() : server.close(() => { resolve() }) })
  server = undefined
})

describe('editor session probe transport', () => {
  it('sends the capability and terminates its session before closing', async () => {
    const port = await listen()
    const capability = { http: 'A'.repeat(64) }
    const result = await readEditorSessions(new URL(`http://127.0.0.1:${port}/mcp`), capability)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: '新建游戏项目', pluginVersion: '4.4.2', isActive: true })
    expect(methods.every(entry => entry.endsWith(`Bearer ${capability.http}`))).toBe(true)
    expect(methods.some(entry => entry.startsWith('DELETE'))).toBe(true)
    expect(sessions.size).toBe(0)
  })
})
