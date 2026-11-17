#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/frontend"
[ -d node_modules ] || npm install
[ -f dist/index.html ] || npm run build
( sleep 1; (xdg-open http://localhost:5173 || open http://localhost:5173) >/dev/null 2>&1 || true ) &
node serve.mjs 5173
