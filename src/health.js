const DEFAULT_MAX_AGE_SECONDS = 3 * 60 * 60
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

export const parseMaxAgeSeconds = value => {
  if (value === undefined) return DEFAULT_MAX_AGE_SECONDS
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error('FEED_MAX_AGE_SECONDS must be a positive integer')
  }
  return Number(value)
}

export const getFeedHealth = ({
  feed,
  now = Date.now(),
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS
}) => {
  const generatedAt = Date.parse(feed.generatedAt)
  if (!Number.isFinite(generatedAt)) throw new Error('Invalid feed generatedAt')

  const ageMs = now - generatedAt
  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    throw new Error('Feed generatedAt is unexpectedly in the future')
  }
  if (ageMs > maxAgeSeconds * 1000) {
    throw new Error(
      `Feed is stale: generated ${Math.floor(ageMs / 1000)} seconds ago`
    )
  }

  if (!Array.isArray(feed.sources) || !feed.sources.length) {
    throw new Error('Feed has no sources to monitor')
  }
  const warnings = []
  let recentSources = 0
  for (const source of feed.sources) {
    const successAt = Date.parse(source.lastSuccessAt)
    if (!Number.isFinite(successAt) || successAt - now > MAX_FUTURE_SKEW_MS) {
      throw new Error(`Source ${source.id} has an invalid lastSuccessAt`)
    }
    const recent = now - successAt <= maxAgeSeconds * 1000
    if (recent) recentSources += 1
    if (source.stale || !recent) {
      warnings.push(`Source ${source.id}: ${recent ? 'refresh failed' : 'last success is too old'}`)
    }
  }
  if (!recentSources) throw new Error('All feed sources have stale last-success timestamps')

  return {
    ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
    generatedAt: feed.generatedAt,
    status: warnings.length ? 'degraded' : 'healthy',
    warnings
  }
}

