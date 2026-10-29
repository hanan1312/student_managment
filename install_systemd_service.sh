#!/bin/bash
#
# Installs this app as two systemd services (API + client), the way it's run on a
# persistent server instead of manually running each side in its own terminal — systemd's
# Restart=always brings a crashed process back on its own, and both units are enabled to
# start on boot, so the app survives both a crash and a reboot with no manual step
# afterward.
#
# This is two independent Node processes, not one:
#   - server: Express API (tsx watch src/index.ts), port $API_PORT, own sqlite db file
#   - client: Vite dev server, port $CLIENT_PORT
# (Pairs with client/vite.config.ts's `server: { host: true, allowedHosts: true }` — that
# makes the dev server reachable from outside localhost at all — and with
# client/src/lib/api.ts deriving the API URL from the page's own hostname instead of a
# hardcoded "localhost", so it works from any machine that can reach this server, not just
# from a browser running on the server itself.)
#
# Like the reference this was adapted from, the user/path/node interpreter below are all
# detected from the environment this script actually runs in, not hardcoded — so copying
# this repo to a new path or a new machine doesn't leave stale paths behind. Runs the same
# dev servers as `npm run dev` in each of client/ and server/ (invoking tsx/vite directly
# rather than through npm — see the ExecStart comment below for why), not a production
# build.
#
# Usage:
#   sudo ./install_systemd_service.sh
#
# Must be run with sudo (writes to /etc/systemd/system and /var/log). Safe to re-run any
# time the repo path or Node version changes — it won't overwrite an existing server/.env,
# so re-running never resets your admin password or JWT secret.

set -eo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: run this with sudo (it writes to /etc/systemd/system and /var/log)." >&2
    echo "  sudo $0" >&2
    exit 1
fi

# The real (non-root) user and repo path, even under sudo — SUDO_USER/pwd, not root's.
APP_USER="${SUDO_USER:-$(logname 2>/dev/null || whoami)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT=4000
CLIENT_PORT=5173
LOG_DIR="/var/log/app_school"

# Resolve node/npm as the target user would see them (nvm installs are per-user and not on
# root's PATH), so the unit files get absolute paths systemd can actually exec — systemd
# services don't source .bashrc/.profile, so relying on PATH at runtime wouldn't work even
# if this script's own PATH happens to resolve it.
#
# Source nvm.sh directly rather than going through a login shell (bash -lc): nvm's installer
# appends its init lines to ~/.bashrc, which only runs for *interactive* shells — a
# non-interactive login shell skips them.
NODE_BIN="$(sudo -u "$APP_USER" bash -c '
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    command -v node
' 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
    echo "ERROR: couldn't resolve 'node' for user $APP_USER (checked via their login shell, e.g. nvm)." >&2
    echo "Make sure Node is installed for that user, then re-run." >&2
    exit 1
fi
# npm ships next to node in the same bin directory for every install method this project
# supports (nvm, system package, nodesource) — cheaper and just as reliable as a second
# nvm-sourcing subshell to look it up separately.
NODE_DIR="$(dirname "$NODE_BIN")"
NPM_BIN="$NODE_DIR/npm"
if [ ! -x "$NPM_BIN" ]; then
    echo "ERROR: found node at $NODE_BIN but no npm alongside it at $NPM_BIN." >&2
    exit 1
fi

