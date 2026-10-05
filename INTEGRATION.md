# Chromatic Feed integration contract

This is the canonical coordination document shared by the Chromatic Feed
aggregator and the Chromium Update Notifications extension. Read it before
changing either project.

## Projects and responsibilities

### `chromatic-feed`

- Knows the external build sources and their different release, tag and asset
  formats.
- Fetches, validates and normalizes data independently for each source.
- Isolates source failures and preserves the last successful data.
- Publishes a versioned, static JSON feed over HTTP.
- Contains no extension UI or Chrome API logic.

### `chromium-notifier`

- Does not query individual GitHub repositories directly.
- Fetches one normalized feed in its background process.
- Strictly validates the feed schema and safe URLs.
- Caches the last successful data, handles stale/error state, and renders data
  from storage in the popup.
- Does not know upstream-specific tag or asset formats.

## Data flow

```text
upstream build repositories
          ↓
source adapters and validation
          ↓
versioned static JSON feed
          ↓
notifier service worker → chrome.storage.local → popup
```

## Frozen feed v1 contract

Root fields of a `schemaVersion: 1` feed:

```text
schemaVersion: 1
generatedAt: UTC ISO 8601
sources: array of source records
builds: array of build records
```

Required source-record fields:

```text
id, name, repository, checkedAt, lastSuccessAt, stale, error
```

Build records describe:

- build identifier;
- platform and architecture;
- build tag/channel;
- optional user-facing `displayName`; persistent selection still uses the
  stable `tag` as its key;
- Chromium version;
- revision, when supplied by the source;
- publication time;
- source name, repository and release provenance;
- downloadable assets with label, HTTPS URL, size and optional checksum;
- per-source last attempt, last success, stale state and error;
- required `capabilities` booleans for official, Sync, proprietary codecs and
  Widevine.

Every timestamp must be a standard UTC ISO 8601 string. Versions must be
compared semantically, never by plain string sorting.

## Supported sources

### `Hibbiki/chromium-win64`

- Platform: Windows x64.
- Build: stable, official, proprietary codecs, Widevine and Google Sync.
- API: `https://api.github.com/repos/Hibbiki/chromium-win64/releases/latest`.
- Tag pattern: `v<chromium-version>-r<revision>`.
- Automatically publishable assets: Archive (`chrome.7z`) and Installer
  (`mini_installer.exe`).
- Policy templates (`policy_templates.zip`) are not needed and must be ignored.
- The adapter ignores other asset categories and custom names by default.
  Publishing one requires user confirmation.
- `SOURCE_MATRIX.md` is the canonical matrix for all additional supported
  GitHub and Google sources.

## Multi-source implementation

`SOURCE_CANDIDATES.md` preserves the historical user source list, while
`SOURCE_MATRIX.md` contains the verified release, tag and asset matrix. In
addition to Hibbiki, the service supports macchrome Windows, macOS and Linux
repositories, plus RobRich Windows AVX/AVX2/AVX512 and Linux DEB/RPM AVX/AVX2
variants.

### Google Storage Chromium snapshots

Only the `Win_x64`, `Win_Arm64`, `Mac`, `Mac_Arm` and `Linux_x64` prefixes in
the `chromium-browser-snapshots` bucket are allowed. For each platform,
`LAST_CHANGE` supplies the commit position, the revision directory's
`REVISIONS` file supplies the exact Chromium Git commit, and that commit's
`chrome/VERSION` file supplies the version.

- Windows x64/ARM64: `chrome-win.zip` Archive and `mini_installer.exe`
  Installer.
- macOS Intel/ARM: `chrome-mac.zip` Archive.
- Linux x64: `chrome-linux.zip` Archive.
- Android, ChromeOS/Lacros, symbol, driver, content-shell, updater and test
  packages must not be published.
- A snapshot is development data, not a stable release. An incomplete newest
  directory is a source failure; the previous successful platform data must be
  preserved.

## Non-negotiable requirements

- Treat every upstream response as untrusted data.
- Repository, tag, asset and URL allowlists are mandatory.
- Only HTTPS download links may be published.
- One failing source must not delete another source's data or its own previous
  successful data.
- When a previously successful source fails, retain its builds and
  `lastSuccessAt`, set `stale: true`, and provide a short error. A source that
  has never succeeded is omitted without blocking others. If no successful or
  cached build exists, do not overwrite the previous feed.
- Bound feed size and network request duration.
- The extension must perform its own validation in addition to server-side
  validation.
- An incompatible schema change requires a new `schemaVersion`.

## Coordination rule

When the feed structure or meaning of any field changes:

1. update this document first;
2. update aggregator fixtures and contract tests;
3. update the corresponding notifier fixtures and validation tests;
4. only then change the production feed or endpoint.

This file is always the primary source for the shared contract.

## Local integration environment

The shared development machine may temporarily serve the aggregator's local
feed for notifier testing.

- Bind to `127.0.0.1` by default, using a random or agreed port.
- Run the server only for the required test, then stop it cleanly.
- Do not modify the normal Chromium profile, system startup or firewall.
- LAN/internet publication, port forwarding and persistent services require
  separate user authorization. The current production service was separately
  authorized at `https://bone06.ddns.net/chromium/versions.json`.

## New-source rollout checklist

1. Record the repository, platform, architecture, build characteristics,
   release API, tag pattern and publication-time source.
2. Archive and Installer categories are accepted automatically. Exclude policy
   templates; ask the user before publishing any other or custom asset.
3. In a dedicated adapter, allowlist and validate repository, release, tag,
   asset and HTTPS URL formats. Ignore unknown extra assets.
