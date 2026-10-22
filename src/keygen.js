import './runtime-check.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKeyPairFiles } from './key-pair.js'

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
await createKeyPairFiles({ privateKeyPath, publicKeyPath, keyId })

console.log(`Private key created at ${privateKeyPath}`)
console.log(`Public key created at ${publicKeyPath}`)
