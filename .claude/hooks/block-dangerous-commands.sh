#!/bin/bash
# Hook: block-dangerous-commands (PreToolUse: Bash)
# Blocks destructive commands before they execute.
# CLAUDE_TOOL_INPUT_COMMAND contains the command string from the Bash tool.
# Exit 2 = block + show message. Exit 0 = allow.

CMD="${CLAUDE_TOOL_INPUT_COMMAND:-}"

# Block force-push to main/master.
if echo "$CMD" | grep -qE "git push.*(--force|-f).*(origin)?.*(main|master)"; then
  echo "BLOCKED: Force-push to main/master is not allowed."
  echo "  If you need to force-push, the user must run this command manually."
  exit 2
fi

# Block hard reset (irreversible local state destruction).
if echo "$CMD" | grep -qE "git reset --hard"; then
  echo "BLOCKED: git reset --hard requires explicit user confirmation."
  echo "  Ask the user to run this command manually if they want to proceed."
  exit 2
fi

# Block recursive delete of filesystem root or home.
if echo "$CMD" | grep -qE "rm -rf /($|tmp$| |~)"; then
  echo "BLOCKED: rm -rf / or rm -rf ~ is not allowed."
  exit 2
fi

# Block committing .env.local.
if echo "$CMD" | grep -qE "git (add|commit).*.env\.local"; then
  echo "BLOCKED: .env.local must not be committed."
  echo "  It is gitignored. Never commit real credentials."
  exit 2
fi

# Block SQL DROP TABLE / DROP DATABASE without user confirmation.
if echo "$CMD" | grep -qiE "DROP TABLE|DROP DATABASE|TRUNCATE TABLE"; then
  echo "BLOCKED: Destructive SQL commands require explicit user confirmation."
  echo "  If you need to run this, ask the user to execute it directly."
  exit 2
fi

exit 0
