#!/usr/bin/env bash
# Plan C guards for the public PromptGnome (Free) repo.
#
# Asserts that no Pro-only code, backend URL, or network call to a
# Privito-controlled host has leaked into the public Free source tree.
#
# Can be run from either the repo root or any subdirectory — it locates
# itself relative to the script file. Exits non-zero on any violation.
set -euo pipefail

# Move into the extension source root where package.json / src live.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../extension"

if [ ! -f package.json ] || [ ! -f src/shared/build-flags.ts ]; then
  echo "ERROR: expected extension/package.json and extension/src/shared/build-flags.ts"
  exit 2
fi

FAIL=0

# ── 1. PRO_BUILD must be false in the public repo ──────────────────────────
echo "=== PRO_BUILD constant ==="
if ! grep -qE 'PRO_BUILD\s*=\s*false\s+as\s+const' src/shared/build-flags.ts; then
  echo "FAIL: extension/src/shared/build-flags.ts must export PRO_BUILD = false as const"
  grep -n PRO_BUILD src/shared/build-flags.ts || true
  FAIL=1
else
  echo "OK: PRO_BUILD = false"
fi

# ── 2. No references to Privito-controlled backend hosts ───────────────────
echo ""
echo "=== Forbidden backend hosts ==="
FORBIDDEN_HOSTS='api\.promptgnome\.com|api\.privito|firebaseio\.com|firebase\.googleapis\.com|google-analytics\.com'
LEAKS=$(grep -rIn -E "$FORBIDDEN_HOSTS" src/ --include='*.ts' --include='*.tsx' || true)
if [ -n "$LEAKS" ]; then
  echo "FAIL: forbidden backend host references found:"
  echo "$LEAKS"
  FAIL=1
else
  echo "OK: no forbidden backend host references"
fi

# ── 3. No live network calls to Privito-controlled hosts ───────────────────
echo ""
echo "=== Forbidden network calls ==="
NET_CALLS=$(grep -rIn -E '\b(fetch|XMLHttpRequest|sendBeacon)\s*\(' src/ \
  --include='*.ts' --include='*.tsx' \
  | grep -E "$FORBIDDEN_HOSTS" || true)
if [ -n "$NET_CALLS" ]; then
  echo "FAIL: direct network calls to Privito backends:"
  echo "$NET_CALLS"
  FAIL=1
else
  echo "OK: no direct network calls to Privito backends"
fi

# ── 4. Pro modules must not exist in the public tree ───────────────────────
echo ""
echo "=== Pro module presence ==="
PRO_FILES=(
  src/services/license-manager.ts
  src/services/jwt-manager.ts
  src/services/analytics.ts
  src/services/telemetry-sync.ts
  src/services/telemetry-aggregator.ts
  src/services/telemetry-buffer.ts
  src/services/telemetry-nudge.ts
  src/services/feedback-collector.ts
  src/services/ner-client.ts
  src/services/ocr-client.ts
  src/services/config-signature.ts
  src/services/detection-config.ts
  src/highlighting/feedback-queue.ts
  src/shared/telemetry-schemas.ts
  src/components/NerConsentToggle.tsx
  src/components/OcrConsentToggle.tsx
  src/components/RestorePurchaseModal.tsx
  src/components/SubscriptionStatus.tsx
  src/popup/components/ProUpgradeCard.tsx
  src/sidepanel/TelemetryTransparency.tsx
  src/onboarding/TelemetryConsent.tsx
  src/contents/file-interceptor.ts
  src/background/pro-backend-handlers.ts
)
LEAKED_PRO=0
for f in "${PRO_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "FAIL: Pro file present in public tree: $f"
    LEAKED_PRO=1
  fi
done
if [ "$LEAKED_PRO" -eq 1 ]; then
  FAIL=1
else
  echo "OK: no Pro modules present"
fi

# ── 5. schemas.ts must not contain the PRO marker block ────────────────────
echo ""
echo "=== schemas.ts PRO marker ==="
if grep -q "PRO-ONLY FIELDS" src/shared/schemas.ts; then
  echo "FAIL: extension/src/shared/schemas.ts still contains the PRO-ONLY marker block"
  FAIL=1
else
  echo "OK: schemas.ts is Free-only"
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "=== Free-build guards FAILED ==="
  exit 1
fi
echo "=== Free-build guards PASSED ==="
