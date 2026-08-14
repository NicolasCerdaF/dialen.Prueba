#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Dialen TanStack Start app.
set -euo pipefail

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Bun is the project's package manager (bun.lock + bunfig.toml). Install it once;
# on snapshot/cached boots it is already present.
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi

# Install dependencies exactly as pinned by bun.lock.
bun install --frozen-lockfile
