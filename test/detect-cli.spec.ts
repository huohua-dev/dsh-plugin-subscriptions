/**
 * Runtime detection of the locally installed Claude Code CLI version and
 * beta flags.  Exercises both the happy path (claude binary on $PATH) and
 * the fallback path (binary absent or broken).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  detectClaudeVersion,
  CLAUDE_CLI_FALLBACK_VERSION,
  claudeBetaFlags,
} from '../src/providers/claude.js'

// ---------------------------------------------------------------------------
// detectClaudeVersion
// ---------------------------------------------------------------------------

test('detectClaudeVersion returns a semver-shaped string', () => {
  const version = detectClaudeVersion()
  assert.match(version, /^\d+\.\d+\.\d+$/, `expected semver, got "${version}"`)
})

test('detectClaudeVersion fallback is a valid semver', () => {
  assert.match(CLAUDE_CLI_FALLBACK_VERSION, /^\d+\.\d+\.\d+$/)
})

test('detectClaudeVersion returns the fallback when claude is not in PATH', () => {
  // Temporarily break PATH so `claude` cannot be found.
  const original = process.env.PATH
  try {
    process.env.PATH = ''
    const version = detectClaudeVersion()
    assert.equal(version, CLAUDE_CLI_FALLBACK_VERSION)
  } finally {
    process.env.PATH = original
  }
})

/** A working CLI must win over the hard-coded fallback version. */
test('detectClaudeVersion reads a resolvable CLI rather than the fallback', () => {
  const bin = join(mkdtempSync(join(tmpdir(), 'claude-probe-')), process.platform === 'win32' ? 'claude.cmd' : 'claude')
  const reported = '9.9.9'
  writeFileSync(bin, process.platform === 'win32'
    ? `@echo off\r\necho ${reported} (Claude Code)\r\n`
    : `#!/bin/sh\necho "${reported} (Claude Code)"\n`, { mode: 0o755 })
  const original = process.env.PATH
  try {
    process.env.PATH = dirname(bin)
    assert.equal(detectClaudeVersion(), reported)
  } finally {
    process.env.PATH = original
    rmSync(dirname(bin), { recursive: true, force: true })
  }
})

/** The fallback must remain above the currently documented model floor. */
test('detectClaudeVersion fallback is new enough for currently gated models', () => {
  const [major, minor, patch] = CLAUDE_CLI_FALLBACK_VERSION.split('.').map(Number)
  assert.ok(major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 251))))
})

// ---------------------------------------------------------------------------
// claudeBetaFlags
// ---------------------------------------------------------------------------

const EXPECTED_FLAGS = [
  'claude-code-20250219',
  'oauth-2025-04-20',
  'interleaved-thinking-2025-05-14',
  'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05',
  'structured-outputs-2025-12-15',
  'fast-mode-2026-02-01',
  'redact-thinking-2026-02-12',
  'token-efficient-tools-2026-03-28',
]

test('claudeBetaFlags is a well-formed comma-separated flag list', () => {
  const header = claudeBetaFlags('claude-haiku-4-5-20251001')
  assert.ok(header.length > 0, 'must not be empty')
  assert.ok(!header.startsWith(',') && !header.endsWith(','), 'no leading/trailing commas')
  for (const flag of header.split(',')) {
    // Dates appear both dashed (oauth-2025-04-20) and compact (claude-code-20250219).
    assert.match(flag, /^[a-z][\w-]+-\d{4}-?\d{2}-?\d{2}$/, `malformed flag: "${flag}"`)
  }
})

test('claudeBetaFlags base set matches the live-verified flag set', () => {
  const flags = claudeBetaFlags('claude-haiku-4-5-20251001').split(',')
  for (const expected of EXPECTED_FLAGS) {
    assert.ok(flags.includes(expected), `missing expected flag: ${expected}`)
  }
  assert.equal(flags.length, EXPECTED_FLAGS.length, `expected ${EXPECTED_FLAGS.length} flags, got ${flags.length}`)
})
