/**
 * MuseUsageMemo: the last usage Meta reported survives a restart, a partial
 * report keeps the other lane, and a corrupt file reads as empty.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MuseUsageMemo } from '../src/providers/muse-usage-memo.js'

async function memoPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'dsh-muse-usage-')), 'muse-usage.json')
}

const WEEKLY = { used_percent: 67, resets_at: 1_793_577_600 }
const WINDOW = { used_percent: 5, window_duration_mins: 300, resets_at: 1_793_448_894 }

test('a remembered usage is recalled after a restart', async () => {
  const path = await memoPath()
  const memo = new MuseUsageMemo(path)
  memo.remember('a@example.com', { window: WINDOW, weekly: WEEKLY, tier: '1' })
  await memo.flush()
  const restarted = new MuseUsageMemo(path)
  assert.deepEqual(await restarted.recall('a@example.com'), { window: WINDOW, weekly: WEEKLY, tier: '1' })
  assert.equal(await restarted.recall('b@example.com'), undefined)
})

test('a report missing one lane keeps the remembered one; junk is ignored', async () => {
  const path = await memoPath()
  const memo = new MuseUsageMemo(path)
  memo.remember('a@example.com', { window: WINDOW, weekly: WEEKLY })
  memo.remember('a@example.com', { window: { ...WINDOW, used_percent: 9 } })
  memo.remember('a@example.com', { window: { used_percent: Number.NaN } })
  await memo.flush()
  assert.deepEqual(await memo.recall('a@example.com'), { window: { ...WINDOW, used_percent: 9 }, weekly: WEEKLY })
  const saved = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  assert.deepEqual(saved['a@example.com'], { window: { ...WINDOW, used_percent: 9 }, weekly: WEEKLY })
})

test('a corrupt or malformed file reads as empty', async () => {
  const path = await memoPath()
  await writeFile(path, '{not json')
  assert.equal(await new MuseUsageMemo(path).recall('a@example.com'), undefined)
  await writeFile(path, JSON.stringify({ 'a@example.com': { weekly: { used_percent: 'x' } }, 'b@example.com': { weekly: WEEKLY } }))
  const memo = new MuseUsageMemo(path)
  assert.equal(await memo.recall('a@example.com'), undefined)
  assert.deepEqual(await memo.recall('b@example.com'), { weekly: WEEKLY })
})
