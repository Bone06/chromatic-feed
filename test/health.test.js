import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFeedHealth, parseMaxAgeSeconds } from '../src/health.js'

const freshFeed = (generatedAt, sources = [{ id: 'test', lastSuccessAt: generatedAt, stale: false }]) => ({ generatedAt, sources })

test('feed health accepts a recent generation', () => {
  assert.deepEqual(
    getFeedHealth({
      feed: freshFeed('2026-07-23T08:00:00.000Z'),
      now: Date.parse('2026-07-23T08:30:00.000Z'),
      maxAgeSeconds: 3600
    }),
    {
      ageSeconds: 1800,
      generatedAt: '2026-07-23T08:00:00.000Z',
      status: 'healthy',
      warnings: []
    }
  )
})

test('feed health rejects stale and implausibly future generations', () => {
  assert.throws(
    () => getFeedHealth({
      feed: freshFeed('2026-07-23T08:00:00.000Z'),
      now: Date.parse('2026-07-23T10:00:01.000Z'),
      maxAgeSeconds: 7200
    }),
    /Feed is stale/
  )
  assert.throws(
    () => getFeedHealth({
      feed: freshFeed('2026-07-23T08:06:00.000Z'),
      now: Date.parse('2026-07-23T08:00:00.000Z')
    }),
    /unexpectedly in the future/
  )
})

test('feed health validates the configured maximum age', () => {
  assert.equal(parseMaxAgeSeconds(undefined), 10800)
  assert.equal(parseMaxAgeSeconds('7200'), 7200)
  for (const value of ['', '0', '-1', '1.5', 'seconds', '999999999999999999999']) {
    assert.throws(() => parseMaxAgeSeconds(value), /positive integer/)
  }
})

test('health distinguishes degraded sources from a total long-term upstream outage', () => {
  const now = Date.parse('2026-10-22T12:00:00Z')
  const generatedAt = new Date(now).toISOString()
  const recent = { id: 'recent', lastSuccessAt: generatedAt, stale: false }
  const failed = { id: 'failed', lastSuccessAt: '2026-10-22T07:00:00Z', stale: true }
  const degraded = getFeedHealth({ feed: freshFeed(generatedAt, [recent, failed]), now })
  assert.equal(degraded.status, 'degraded')
  assert.match(degraded.warnings[0], /failed.*too old/)
  assert.throws(() => getFeedHealth({ feed: freshFeed(generatedAt, [failed]), now }), /All feed sources/)
  assert.equal(getFeedHealth({ feed: freshFeed(generatedAt, [{ ...recent, stale: true }]), now }).status, 'degraded')
  assert.throws(() => getFeedHealth({ feed: freshFeed(generatedAt, []), now }), /no sources/)
  assert.throws(() => getFeedHealth({ feed: freshFeed(generatedAt, [{ ...recent, lastSuccessAt: '2099-01-01T00:00:00Z' }]), now }), /invalid lastSuccessAt/)
})

