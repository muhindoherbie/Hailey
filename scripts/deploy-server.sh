#!/usr/bin/env bash
# Uploads the current commit of Hailey to the server and (re)starts it with Docker.
# Usage: HAILEY_SERVER=ubuntu@1.2.3.4 HAILEY_SSH_KEY=path/to/key scripts/deploy-server.sh
# Secrets (hailey.env, ngrok.env, .env) are kept on the server and never overwritten.
set -euo pipefail
: "${HAILEY_SERVER:?Set HAILEY_SERVER, e.g. ubuntu@152.70.173.53}"
: "${HAILEY_SSH_KEY:?Set HAILEY_SSH_KEY to the private key file}"
SSH=(ssh -i "$HAILEY_SSH_KEY" -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR "$HAILEY_SERVER")

cd "$(dirname "$0")/.."
echo "Uploading $(git rev-parse --short HEAD)…"
git archive --format=tar HEAD | "${SSH[@]}" 'mkdir -p ~/hailey-app ~/hailey-data && tar -x -C ~/hailey-app'
"${SSH[@]}" 'cd ~/hailey-app/deploy/oracle && for f in hailey.env ngrok.env .env; do test -f "$f" || { echo "Missing $f on the server"; exit 1; }; done && docker compose up -d --build && docker image prune -f >/dev/null && docker compose ps'
