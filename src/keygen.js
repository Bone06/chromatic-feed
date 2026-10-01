import './runtime-check.js'
import { generateKeyPairSync } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIGNATURE_ALGORITHM } from './signature.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const privateKeyPath = resolve(
  process.env.FEED_SIGNING_PRIVATE_KEY_PATH ||
    resolve(root, '.secrets', 'feed-signing-private.pem')
)
const publicKeyPath = resolve(
  process.env.FEED_SIGNING_PUBLIC_KEY_PATH ||
    resolve(root, 'keys', 'feed-public-key.json')
)
const keyId = process.env.FEED_SIGNING_KEY_ID || 'feed-2026-01'
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'jwk' }
})

await Promise.all([
  mkdir(dirname(privateKeyPath), { recursive: true }),
  mkdir(dirname(publicKeyPath), { recursive: true })
])
await writeFile(privateKeyPath, privateKey, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
await writeFile(publicKeyPath, `${JSON.stringify({
  algorithm: SIGNATURE_ALGORITHM,
  jwk: publicKey,
  keyId
}, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })

console.log(`Private key created at ${privateKeyPath}`)
console.log(`Public key created at ${publicKeyPath}`)
