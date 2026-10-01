#!/bin/sh

set -eu

SERVICE_USER="chromium-feed"
SERVICE_GROUP="chromium-feed"
APP_DIR="/opt/chromium-build-sources"
STATE_DIR="/var/lib/chromium-build-sources"
PRIVATE_DIR="${STATE_DIR}/private"
CACHE_DIR="${STATE_DIR}/cache"
STAGING_DIR="${STATE_DIR}/staging"
PUBLISH_ROOT="/srv/chromium-build-sources"
PUBLISH_DIR="${PUBLISH_ROOT}/chromium"
RELEASES_DIR="${PUBLISH_ROOT}/releases"

if [ "$(id -u)" -ne 0 ]; then
	printf '%s\n' "This script must be run as root (for example: sudo $0)." >&2
	exit 1
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
	if getent group "${SERVICE_GROUP}" >/dev/null 2>&1; then
		adduser \
			--system \
			--ingroup "${SERVICE_GROUP}" \
			--home "${STATE_DIR}" \
			--shell /usr/sbin/nologin \
			"${SERVICE_USER}"
	else
		adduser \
			--system \
			--group \
			--home "${STATE_DIR}" \
			--shell /usr/sbin/nologin \
			"${SERVICE_USER}"
	fi
	printf '%s\n' "Created system account ${SERVICE_USER}."
elif ! getent group "${SERVICE_GROUP}" >/dev/null 2>&1; then
	printf '%s\n' \
		"User '${SERVICE_USER}' exists but group '${SERVICE_GROUP}' is missing." \
		"Refusing to modify the existing account automatically." >&2
	exit 1
fi

# Application code is deployed separately and remains administrator-owned.
install -d -o root -g root -m 0755 "${APP_DIR}"

# Runtime state and signing material are private to the feed service.
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0750 "${STATE_DIR}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0700 "${PRIVATE_DIR}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0750 "${CACHE_DIR}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0750 "${STAGING_DIR}"

# Caddy may traverse the public tree, but only the feed service may publish
# files inside the chromium directory.
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0755 "${PUBLISH_ROOT}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0755 "${RELEASES_DIR}"
if [ ! -L "${PUBLISH_DIR}" ]; then
	install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0755 "${PUBLISH_DIR}"
fi

printf '%s\n' \
	"Chromatic Feed host directories are ready:" \
	"  application: ${APP_DIR}" \
	"  state:       ${STATE_DIR}" \
	"  private key: ${PRIVATE_DIR}/feed-signing-private.pem" \
	"  published:   ${PUBLISH_DIR}"
