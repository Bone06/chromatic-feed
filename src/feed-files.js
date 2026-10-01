import { readFile } from 'node:fs/promises'
import { validateFeed } from './feed.js'
import { verifyFeedSignature } from './signature.js'

export const verifyFeedFiles = async ({ feedPath, trustedPublicKeys }) => {
  const [feedText, signatureText] = await Promise.all([
    readFile(feedPath, 'utf8'),
    readFile(`${feedPath}.sig`, 'utf8')
  ])

  verifyFeedSignature({
    feedText,
    signatureDocument: JSON.parse(signatureText),
    trustedPublicKeys
  })
  return validateFeed(JSON.parse(feedText))
}
