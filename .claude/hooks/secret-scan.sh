#!/bin/bash
# Hook: secret-scan
# Scans the edited file for common secret patterns after every Edit/Write.
# Exits 0 (advisory only) — prints a warning but does not block the tool call.
# .env.local is gitignored and should never be committed; skip it here.

FILE="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

# Skip if no file context, or file is a .env.local or test file.
if [[ -z "$FILE" || "$FILE" == *".env.local"* || "$FILE" == *".test."* ]]; then
  exit 0
fi

# Skip binary files.
if ! file "$FILE" 2>/dev/null | grep -qE "text|script"; then
  exit 0
fi

# Patterns that suggest real secrets (not placeholders).
PATTERNS=(
  'sk-[A-Za-z0-9]{20,}'       # Anthropic / OpenAI / Stripe secret keys
  'eyJ[A-Za-z0-9_-]{40,}'     # JWT tokens (base64url header)
  'Bearer [A-Za-z0-9_\-\.]{40,}' # Long Bearer tokens
  'ghp_[A-Za-z0-9]{36}'       # GitHub personal access tokens
  'xoxb-[0-9]+-[A-Za-z0-9]+' # Slack bot tokens
)

FOUND=0
for PATTERN in "${PATTERNS[@]}"; do
  if grep -qE "$PATTERN" "$FILE" 2>/dev/null; then
    echo "WARNING: Possible secret pattern '$PATTERN' found in $FILE"
    echo "  Verify this is not a real credential before committing."
    FOUND=1
  fi
done

if [[ "$FOUND" -eq 1 ]]; then
  echo "  If this is a real secret, remove it. Never commit real API keys or tokens."
fi

exit 0
