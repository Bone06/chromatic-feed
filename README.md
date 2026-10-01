# Chromatic Feed

Dependency-free Node.js aggregator for the signed Chromium build feed consumed
by Chromium Update Notifications. It normalizes independently maintained build
sources, isolates upstream failures and publishes a frozen, versioned contract.

Before changing the feed contract, read the canonical cross-project contract
in `INTEGRATION.md`.

## Requirements

Node.js 24.11.0 or newer is required. Every executable entry point enforces
the same minimum recorded in `package.json`, so unsupported production and
development runtimes fail before performing work.

## Supported sources

The current feed contains 16 builds from Hibbiki, macchrome, RobRich and the
official Google Chromium snapshot buckets. Supported platforms are Windows x64
and ARM64, macOS Intel and Apple Silicon, and Linux x64. The validated source,
tag and asset rules are documented in `SOURCE_MATRIX.md`.

## Commands

```text
npm test
npm run generate
npm run sign
npm run serve
```

The loopback server binds only to `127.0.0.1` and exposes:

```text
http://127.0.0.1:8787/versions.json
http://127.0.0.1:8787/versions.json.sig
```

`npm run generate` fetches and validates current upstream metadata, isolates
source failures, reuses only correctly signed cache data, and atomically writes
a new signed feed. `npm run sign` signs an existing validated feed without
fetching upstream sources.

## Feed contract and signing

The frozen v1 contracts are defined by:

- `schema/feed-v1.schema.json`
- `schema/feed-signature-v1.schema.json`

Incompatible changes require a new `schemaVersion`. The detached signature is
ECDSA P-256/SHA-256 in IEEE P1363 format and covers the exact feed bytes.

`npm run keygen` is a one-time operation. It creates a private key under the
Git-ignored `.secrets` directory and a distributable public key under `keys`.
Back up the private key securely and never commit or publish it. Production may
provide another private-key path through `FEED_SIGNING_PRIVATE_KEY_PATH`.

Release key rotation creates the next pair beside, rather than over, the active
pair. Set `FEED_SIGNING_KEY_ID`, `FEED_SIGNING_PRIVATE_KEY_PATH` and
`FEED_SIGNING_PUBLIC_KEY_PATH` to new paths before running `npm run keygen`.
The command refuses to overwrite either file. Commit only the new public JSON;
keep and back up the new private PEM offline until the corresponding extension
release is public and the production signer is ready to rotate.

After that extension release is public, preserve the outgoing public key under
its versioned filename and promote the incoming public key to
`keys/feed-public-key.json`. The generator and feed verifier trust every
versioned public key in `keys`, so the outgoing signed feed remains a valid
cache source during the first publication with the new key. Only the canonical
file selects the key used for new signatures.

## Production host layout

The Debian host uses the non-login `chromium-feed` system account. Initialize
the production account and directories with:

```sh
sudo sh ./deploy/setup-host.sh
```

The idempotent script creates the system account when absent, but never changes
an existing account or creates, copies or replaces signing keys. Application
code is installed under `/opt/chromium-build-sources`, private runtime state
under `/var/lib/chromium-build-sources`, and the Caddy-readable feed under
`/srv/chromium-build-sources/chromium`. The complete production procedure and
systemd units are documented in `deploy/README.md`.

## Production status

The signed feed is generated hourly by a hardened systemd service and published
through an atomic release switch at
`https://bone06.ddns.net/chromium/versions.json`. Caddy cache and content
headers, restricted signing-key storage, external signature verification and
an extension-validator smoke test are complete. A sandboxed systemd monitor
checks the active signature, schema and freshness every 15 minutes. External
failure notification delivery remains to be configured.

## License

Chromatic Feed is free software licensed under the GNU General Public
License, version 3 or (at your option) any later version. See `COPYING.txt` for
the complete license text.
