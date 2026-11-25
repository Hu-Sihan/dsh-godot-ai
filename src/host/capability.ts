import { readFile, stat } from 'node:fs/promises'
import { homedir, platform as currentPlatform } from 'node:os'
import { join } from 'node:path'

/**
 * Godot AI 4.4 added a transport capability gate: every HTTP request to the
 * backend listener must carry `Authorization: Bearer <capability>`. The
 * capability is published as a private record next to the port claim, keyed by
 * the HTTP port, so a local client reads the record instead of guessing.
 */
export const HTTP_CAPABILITY_ENV = 'GODOT_AI_HTTP_CAPABILITY'
export const CAPABILITY_DIR_ENV = 'GODOT_AI_CAPABILITY_DIR'

const RECORD_VERSION = 1
const MAX_RECORD_BYTES = 1_024
const CAPABILITY = /^[A-Za-z0-9._~+/=-]{32,128}$/
const NONCE = /^[A-Fa-f0-9]{32}$/

export interface BackendCapability {
  readonly http: string
}

export interface CapabilityEnvironment {
  readonly env?: NodeJS.ProcessEnv
  readonly platform?: NodeJS.Platform
  readonly home?: string
}

function resolved(options: CapabilityEnvironment): {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  home: string
} {
  const env = options.env ?? process.env
  const home = options.home ?? env.USERPROFILE ?? env.HOME ?? homedir()
  return { env, platform: options.platform ?? currentPlatform(), home }
}

export function capabilityDirectory(options: CapabilityEnvironment = {}): string {
  const { env, platform, home } = resolved(options)
  if (platform === 'win32') {
    // Godot AI refuses GODOT_AI_CAPABILITY_DIR on Windows; the record always
    // lives under %LOCALAPPDATA%.
    const local = env.LOCALAPPDATA?.trim() ?? ''
    const base = local === '' ? join(home, 'AppData', 'Local') : local
    return join(base, 'godot-ai', 'capabilities')
  }
  const override = env[CAPABILITY_DIR_ENV]?.trim() ?? ''
  if (override !== '') return override
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'godot-ai', 'capabilities')
  }
  const config = env.XDG_CONFIG_HOME?.trim() ?? ''
  const base = config === '' ? join(home, '.config') : config
  return join(base, 'godot-ai', 'capabilities')
}

export function capabilityRecordPath(port: number, options: CapabilityEnvironment = {}): string {
  return join(capabilityDirectory(options), `http-${port}.json`)
}

function capabilityValue(value: unknown): string | undefined {
  return typeof value === 'string' && CAPABILITY.test(value) ? value : undefined
}

function parseRecord(payload: unknown): BackendCapability | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const value = payload as Record<string, unknown>
  if (value.version !== RECORD_VERSION) return undefined
  const http = capabilityValue(value.http)
  const websocket = capabilityValue(value.websocket)
  if (http === undefined || websocket === undefined || http === websocket) return undefined
  if (typeof value.instance_nonce !== 'string' || !NONCE.test(value.instance_nonce)) return undefined
  return Object.freeze({ http })
}

/**
 * Resolve the capability for one backend port. An explicit
 * GODOT_AI_HTTP_CAPABILITY wins (it is how Godot AI itself injects a launch
 * pair); otherwise the published record is read. Any unreadable, oversized, or
 * malformed record yields `undefined`, which callers report as "no capability"
 * rather than crashing the status probe.
 */
export async function readBackendCapability(
  port: number,
  options: CapabilityEnvironment = {},
): Promise<BackendCapability | undefined> {
  const injected = capabilityValue((options.env ?? process.env)[HTTP_CAPABILITY_ENV]?.trim())
  if (injected !== undefined) return Object.freeze({ http: injected })
  const path = capabilityRecordPath(port, options)
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size <= 0 || info.size > MAX_RECORD_BYTES) return undefined
    return parseRecord(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return undefined
  }
}
