#!/bin/bash
# Hook: stop-reminder (Stop event)
# Prints a session-end checklist reminder before Claude Code exits.
# This is advisory — exits 0.

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo ""
echo "=== Session End Checklist ==="

# Show uncommitted changes.
CHANGED="$(git -C "$PROJECT_ROOT" status --short 2>/dev/null)"
if [[ -n "$CHANGED" ]]; then
  echo ""
  echo "Uncommitted changes:"
  echo "$CHANGED"
else
  echo "Working tree: clean"
fi

# Remind about checks.
echo ""
echo "Before committing, run:"
echo "  pnpm tsc --noEmit && pnpm lint && pnpm test"
echo ""
echo "Never commit:"
echo "  .env.local | real API keys | tokens | .env.*.local files"
echo ""
echo "Phase guardrails:"
echo "  Do not change: validation logic, savings math, AI prompts,"
echo "  PDFMonkey behavior, GHL handoff rules, Meta tracking, Prisma schema"
echo "  without explicit user approval."
echo ""

exit 0
