/**
 * The Settings page's poll loop ends a provider's login attempt through one
 * predicate: once it says settled, the poller stops and the device-code card
 * is dropped.
 *
 * It once read "the provider has accounts" as "the attempt finished" — true
 * for a first login, wrong for a *second* one, where the first account was
 * already there. The card then lost the user code and the "open the page"
 * button one 2s tick after it appeared, the poller stopped, and a login that
 * completed in the browser stayed invisible until the page was reloaded (Muse
 * Code / Copilot device flow, but every provider shares the loop).
 *
 * The predicate is pure, so the status sequences a live poll walks are replayed
 * here without React and without an RPC channel.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attemptSettled, pendingDeviceCode } from '../src/client/SubscriptionsSection.js'
import type { AccountStatus, ProviderStatus } from '../src/client/SubscriptionsSection.js'

/** A status snapshot with `count` stored accounts and the given busy flag. */
function status(count: number, busy: boolean, detail?: string, pendingLogin?: { userCode: string; verificationUrl: string }): ProviderStatus {
  const accounts: AccountStatus[] = Array.from({ length: count }, (_, index) => ({
    key: `account-${String(index)}`,
    account: `user-${String(index)}@example.com`,
    isDefault: index === 0,
  }))
  return { accounts, busy, ...pendingLogin === undefined ? {} : { pendingLogin }, ...detail === undefined ? {} : { detail } }
}

/** The status snapshots one poll loop sees, in order. */
function walk(sequence: readonly ProviderStatus[]): boolean[] {
  return sequence.map(attemptSettled)
}

test('a first login keeps the device code card until the attempt settles', () => {
  // Idle, waiting for the authorization, then the exchange + store write, then
  // the session has landed. Only the last snapshot ends the attempt.
  const settled = walk([
    status(0, false),
    status(0, true),
    status(0, true),
    status(1, false),
  ])
  assert.deepEqual(settled, [true, false, false, true])
})

test('an account already stored does not end the attempt that is adding the next one', () => {
  // The regression: `accounts.length > 0` was true from the very first poll,
  // so the card vanished ~2s in and the loop never saw the new account.
  const settled = walk([
    status(1, false),   // idle, one account stored
    status(1, true),    // the user clicked "add account" and is authorizing it
    status(1, true),    // token received, key mint + store write in flight
    status(2, false),   // both accounts stored, attempt over
  ])
  assert.deepEqual(settled, [true, false, false, true],
    'an attempt adding a second account stays live until the server says idle')
})

test('a failed second attempt settles and surfaces its error', () => {
  const settled = walk([
    status(1, true),
    status(1, false, 'this Meta account has no active Muse Code subscription'),
  ])
  assert.deepEqual(settled, [false, true])
})

test('a cancelled attempt settles back to idle', () => {
  // Cancel stops the client poller itself, but the status the page renders
  // after its own refresh must read as settled rather than stuck busy.
  assert.equal(attemptSettled(status(1, false)), true)
})

test('a provider with many accounts still settles when it is idle', () => {
  assert.equal(attemptSettled(status(5, false)), true)
  assert.equal(attemptSettled(status(5, true)), false)
})

test('the code card prefers the answer of this page login and falls back to the reported attempt', () => {
  const local = { userCode: 'ABCD-1234', verificationUrl: 'https://auth.meta.com/oidc/device' }
  const reported = { userCode: 'WXYZ-9876', verificationUrl: 'https://auth.meta.com/oidc/device?user_code=WXYZ-9876' }

  assert.deepEqual(pendingDeviceCode(status(1, true, undefined, reported), local), local,
    'the freshest code is the one this page just received')
  assert.deepEqual(pendingDeviceCode(status(1, true, undefined, reported), undefined), reported,
    'after a reload the local copy is gone and the reported attempt keeps the card')
  assert.equal(pendingDeviceCode(status(1, false), undefined), undefined,
    'a settled attempt shows no card')
  assert.equal(pendingDeviceCode(undefined, undefined), undefined, 'no status yet, no card')
})