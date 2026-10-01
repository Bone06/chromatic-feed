import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  loadPublicKeyConfiguration,
  loadTrustedPublicKeys
} from '../src/signature.js'

const root = resolve(import.meta.dirname, '..')

test('active signing key is feed-2026-02', async () => {
  const publicKey = await loadPublicKeyConfiguration(
    resolve(root, 'keys', 'feed-public-key.json')
  )
  assert.equal(publicKey.keyId, 'feed-2026-02')
})

test('rotation trusts both the previous and active signing keys', async () => {
  const trustedPublicKeys = await loadTrustedPublicKeys(resolve(root, 'keys'))
  assert.deepEqual(Object.keys(trustedPublicKeys).sort(), [
    'feed-2026-01',
    'feed-2026-02'
  ])
})
