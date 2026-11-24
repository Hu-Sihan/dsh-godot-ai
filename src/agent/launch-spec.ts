import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import type { CompatibilityManifest } from '../core/compatibility.js'

export const GODOT_MCP_SERVER_NAME = 'godot-ai'

/** Budget for closing the stdio transport; matches the DSH default so a hung backend cannot stall cleanup. */
export const GODOT_MCP_CLOSE_TIMEOUT_MS = 5_000

export function createGodotMcpConfig(
  manifest: CompatibilityManifest,
  serverName: string = GODOT_MCP_SERVER_NAME,
): McpClientConfig {
  const config = manifest.godotAi
  const args = [
    '--link-mode', 'copy',
    '--from', `godot-ai==${config.defaultVersion}`,
    'godot-ai', 'attach',
    '--port', String(config.httpPort),
    '--ws-port', String(config.wsPort),
  ]
  if (config.excludeDomains.length > 0) args.push('--exclude-domains', config.excludeDomains.join(','))
  return Object.freeze({
    transport: 'stdio' as const,
    serverName,
    command: 'uvx',
    args: Object.freeze(args) as unknown as string[],
    env: {},
    cwd: '',
    toolCallTimeoutMs: config.toolCallTimeoutMs,
    // Closing the stdio transport keeps the DSH default budget instead of inheriting toolCallTimeoutMs.
    closeTimeoutMs: GODOT_MCP_CLOSE_TIMEOUT_MS,
    // The launch strings above are fully materialized, so `${credential:…}` expansion is not wanted.
    expandTemplates: false,
    failOnStartupError: false,
    reconnect: {
      enabled: true,
      initialDelayMs: config.reconnect.initialDelayMs,
      maxDelayMs: config.reconnect.maxDelayMs,
      maxAttempts: config.reconnect.maxAttempts,
    },
  })
}
