#!/bin/bash
# Hook: docs-change-reminder (PostToolUse: Edit|Write)
# Warns when files in core behavior directories are edited, so docs stay in sync.
# This is advisory — exits 0 and does not block the tool call.

FILE="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

if [[ -z "$FILE" ]]; then
  exit 0
fi

# Core directories whose changes may require doc updates.
CORE_DIRS=(
  "src/lib/qualification/"
  "src/lib/website/"
  "src/lib/ai/"
  "src/lib/pdf/"
  "src/lib/crm/"
  "src/lib/meta/"
)

for DIR in "${CORE_DIRS[@]}"; do
  if echo "$FILE" | grep -q "$DIR"; then
    echo "REMINDER: You edited a core behavior file ($FILE)."
    echo "  Check whether any of these docs need updating:"
    echo "    docs/savings-formula.md   — if qualification/savings math changed"
    echo "    docs/website-validation-spec.md — if validation logic changed"
    echo "    docs/architecture.md      — if request flow or integration changed"
    echo "    docs/build-phases.md      — if a phase was completed"
    echo "    docs/qa-checklist.md      — if new test cases are needed"
    echo "  No behavioral changes without explicit user approval."
    break
  fi
done

exit 0
