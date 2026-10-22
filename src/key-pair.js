import { generateKeyPairSync } from 'node:crypto'
import { lstat, mkdir, open, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { SIGNATURE_ALGORITHM } from './signature.js'

export const createKeyPairFiles = async ({ privateKeyPath, publicKeyPath, keyId }) => {
  if (resolve(privateKeyPath) === resolve(publicKeyPath)) {
    throw new Error('Private and public key paths must be different')
  }
  if (!/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/.test(keyId || '')) {
    throw new Error('Invalid feed signing key ID')
  }
  for (const path of [privateKeyPath, publicKeyPath]) {
    try {
      await lstat(path)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    throw new Error(`Refusing to overwrite existing key file: ${path}`)
  }
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'jwk' }
  })
  await Promise.all([privateKeyPath, publicKeyPath].map(path =>
    mkdir(dirname(path), { recursive: true })
  ))
  const created = []
  try {
    for (const [path, content, mode] of [
      [privateKeyPath, privateKey, 0o600],
      [publicKeyPath, `${JSON.stringify({ algorithm: SIGNATURE_ALGORITHM, jwk: publicKey, keyId }, null, 2)}\n`, 0o644]
    ]) {
      const file = await open(path, 'wx', mode)
      created.push(path)
      try { await file.writeFile(content, 'utf8') } finally { await file.close() }
    }
  } catch (error) {
    // Only files exclusively created by this invocation may be removed.
    await Promise.all(created.map(path => unlink(path)))
    throw error
  }
}
