import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_DIR_ENV,
  HTTP_CAPABILITY_ENV,
  capabilityDirectory,
  capabilityRecordPath,
  readBackendCapability,
} from '../src/host/capability.js'

const capability = 'A'.repeat(64)
const nonce = 'b'.repeat(32)

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, http: capability, websocket: 'B'.repeat(64), instance_nonce: nonce, ...overrides }
}

async function recordFile(payload: string, port = 8000): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dga-capability-'))
  const dir = join(root, 'godot-ai', 'capabilities')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `http-${port}.json`), payload)
  return root
}

describe('capability record location', () => {
  it('follows the per-platform directory Godot AI publishes', () => {
    expect(capabilityDirectory({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Local' }, home: 'C:\\Users\\me' }))
      .toBe(join('C:\\Local', 'godot-ai', 'capabilities'))
    expect(capabilityDirectory({ platform: 'win32', env: {}, home: 'C:\\Users\\me' }))
      .toBe(join('C:\\Users\\me', 'AppData', 'Local', 'godot-ai', 'capabilities'))
    // Windows refuses the override, so it must be ignored there.
    expect(capabilityDirectory({ platform: 'win32', env: { [CAPABILITY_DIR_ENV]: 'D:\\x' }, home: 'C:\\Users\\me' }))
      .toBe(join('C:\\Users\\me', 'AppData', 'Local', 'godot-ai', 'capabilities'))
    expect(capabilityDirectory({ platform: 'darwin', env: {}, home: '/Users/me' }))
      .toBe(join('/Users/me', 'Library', 'Application Support', 'godot-ai', 'capabilities'))
    expect(capabilityDirectory({ platform: 'linux', env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/me' }))
      .toBe(join('/cfg', 'godot-ai', 'capabilities'))
    expect(capabilityDirectory({ platform: 'linux', env: {}, home: '/home/me' }))
      .toBe(join('/home/me', '.config', 'godot-ai', 'capabilities'))
    expect(capabilityDirectory({ platform: 'linux', env: { [CAPABILITY_DIR_ENV]: '/custom' }, home: '/home/me' }))
      .toBe('/custom')
    expect(capabilityRecordPath(8000, { platform: 'win32', env: { LOCALAPPDATA: 'C:\\Local' }, home: 'C:\\Users\\me' }))
      .toBe(join('C:\\Local', 'godot-ai', 'capabilities', 'http-8000.json'))
  })
})

describe('capability record reading', () => {
  it('reads the published record for one port', async () => {
    const root = await recordFile(JSON.stringify(record()))
    await expect(readBackendCapability(8000, { platform: 'win32', env: { LOCALAPPDATA: root }, home: root }))
      .resolves.toEqual({ http: capability })
  })

  it('rejects malformed, mismatched, or oversized records', async () => {
    const env = async (payload: string) => ({ platform: 'win32' as const, env: { LOCALAPPDATA: await recordFile(payload) }, home: '' })
    await expect(readBackendCapability(8000, await env('not json'))).resolves.toBeUndefined()
    await expect(readBackendCapability(8000, await env(JSON.stringify(record({ version: 2 }))))).resolves.toBeUndefined()
    await expect(readBackendCapability(8000, await env(JSON.stringify(record({ http: 'short' }))))).resolves.toBeUndefined()
    await expect(readBackendCapability(8000, await env(JSON.stringify(record({ instance_nonce: 'x' }))))).resolves.toBeUndefined()
    await expect(readBackendCapability(8000, await env(JSON.stringify(record({ websocket: capability }))))).resolves.toBeUndefined()
    await expect(readBackendCapability(8000, await env(JSON.stringify(record({ padding: 'x'.repeat(2_000) })))))
      .resolves.toBeUndefined()
    await expect(readBackendCapability(8000, { platform: 'win32', env: { LOCALAPPDATA: await recordFile('{}') }, home: '' }))
      .resolves.toBeUndefined()
    await expect(readBackendCapability(8000, { platform: 'win32', env: { LOCALAPPDATA: join(tmpdir(), 'dga-missing') }, home: '' }))
      .resolves.toBeUndefined()
  })

  it('prefers an injected GODOT_AI_HTTP_CAPABILITY', async () => {
    await expect(readBackendCapability(8000, {
      platform: 'win32',
      env: { [HTTP_CAPABILITY_ENV]: 'C'.repeat(64), LOCALAPPDATA: join(tmpdir(), 'dga-missing') },
      home: '',
    })).resolves.toEqual({ http: 'C'.repeat(64) })
    await expect(readBackendCapability(8000, {
      platform: 'win32',
      env: { [HTTP_CAPABILITY_ENV]: 'too-short', LOCALAPPDATA: join(tmpdir(), 'dga-missing') },
      home: '',
    })).resolves.toBeUndefined()
  })
})
