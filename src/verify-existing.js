import './runtime-check.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyFeedFiles } from './feed-files.js'
import { getFeedOutputPath } from './paths.js'
import { loadTrustedPublicKeys } from './signature.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const feedPath = getFeedOutputPath({ root })
const trustedPublicKeys = await loadTrustedPublicKeys(resolve(root, 'keys'))
const feed = await verifyFeedFiles({
  feedPath,
  trustedPublicKeys
})

console.log(
  `Verified ${feedPath}: ${feed.builds.length} builds, generated ${feed.generatedAt}.`
)
