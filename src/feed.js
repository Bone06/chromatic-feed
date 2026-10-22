const isObject = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const IDENTIFIER = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/
const VERSION = /^\d+(?:\.\d+){3}$/
const REVISION = /^\d+$/
const SHA256 = /^[a-f0-9]{64}$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

const requireExactKeys = (value, required, optional, label) => {
  if (!isObject(value)) throw new Error(`${label} must be an object`)
  const allowed = new Set([...required, ...optional])
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required`)
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}.${key} is not allowed`)
  }
}

const requireIdentifier = (value, label) => {
  if (typeof value !== 'string' || value.length > 120 || !IDENTIFIER.test(value)) {
    throw new Error(`${label} must be a valid identifier`)
  }
}

const requireLabel = (value, label, maxLength = 120) => {
  if (
    typeof value !== 'string' || !value.trim() || value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`${label} must be valid text`)
}

const requireHttpsUrl = (value, label) => {
  let url
  try { url = new URL(value) } catch { throw new Error(`${label} must be a URL`) }
  if (
    url.protocol !== 'https:' || url.username || url.password ||
    value.length > 2048
  ) throw new Error(`${label} must be a credential-free HTTPS URL`)
}

const requireIsoTimestamp = (value, label) => {
  if (
    typeof value !== 'string' || !TIMESTAMP.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${label} must be an ISO timestamp`)
  }
}

export const validateFeed = feed => {
  if (!isObject(feed) || feed.schemaVersion !== 1) {
    throw new Error('Feed must use schemaVersion 1')
  }
  requireExactKeys(feed, ['schemaVersion', 'generatedAt', 'sources', 'builds'], [], 'feed')
  requireIsoTimestamp(feed.generatedAt, 'generatedAt')

  if (!Array.isArray(feed.sources) || !Array.isArray(feed.builds)) {
    throw new Error('Feed sources and builds must be arrays')
  }
  if (!feed.sources.length || !feed.builds.length) {
    throw new Error('Feed must contain at least one source and build')
  }

  const sourceIds = new Set()
  for (const source of feed.sources) {
    requireExactKeys(source, [
      'id', 'name', 'repository', 'checkedAt', 'lastSuccessAt', 'stale', 'error'
    ], [], 'source')
    requireIdentifier(source.id, 'source.id')
    if (sourceIds.has(source.id)) {
      throw new Error(`Duplicate source id: ${source.id}`)
    }
    sourceIds.add(source.id)
    requireLabel(source.name, `${source.id}.name`)
    requireHttpsUrl(source.repository, `${source.id}.repository`)
    requireIsoTimestamp(source.checkedAt, `${source.id}.checkedAt`)
    requireIsoTimestamp(source.lastSuccessAt, `${source.id}.lastSuccessAt`)
    if (typeof source.stale !== 'boolean') {
      throw new Error(`${source.id}.stale must be boolean`)
    }
    if (source.error !== null && typeof source.error !== 'string') {
      throw new Error(`${source.id}.error must be null or string`)
    }
    if (source.error !== null) requireLabel(source.error, `${source.id}.error`, 500)
    if (source.stale !== Boolean(source.error)) {
      throw new Error(`${source.id}.stale and error must agree`)
    }
  }

  const buildIds = new Set()
  for (const build of feed.builds) {
    requireExactKeys(build, [
      'id', 'sourceId', 'platform', 'architecture', 'tag', 'channel', 'version',
      'publishedAt', 'releaseUrl', 'capabilities', 'downloads'
    ], ['displayName', 'revision'], 'build')
    requireIdentifier(build.id, 'build.id')
    if (buildIds.has(build.id)) {
      throw new Error(`Duplicate build id: ${build.id}`)
    }
    buildIds.add(build.id)
    requireIdentifier(build.sourceId, `${build.id}.sourceId`)
    if (!sourceIds.has(build.sourceId)) {
      throw new Error(`Unknown source id: ${build.sourceId}`)
    }
    for (const key of ['platform', 'architecture', 'tag', 'channel']) {
      requireIdentifier(build[key], `${build.id}.${key}`)
    }
    if (typeof build.version !== 'string' || !VERSION.test(build.version)) {
      throw new Error(`${build.id}.version is invalid`)
    }
    if (build.displayName !== undefined) requireLabel(
      build.displayName, `${build.id}.displayName`
    )
    if (build.revision !== undefined && (typeof build.revision !== 'string' || !REVISION.test(build.revision))) {
      throw new Error(`${build.id}.revision is invalid`)
    }
    requireIsoTimestamp(build.publishedAt, `${build.id}.publishedAt`)
    requireHttpsUrl(build.releaseUrl, `${build.id}.releaseUrl`)
    requireExactKeys(build.capabilities, [
      'official', 'proprietaryCodecs', 'sync', 'widevine'
    ], [], `${build.id}.capabilities`)
    for (const [key, value] of Object.entries(build.capabilities)) {
      if (typeof value !== 'boolean') {
        throw new Error(`${build.id}.capabilities.${key} must be boolean`)
      }
    }
    if (!Array.isArray(build.downloads) || !build.downloads.length) {
      throw new Error(`${build.id}.downloads must not be empty`)
    }
    for (const [index, download] of build.downloads.entries()) {
      const label = `${build.id}.downloads[${index}]`
      requireExactKeys(download, ['label', 'name', 'size', 'url'], ['sha256'], label)
      requireLabel(download.label, `${label}.label`)
      requireLabel(download.name, `${label}.name`)
      if (!Number.isSafeInteger(download.size) || download.size < 1) {
        throw new Error(`${label}.size must be a positive safe integer`)
      }
      requireHttpsUrl(download.url, `${label}.url`)
      if (download.sha256 !== undefined && !SHA256.test(download.sha256)) {
        throw new Error(`${label}.sha256 is invalid`)
      }
    }
  }

  return feed
}

export const createFeed = ({ builds, generatedAt, sources }) =>
  validateFeed({
    builds,
    generatedAt: new Date(generatedAt).toISOString(),
    schemaVersion: 1,
    sources
  })
