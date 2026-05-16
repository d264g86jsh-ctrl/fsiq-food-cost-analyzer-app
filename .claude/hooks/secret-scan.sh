#!/bin/bash
# Hook: secret-scan
# Placeholder — scan edited files for accidental secrets before commit.
# TODO: integrate a secret scanner (e.g. gitleaks, trufflehog) when desired.
# Never scan .env.local — it is gitignored and should never be committed.
exit 0
