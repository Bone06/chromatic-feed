import assert from 'node:assert/strict'
import { createPublicKey } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createKeyPairFiles } from '../src/key-pair.js'

test('key generation preserves existing targets and creates matching keys only at new paths', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'chromatic-key-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const privateKeyPath = join(directory, 'test-private.pem')
  const publicKeyPath = join(directory, 'test-public.json')
  const options = { privateKeyPath, publicKeyPath, keyId: 'test-key' }
  await writeFile(publicKeyPath, 'existing public file')
  await assert.rejects(createKeyPairFiles(options), /Refusing to overwrite/)
  await assert.rejects(stat(privateKeyPath), { code: 'ENOENT' })
  assert.equal(await readFile(publicKeyPath, 'utf8'), 'existing public file')
  await rm(publicKeyPath)
  await assert.rejects(createKeyPairFiles({ ...options, publicKeyPath: privateKeyPath }), /different/)
  await createKeyPairFiles(options)
  const privateKey = await readFile(privateKeyPath, 'utf8')
  const document = JSON.parse(await readFile(publicKeyPath, 'utf8'))
  const derived = createPublicKey(privateKey).export({ format: 'jwk' })
  assert.equal(document.keyId, 'test-key')
  assert.equal(document.jwk.x, derived.x)
  assert.equal(document.jwk.y, derived.y)
  await assert.rejects(createKeyPairFiles(options), /Refusing to overwrite/)
  assert.equal(await readFile(privateKeyPath, 'utf8'), privateKey)
})