4. Use fixtures to test successful normalization, missing required assets,
   changed tags, forbidden URLs and extra-asset filtering.
5. After the full aggregator suite, generate a feed from real upstream data and
   verify version, revision, provenance and downloads.
6. First test the new feed only through a loopback server with the current
   extension. Verify the popup, links, platform/tag selection, version
   comparison and badge.
7. After a successful fetch, stop the server and use `Check for Updates` to
   verify that cache remains, stale/error state appears, the last attempt
   advances, and last success plus the known update badge remain.
8. Before production, finalize the HTTPS endpoint, schedule, per-source cache
   retention and network limits. Then update the extension endpoint and host
   permission, repeat automated and manual tests, and merge only after success.

## Production cache and additional protection

The generator may fetch and validate the previously published feed from the
HTTPS `PREVIOUS_FEED_URL`. If that fails, the validated local
`dist/versions.json` is the fallback. The new feed is replaced atomically
through a temporary file. A remote or local previous feed may be reused only
with its valid `.sig` sidecar and a trusted key. Reject missing, invalid or
unknown-key signatures and signatures for different feed bytes. This prevents
hosting from laundering manipulated data under the aggregator's signature.

Snapshot revision notifications within the same version are controlled by a
separate setting that is off by default. The last seen revision for the
selected build is stored locally; opening the popup acknowledges it.

The v1 contract is fixed by `schema/feed-v1.schema.json`, with
`additionalProperties: false`, and by both projects' runtime validators. An
incompatible field or semantic change requires a new `schemaVersion`.

Every `versions.json` must have a `versions.json.sig` over its exact bytes.
`feed-signature-v1.schema.json` defines the format: ECDSA P-256/SHA-256,
detached IEEE P1363 signature and `keyId`. The extension verifies the signature
with an embedded public key before parsing JSON and rejects rollback to an
older `generatedAt`. A private key must never enter a repository or hosting.
For rotation, first release an extension that trusts the new public key; only
then may the aggregator switch to the new private key.

The online feed-signing key has a maximum active signing lifetime of 12 calendar
months from its first production use; an extension release alone does not
trigger rotation. Record that first-use date and plan a replacement before the
deadline. `feed-2026-02` first signed the production feed on 2026-10-01, so its
planned signing deadline is 2027-10-01. Start the planned transition 30 days
before the scheduled cutover: publish a bridging extension that trusts the
current and next public keys, then allow up to 30 days for updates before
changing the single active production signer. Do not run two active private
signing keys on the host.
Clients that never acquire the next public key must be retired when the signer
changes; keeping the old signer active for them is not an indefinite fallback.

The entire dual-trust period for a planned rotation is limited to 30 days,
ending at the signer cutover. A bridging client must stop accepting the
outgoing key at that cutover, through a tested client-side expiry; a follow-up
release should also remove it. Before the next planned rotation, implement and
test this expiry path and the precise UTC cutover dates; the existing 4.1.0
client embeds `feed-2026-01` and `feed-2026-02` without expiry and cannot be
retroactively changed. Remove `feed-2026-01` from the next client release.
Starting with the next extension release, show a persistent, restrained popup
notice during a planned transition while the last successfully verified feed
uses the outgoing `keyId`. Persist that authenticated key ID across `304`
responses; clear the notice when a feed signed by the incoming key is verified.
The notice must not claim that an already updated bridging client is outdated,
and must not replace feed error or stale-data reporting. Do not use the browser
badge or a system notification for this planned-transition notice.
The extension code already records the verified `buildFeedKeyId` and contains
the notice logic; its `PLANNED_FEED_KEY_ROTATION` setting remains inactive until
the next outgoing/incoming key pair and exact UTC cutover are scheduled.
After the rollback window, archive the outgoing private key offline or destroy
it; never leave it in the active generator. A public key remaining in an older
installed client is not revoked by removing a private key from the host.

Suspected or confirmed private-key compromise overrides the planned schedule:
stop publishing with that key immediately, generate and deploy a replacement,
and issue an emergency extension release that rejects the compromised key.
There is no 30-day grace period and no dual trust of the compromised key in
the emergency release. Old installed clients cannot be remotely made to stop
trusting a key baked into them; warn users to update, and do not claim those
clients are protected merely because the server-side signer changed. Keep the
public feed unavailable rather than continue signing with a suspected key if
the safe replacement cannot be completed immediately.

A planned security improvement introduces a separate offline recovery/root
key. It signs a versioned, expiring authorization document for the online feed
key. The extension trusts the root public key and accepts feed signatures only
from authorized, non-revoked online keys. After online-key compromise, the
offline root revokes it and authorizes a replacement. This is not a 1-of-2
"either signature is enough" model, which would not resist one compromised
key. Document format, rollback/freeze protection, expiry and recovery require a
separate feed-contract and client change. Until then, pre-provisioned rotation
remains the active design.

The extension stores the production feed ETag and sends `If-None-Match` on
later requests. On `304 Not Modified`, the locally cached feed that already
passed signature and schema validation remains valid. Atomic publication, the
15-minute signature/schema/freshness monitor, and a production smoke test using
the extension's validator are complete. Connecting the local production
stale/error monitor to an external notification channel remains an operations
task.

## Tools and downloads

If development requires a missing tool, runtime or dependency:

- state its name, purpose, source, desired version and whether installation is
  project-local or system-wide;
- required packages and tools may be downloaded;
- obtain approval before installation or any system-state change;
- prefer official sources, verifiable packages, exact versions and
  project-local installation;
- never use unknown binaries, solutions that request secrets, or unjustified
  global installation.