# server/'s better-sqlite3 is a native addon. When no prebuilt binary matches this machine
# (seen on some arm64 hosts, e.g. Oracle Cloud's Ampere instances) npm install compiles it
# from source, which needs a C++20-capable compiler — but the g++ that ships by default on
# some Ubuntu base images (g++-9) is too old and fails with "unrecognized command line
# option '-std=c++20'". Find the newest g++ already on the box that actually accepts
# -std=c++20; if none does, install one via apt rather than letting the build fail partway
# through (only for the server's install below — the client has no native deps).
find_good_gxx() {
    for candidate in $(ls -1 /usr/bin/g++-* 2>/dev/null | sort -Vr) $(command -v g++ 2>/dev/null); do
        if echo 'int main(){}' | "$candidate" -std=c++20 -x c++ -o /dev/null - 2>/dev/null; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

SERVER_CXX="$(find_good_gxx || true)"
if [ -z "$SERVER_CXX" ]; then
    echo "--> No C++20-capable compiler found, installing a newer g++ via apt..."
    # Not `-qq`: that also swallows *error* output, which previously made a failed `apt-get
    # update` (e.g. an unreachable/misconfigured repo) kill this script via `set -e` with no
    # visible reason at all. Capture output ourselves instead so a failure is diagnosable.
    if ! APT_UPDATE_OUT="$(apt-get update 2>&1)"; then
        echo "ERROR: apt-get update failed:" >&2
        echo "$APT_UPDATE_OUT" >&2
        exit 1
    fi
    LAST_APT_ERR=""
    for v in 13 12 11 10; do
        if APT_INSTALL_OUT="$(apt-get install -y "g++-$v" 2>&1)"; then
            SERVER_CXX="$(command -v "g++-$v")"
            break
        else
            LAST_APT_ERR="$APT_INSTALL_OUT"
        fi
    done
fi
if [ -z "$SERVER_CXX" ]; then
    echo "ERROR: couldn't find or install a C++20-capable g++ (needed to build server's native sqlite addon)." >&2
    if [ -n "${LAST_APT_ERR:-}" ]; then
        echo "Last apt-get install attempt failed with:" >&2
        echo "$LAST_APT_ERR" >&2
    fi
    echo "Install one manually (e.g. sudo apt install g++-12 - enabling the 'universe' repo first if that's not found) and re-run." >&2
    exit 1
fi
SERVER_CC="${SERVER_CXX/g++/gcc}"
echo "--> Using $SERVER_CXX to build server's native modules"

# Always run install (not just when node_modules is entirely absent) — this script is meant
# to be re-run after every `git pull`, and npm install is a fast no-op when nothing changed
# but silently leaves new dependencies missing if we only installed on a from-scratch clone.
#
# npm's own launcher starts with `#!/usr/bin/env node`, so running it needs `node` on PATH
# at exec time — but the target user's ambient PATH (under plain `sudo -u`) doesn't include
# a per-user nvm install the way the login shell used above to detect NODE_BIN did. Prepend
# NODE_DIR explicitly so `env node` resolves instead of failing with "No such file or directory".
echo "--> Installing dependencies in $SCRIPT_DIR/server (as $APP_USER)..."
sudo -u "$APP_USER" env "PATH=$NODE_DIR:$PATH" CXX="$SERVER_CXX" CC="$SERVER_CC" "$NPM_BIN" install --prefix "$SCRIPT_DIR/server"

echo "--> Installing dependencies in $SCRIPT_DIR/client (as $APP_USER)..."
sudo -u "$APP_USER" env "PATH=$NODE_DIR:$PATH" "$NPM_BIN" install --prefix "$SCRIPT_DIR/client"

# server/.env is gitignored (it holds JWT_SECRET), so a fresh clone never has one. Create it
# from the checked-in template with a freshly generated secret — but only if it's missing, so
# re-running this script never rotates an existing deployment's secret out from under
# already-issued logins.
if [ ! -f "$SCRIPT_DIR/server/.env" ]; then
    echo "--> server/.env missing, creating one from .env.example with a random JWT secret..."
    JWT_SECRET="$(openssl rand -hex 32)"
    sed "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$SCRIPT_DIR/server/.env.example" > "$SCRIPT_DIR/server/.env"
    chown "$APP_USER":"$APP_USER" "$SCRIPT_DIR/server/.env"
fi

# server/master-account.json (also gitignored) is created by the server itself on first boot
# from server/master-account.example.json's defaults if it doesn't exist yet — same
# don't-touch-it-if-present idempotency, handled in src/masterAccount.ts rather than here
# since it needs to happen the same way for a plain `npm run dev` too, not just this script.
if [ ! -f "$SCRIPT_DIR/server/master-account.json" ]; then
    echo "    First boot will create server/master-account.json with username 'master' / password 'change-me'."
    echo "    Edit that file to set a real password, then: sudo systemctl restart app_school_api"
fi

echo "========================================"
echo " Installing systemd services"
echo "========================================"
echo "  App directory: $SCRIPT_DIR"
echo "  Running as:    $APP_USER"
echo "  Node:          $NODE_BIN"
echo "  Logs:          $LOG_DIR"
echo "  API port:      $API_PORT"
echo "  Client port:   $CLIENT_PORT"
echo "========================================"

mkdir -p "$LOG_DIR"
chown "$APP_USER":"$APP_USER" "$LOG_DIR"

# If a manually-run `npm run dev` (or an earlier ad-hoc process) is still holding one of
# these ports, starting the systemd unit would just crash-loop against "port already in
# use" instead of taking over — same class of problem as two process managers fighting over
# one port. Stop the systemd units first (if this is a re-run), then clear anything else
# still bound to each port, so systemd ends up the sole owner.
for ENTRY in "app_school_api:$API_PORT" "app_school_client:$CLIENT_PORT"; do
    SVC="${ENTRY%%:*}"
    PORT="${ENTRY##*:}"
    systemctl stop "$SVC.service" 2>/dev/null || true
    STRAY_PID="$(lsof -ti:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$STRAY_PID" ]; then
        echo "--> Killing process already listening on port $PORT (PID $STRAY_PID) so systemd can take it over"
        kill $STRAY_PID 2>/dev/null || true
        sleep 1
    fi
done

