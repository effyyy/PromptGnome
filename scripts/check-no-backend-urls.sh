#!/usr/bin/env bash
# Fails the build if any source file under extension/ contains a reference
# to a Privito-controlled backend URL or key. This is the last line of
# defense against accidentally shipping Pro code into the public extension.
set -euo pipefail

FORBIDDEN_PATTERNS=(
  'api\.promptgnome\.com'
  'api\.privito'
  'firebaseio\.com'
  'firebase\.googleapis\.com'
  'identitytoolkit\.googleapis\.com'
  'google-analytics\.com'
  'googletagmanager\.com'
  'measurement_id'
  'GA_MEASUREMENT'
  'extensionpay\.com'
  'Bearer [A-Za-z0-9_\-]{20,}'
  'sk_live_[A-Za-z0-9]{20,}'
  'sk_test_[A-Za-z0-9]{20,}'
  'AIza[0-9A-Za-z_\-]{35}'
)

EXIT=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  matches=$(grep -rEn "$pattern" extension/src extension/tests 2>/dev/null \
    | grep -v "tests/fixtures" \
    | grep -v "// CHECK-NO-BACKEND-URLS-OK" || true)
  if [ -n "$matches" ]; then
    echo "FORBIDDEN PATTERN FOUND: $pattern"
    echo "$matches"
    echo ""
    EXIT=1
  fi
done

if [ "$EXIT" -ne 0 ]; then
  echo ""
  echo "Pre-publish guard FAILED. The patterns above must not appear in"
  echo "the public extension source. If a match is a legitimate test"
  echo "fixture, move it under tests/fixtures/. If it is intentional in"
  echo "production code (rare), append the comment marker"
  echo "// CHECK-NO-BACKEND-URLS-OK with a reason."
  exit 1
fi

echo "Pre-publish guard PASSED — no backend URLs found in extension source."
