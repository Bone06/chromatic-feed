import { fetchJson } from '../http.js'
import { compareVersions } from './github.js'

export const HIBBIKI_API_URL =
  'https://api.github.com/repos/Hibbiki/chromium-win64/releases?per_page=30'

const REPOSITORY_URL = 'https://github.com/Hibbiki/chromium-win64'
const RELEASE_PATH_PREFIX = '/Hibbiki/chromium-win64/releases/'
const TAG_PATTERN = /^v(\d+\.\d+\.\d+\.\d+)-r(\d+)$/
const REQUIRED_ASSETS = new Map([
  ['chrome.7z', 'Archive'],
  ['mini_installer.exe', 'Installer']
])

const requireObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

const parseHttpsUrl = (value, label) => {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be a valid URL`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS`)
  }
  return url
}

const parseTimestamp = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`)
  }
  return new Date(value).toISOString()
}

export const parseHibbikiRelease = (input, checkedAt = new Date().toISOString()) => {
  const release = requireObject(input, 'Release')
  const checkedAtIso = parseTimestamp(checkedAt, 'checkedAt')

  if (release.draft || release.prerelease) {
    throw new Error('Latest release must not be a draft or prerelease')
  }

  const tagMatch = TAG_PATTERN.exec(release.tag_name)
  if (!tagMatch) {
    throw new Error('Release tag does not match v<version>-r<revision>')
  }

  const releaseUrl = parseHttpsUrl(release.html_url, 'Release URL')
  if (
    releaseUrl.hostname !== 'github.com' ||
    !releaseUrl.pathname.startsWith(RELEASE_PATH_PREFIX)
  ) {
    throw new Error('Release URL is outside the allowed repository')
  }

  if (!Array.isArray(release.assets)) {
    throw new Error('Release assets must be an array')
  }

  const assetsByName = new Map(
    release.assets.map(asset => {
      requireObject(asset, 'Release asset')
      return [asset.name, asset]
    })
  )

  const downloads = [...REQUIRED_ASSETS].map(([name, label]) => {
    const asset = assetsByName.get(name)
    if (!asset) {
      throw new Error(`Required release asset is missing: ${name}`)
    }
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0) {
      throw new Error(`Release asset has invalid size: ${name}`)
    }

    const downloadUrl = parseHttpsUrl(
      asset.browser_download_url,
      `Download URL for ${name}`
    )
    const expectedPrefix = `${RELEASE_PATH_PREFIX}download/${release.tag_name}/`
    if (
      downloadUrl.hostname !== 'github.com' ||
      !downloadUrl.pathname.startsWith(expectedPrefix) ||
      downloadUrl.pathname.split('/').at(-1) !== name
    ) {
      throw new Error(`Download URL is outside the allowed release: ${name}`)
    }

    return {
      label,
      name,
      size: asset.size,
      url: downloadUrl.href
    }
  })

  const publishedAt = parseTimestamp(release.published_at, 'published_at')

  return {
    build: {
      architecture: 'x64',
      capabilities: {
        official: true,
        proprietaryCodecs: true,
        sync: true,
        widevine: true
      },
      channel: 'stable',
      displayName: 'Hibbiki – Stable – Sync – All Codecs+',
      downloads,
      id: 'hibbiki-chromium-win64-stable-codecs-sync',
      platform: 'win64',
      publishedAt,
      releaseUrl: releaseUrl.href,
      revision: tagMatch[2],
      sourceId: 'hibbiki-chromium-win64',
      tag: 'hibbiki-stable-codecs-sync',
      version: tagMatch[1]
    },
    source: {
      checkedAt: checkedAtIso,
      error: null,
      id: 'hibbiki-chromium-win64',
      lastSuccessAt: checkedAtIso,
      name: 'Hibbiki/chromium-win64',
      repository: `${REPOSITORY_URL}/`,
      stale: false
    }
  }
}

export const fetchHibbikiRelease = async options =>
  parseHibbikiReleases(
    await fetchJson(HIBBIKI_API_URL, options),
    options?.checkedAt
  )

export const parseHibbikiReleases = (input, checkedAt) => {
  if (!Array.isArray(input)) throw new Error('GitHub releases must be an array')
  const candidates = input
    .filter(release => TAG_PATTERN.test(release?.tag_name) && !release.draft && !release.prerelease)
  if (!candidates.length) throw new Error('No matching published Hibbiki release found')
  const latest = candidates.reduce((latest, candidate) => {
    const difference = compareVersions(
      TAG_PATTERN.exec(candidate.tag_name)[1],
      TAG_PATTERN.exec(latest.tag_name)[1]
    )
    if (difference > 0) return candidate
    if (difference < 0) return latest
    return Date.parse(parseTimestamp(candidate.published_at, 'published_at')) >
      Date.parse(parseTimestamp(latest.published_at, 'published_at'))
      ? candidate
      : latest
  })
  return parseHibbikiRelease(latest, checkedAt)
}
