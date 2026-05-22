#!/usr/bin/env bash
# Applies branch protection rules to main and develop on PromptGnome.
# Idempotent — safe to re-run.
set -euo pipefail

REPO="effyyy/PromptGnome"

apply_protection() {
  local branch="$1"
  echo "Applying protection to $branch..."

  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/$REPO/branches/$branch/protection" \
    --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Typecheck, test, build",
      "Analyze (javascript-typescript)",
      "CLA"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 2,
    "require_last_push_approval": true
  },
  "required_signatures": true,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false,
  "restrictions": null
}
EOF
}

apply_protection main
apply_protection develop || echo "develop branch does not exist yet — skipping"

echo ""
echo "Branch protection applied. Verify in:"
echo "https://github.com/$REPO/settings/branches"
