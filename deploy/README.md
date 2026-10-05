# Production deployment

The production host is Debian 13 with Caddy. Chromatic Feed runs as the
non-login `chromium-feed` system account and uses the system-wide,
APT-managed Node.js 24 LTS installation from NodeSource at `/usr/bin/node`.
A separate interactive user's NVM installation is not part of the service
runtime. The application requires Node.js 24.11.0 or newer and also enforces
that minimum at runtime.

The `chromium-feed` account, `chromium-build-sources` systemd unit names and
the `/opt`, `/var/lib` and `/srv/chromium-build-sources` paths are retained as
stable operational identifiers after the project was renamed to Chromatic
Feed. Keeping them avoids a risky production migration and preserves the
existing public feed endpoint; new deployments intentionally use the same
identifiers.

## Layout

```text
/opt/chromium-build-sources/                         application (root-owned)
/var/lib/chromium-build-sources/private/             signing material (0700)
/var/lib/chromium-build-sources/cache/               reserved runtime cache
/var/lib/chromium-build-sources/staging/             private generation area
/srv/chromium-build-sources/releases/                immutable feed releases
/srv/chromium-build-sources/chromium                 active release symlink
```

The private key must be installed as:

```text
/var/lib/chromium-build-sources/private/feed-signing-private.pem
```

with owner `chromium-feed:chromium-feed` and mode `0600`.

## Initial preparation

Initialize or reconcile the system account and directories:

```sh
sudo sh ./deploy/setup-host.sh
```

If absent, the setup script creates the `chromium-feed` system user and group
with `/usr/sbin/nologin`. It refuses to alter an inconsistent existing account
and never creates, copies or replaces a signing key.

The first deployment must convert the existing public `chromium` directory
into a release symlink:

```sh
sudo sh ./deploy/migrate-publish-layout.sh
```

The migration preserves the currently served feed as a bootstrap release. Once
the active path is a symlink, every later activation is one atomic rename.

## Application updates

Build the deployment archive from a reviewed Git commit, transfer it to the
host, and verify its SHA-256 digest before extraction. Never include a working
tree, `.secrets`, `AI_CONTEXT.md` or private key material. The repository
attributes force Unix line endings for Linux runtime and unit files, including
archives created from Windows checkouts.

Stop both timers before replacing application code and allow any running
oneshot service to finish. Extract the archive into a new root-owned sibling of
`/opt/chromium-build-sources`, then run the runtime check, test suite and feed
monitor from that staged directory as `chromium-feed`. Do not replace the live
directory if any staged check fails.

Move the current application directory to a uniquely named rollback directory,
move the staged directory into `/opt/chromium-build-sources`, reinstall the
tracked systemd units and run `systemctl daemon-reload`. Then manually run the
publisher and health services, verify the public HTTPS feed, detached signature
and ETag response, and only then start the timers again.

Keep the rollback directory through at least one successful scheduled publisher
and health run. A rollback follows the same stopped-timer procedure: preserve
the failed deployment under a separate name, restore the previous application
directory and units, run the health service, then restart the timers. Runtime
state, signing keys and published feed releases remain outside the application
directory and must never be moved as part of an application update.

## Manual publication

Run a complete generation, signature verification and atomic activation as the
service account:

```sh
sudo -u chromium-feed \
  /bin/sh /opt/chromium-build-sources/deploy/publish-feed.sh
```

Generation takes place under the private staging directory. The publisher
seeds it with the currently verified feed, runs the real generator, verifies
the resulting JSON and detached signature, copies both files into one immutable
release directory, and only then atomically switches the active symlink.
Failures before activation leave the public feed unchanged.

## Signing-key rotation

The active signer has a maximum 12-month signing lifetime from first production
use, not one extension release. For a planned rotation, publish a bridging
extension that trusts the outgoing and incoming public keys at the start of a
30-day migration window before changing the production signer. End dual trust
at the cutover through a tested client expiry, and remove the outgoing key in
a follow-up release. Retire clients that never received the incoming key. See
`INTEGRATION.md` for the current key's deadline and the compromise exception.
Do not use this planned procedure or a
grace period if either private key is suspected compromised.

Deploy the reviewed application revision that promotes the incoming public key
to `keys/feed-public-key.json` and retains the outgoing versioned public key.

Stop both timers and wait for any running publisher to finish before replacing
either application code or signing material. Install the incoming private key
under a temporary root-owned path, set its final owner to
`chromium-feed:chromium-feed` and mode to `0600`, and derive its public JWK as
the service user. Do not replace the active key unless those coordinates match
the promoted canonical public key.

Back up the outgoing private key on the host, atomically install the validated
incoming key at the stable private-key path, and run one manual publication.
Confirm that the public detached signature contains the incoming key ID, run
the local health service, and verify the public HTTPS feed before restarting
the timers. Keep the outgoing key backup and the previous application directory
until at least one scheduled publisher and health run have succeeded, then
remove the outgoing private key from the host; preserve only an offline backup
if recovery policy requires it. Only one private key may be active at a time.

## systemd

After a successful manual publication, install the units:

```sh
sudo install -o root -g root -m 0644 \
  /opt/chromium-build-sources/deploy/chromium-build-sources.service \
  /etc/systemd/system/chromium-build-sources.service

sudo install -o root -g root -m 0644 \
  /opt/chromium-build-sources/deploy/chromium-build-sources.timer \
  /etc/systemd/system/chromium-build-sources.timer

sudo systemctl daemon-reload
sudo systemctl enable --now chromium-build-sources.timer
```

The timer runs hourly with up to five minutes of randomized delay. A persistent
timer runs a missed update after the host starts again.

Useful checks:

```sh
systemctl list-timers chromium-build-sources.timer
sudo systemctl start chromium-build-sources.service
sudo systemctl status chromium-build-sources.service
sudo journalctl -u chromium-build-sources.service
```

Do not enable the timer until the manual production run, public HTTPS response
and detached signature have all been verified.

## Local health monitoring

The health service verifies the active feed, detached signature and full schema
without network or private-key access. It fails when `generatedAt` is more than
three hours old, allowing a temporary missed hourly generation while detecting
a persistent outage.

Install and test the monitor:

```sh
sudo install -o root -g root -m 0644 \
  /opt/chromium-build-sources/deploy/chromium-build-sources-health.service \
  /etc/systemd/system/chromium-build-sources-health.service

sudo install -o root -g root -m 0644 \
  /opt/chromium-build-sources/deploy/chromium-build-sources-health.timer \
  /etc/systemd/system/chromium-build-sources-health.timer

sudo systemctl daemon-reload
sudo systemctl start chromium-build-sources-health.service
sudo systemctl status chromium-build-sources-health.service
sudo journalctl -u chromium-build-sources-health.service
```

After a successful manual check:

```sh
sudo systemctl enable --now chromium-build-sources-health.timer
systemctl list-timers chromium-build-sources-health.timer
```

The monitor runs every 15 minutes with up to one minute of randomized delay.
Failures are recorded in the journal and visible through `systemctl --failed`.
External notification delivery remains a separate deployment decision because
it requires an approved e-mail, webhook or monitoring destination.