cat > /etc/systemd/system/app_school_api.service <<EOF
[Unit]
Description=App School - API Server
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$SCRIPT_DIR/server
# Invoke node directly on tsx's own entry file rather than going through \`npm run dev\`:
# npm's executable is itself a shebang script ("#!/usr/bin/env node"), and systemd's bare
# default PATH doesn't include node's directory — so \`env node\` fails with "not found" and
# the unit crash-loops silently (RestartSec=5, forever) without ever binding the port.
# Calling node directly on tsx's CLI file sidesteps shebang resolution entirely.
Environment=PATH=$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$NODE_BIN $SCRIPT_DIR/server/node_modules/.bin/tsx watch src/index.ts
Restart=always
RestartSec=5

StandardOutput=append:$LOG_DIR/api_out.log
StandardError=append:$LOG_DIR/api_err.log

[Install]
WantedBy=multi-user.target
EOF
echo "--> Wrote /etc/systemd/system/app_school_api.service"

cat > /etc/systemd/system/app_school_client.service <<EOF
[Unit]
Description=App School - Client (Vite Dev Server)
After=network.target app_school_api.service
Wants=app_school_api.service

[Service]
User=$APP_USER
WorkingDirectory=$SCRIPT_DIR/client
# Same direct-node invocation as the API unit, and for the same reason — sidesteps vite's
# own shebang so it doesn't depend on node being on systemd's default PATH.
Environment=PATH=$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$NODE_BIN $SCRIPT_DIR/client/node_modules/.bin/vite --port $CLIENT_PORT
Restart=always
RestartSec=5

StandardOutput=append:$LOG_DIR/client_out.log
StandardError=append:$LOG_DIR/client_err.log

[Install]
WantedBy=multi-user.target
EOF
echo "--> Wrote /etc/systemd/system/app_school_client.service"

# Without this, the *_out.log/*_err.log files grow forever — StandardOutput=append: has no
# built-in size cap (unlike journald), and Vite's own request/HMR logging is enough to fill
# a disk over weeks/months.
#
# copytruncate (not the default create/rename strategy) is required here specifically
# because each service holds its log file open for its entire lifetime (StandardOutput=append:,
# not journald) — a rename-based rotation would leave it writing forever into the old,
# now-unlisted file while logrotate's newly-created file stays empty. copytruncate copies the
# current content out, then truncates the original in place, so the already-open file
# descriptor keeps writing to the same inode.
cat > /etc/logrotate.d/app_school <<EOF
$LOG_DIR/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
echo "--> Wrote /etc/logrotate.d/app_school (daily rotation, 14 days retained, compressed)"

systemctl daemon-reload
systemctl enable app_school_api.service app_school_client.service
systemctl restart app_school_api.service app_school_client.service

# Confirm each server is actually answering, not just that `systemctl restart` returned — a
# crash-looping unit still makes `restart` exit 0 immediately, so this is the only real
# proof it worked. First compile/boot can take a few seconds, so poll instead of a single
# check.
check_up() {
    local url="$1"
    for _ in $(seq 1 15); do
        if curl -sf "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

echo "--> Waiting for the API to answer on port $API_PORT..."
API_UP=0
check_up "http://localhost:$API_PORT/api/health" && API_UP=1

echo "--> Waiting for the client to answer on port $CLIENT_PORT..."
CLIENT_UP=0
check_up "http://localhost:$CLIENT_PORT" && CLIENT_UP=1

if [ "$API_UP" -ne 1 ] || [ "$CLIENT_UP" -ne 1 ]; then
    echo "========================================" >&2
    echo " ERROR: services installed, but something isn't answering:" >&2
    [ "$API_UP" -ne 1 ] && echo "   - API (port $API_PORT) is not responding" >&2
    [ "$CLIENT_UP" -ne 1 ] && echo "   - Client (port $CLIENT_PORT) is not responding" >&2
    echo " It's likely crash-looping — recent log output:" >&2
    echo "========================================" >&2
    [ "$API_UP" -ne 1 ] && { journalctl -u app_school_api.service --no-pager -n 30 >&2; tail -n 30 "$LOG_DIR/api_err.log" 2>/dev/null >&2; }
    [ "$CLIENT_UP" -ne 1 ] && { journalctl -u app_school_client.service --no-pager -n 30 >&2; tail -n 30 "$LOG_DIR/client_err.log" 2>/dev/null >&2; }
    echo "========================================" >&2
    echo " Full status: systemctl status app_school_api.service app_school_client.service" >&2
    exit 1
fi

echo "========================================"
echo " Done. Open the app at: http://$(hostname -I | awk '{print $1}'):$CLIENT_PORT"
echo " Both services will:"
echo "   - restart automatically if they crash (Restart=always)"
echo "   - start automatically on boot (systemctl enable)"
echo "   - have their logs rotated daily, 14 days kept (see /etc/logrotate.d/app_school)"
echo "========================================"
echo "Check status:  systemctl status app_school_api.service app_school_client.service"
echo "Watch logs:    tail -f $LOG_DIR/api_out.log $LOG_DIR/client_out.log"
echo "Restart:       sudo systemctl restart app_school_api.service app_school_client.service"
echo "Test log rotation config: sudo logrotate -d /etc/logrotate.d/app_school"
