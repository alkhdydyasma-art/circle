#!/usr/bin/env bash
# Classifies a verified automatic fix for the founder's review. Always run from the base
# branch's copy (the workflow does), so a fix can't rewrite its own classification.
# Prints "low-risk" or "sensitive: <reason>". Every fix still waits for a human merge.
set -euo pipefail

files="$( (git diff --name-only HEAD; git ls-files --others --exclude-standard) | sort -u)"
[ -n "$files" ] || { echo "sensitive: empty change"; exit 0; }

# Security, database schema and data access, patient data (PDPL), money, the AI assistant,
# messaging, deployment, CI and dependencies are always flagged as sensitive.
PROTECTED='^(supabase/|src/lib/|src/proxy\.ts|src/app/auth/|src/app/actions/|src/app/api/|src/app/\[lang\]/portal/|src/app/\[lang\]/a/|deploy/|\.github/|n8n/|package(-lock)?\.json|next\.config|Dockerfile|\.env)'
hit="$(printf '%s\n' "$files" | grep -E "$PROTECTED" | head -3 | paste -sd, - || true)"
[ -z "$hit" ] || { echo "sensitive: protected area ($hit)"; exit 0; }

changed_tests="$(git diff --name-only --diff-filter=MD HEAD -- tests | paste -sd, - || true)"
[ -z "$changed_tests" ] || { echo "sensitive: existing tests changed ($changed_tests)"; exit 0; }

added="$(git diff -U0 HEAD | grep -E '^\+[^+]' || true; git ls-files --others --exclude-standard -z | xargs -0 -r cat)"
if printf '%s' "$added" | grep -qE 'createServiceClient|service_role|SERVICE_ROLE|process\.env|dangerouslySetInnerHTML|eval\(|new Function|fetch\(|https?://|\.rpc\('; then
  echo "sensitive: adds privileged, secret, network or raw-HTML code"; exit 0
fi

n_files="$(printf '%s\n' "$files" | wc -l)"
n_lines="$(git diff --numstat HEAD | awk '{s += $1 + $2} END {print s + 0}')"
[ "$n_files" -le 10 ] && [ "$n_lines" -le 300 ] || { echo "sensitive: large change ($n_files files, $n_lines lines)"; exit 0; }

echo low-risk
