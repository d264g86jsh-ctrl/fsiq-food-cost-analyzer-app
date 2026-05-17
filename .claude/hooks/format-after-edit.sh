#!/bin/bash
# Hook: format-after-edit
# Runs pnpm tsc --noEmit after every Edit or Write on .ts/.tsx files.
# Exits 0 regardless — TypeScript errors are advisory; they don't block the tool call.
# CLAUDE_TOOL_INPUT_FILE_PATH is set by Claude Code when available.

FILE="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

# Only run for TypeScript files.
if [[ "$FILE" != *.ts && "$FILE" != *.tsx ]]; then
  exit 0
fi

# Find project root (directory containing package.json).
ROOT="$(cd "$(dirname "$FILE")" && while [[ ! -f package.json && "$PWD" != "/" ]]; do cd ..; done; pwd)"
if [[ ! -f "$ROOT/package.json" ]]; then
  exit 0
fi

# Resolve pnpm — try nvm-installed path first, then PATH.
NVM_NODE_DIR="$HOME/.nvm/versions/node"
if [[ -d "$NVM_NODE_DIR" ]]; then
  LATEST_NODE="$(ls "$NVM_NODE_DIR" | sort -V | tail -1)"
  export PATH="$NVM_NODE_DIR/$LATEST_NODE/bin:$PATH"
fi

if ! command -v pnpm &>/dev/null; then
  exit 0
fi

OUTPUT="$(cd "$ROOT" && pnpm tsc --noEmit 2>&1)"
ERRORS="$(echo "$OUTPUT" | grep -c "error TS" || true)"

if [[ "$ERRORS" -gt 0 ]]; then
  echo "--- tsc found $ERRORS error(s) ---"
  echo "$OUTPUT" | grep "error TS" | head -20
fi

exit 0
