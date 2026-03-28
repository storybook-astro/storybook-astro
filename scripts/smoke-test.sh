#!/usr/bin/env bash
# smoke-test.sh — Pre-release smoke test for @storybook-astro packages
#
# Usage:
#   bash scripts/smoke-test.sh [astro-version] [scenario]
#
#   astro-version : 5 | 6 | both  (default: both)
#   scenario      : fresh | upgrade | both  (default: fresh)
#
# Examples:
#   bash scripts/smoke-test.sh          # both versions, fresh install
#   bash scripts/smoke-test.sh 6 fresh  # astro 6 only, fresh install
#   bash scripts/smoke-test.sh both upgrade
#
# The upgrade scenario installs the current @latest from npm first,
# verifies it works, then upgrades to the local tarball and verifies again.
# It requires the packages to already be published on npm (use after a beta publish).

set -euo pipefail

ASTRO_VERSION="${1:-both}"
SCENARIO="${2:-fresh}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="$(mktemp -d /tmp/sb-smoke-XXXXXX)"
FRAMEWORK_TGZ=""
RENDERER_TGZ=""

# ── Helpers ────────────────────────────────────────────────────────────────────
# timeout(1) is GNU coreutils — not available on macOS without brew install coreutils.
# Run with a timeout on Linux CI; fall back to a plain run locally.
run_with_timeout() {
  local secs="$1"; shift
  if command -v timeout &>/dev/null; then
    timeout "$secs" "$@"
  else
    "$@"
  fi
}

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
log()  { echo -e "${CYAN}→${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
fail() { echo -e "${RED}✗${RESET} $*" >&2; }
header() { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }

# ── Cleanup ────────────────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    fail "Smoke test failed — working directory preserved at: $WORK_ROOT"
  else
    rm -rf "$WORK_ROOT"
  fi
}
trap cleanup EXIT

# ── Step 1: Build ──────────────────────────────────────────────────────────────
build_packages() {
  header "Building packages"
  cd "$REPO_ROOT"
  log "Running yarn build:packages..."
  yarn build:packages
  ok "Build complete"
}

# ── Step 2: Validate dist ──────────────────────────────────────────────────────
validate_dist() {
  header "Validating dist against publishConfig.exports"
  cd "$REPO_ROOT"
  node scripts/validate-dist.js
}

# ── Step 3: Pack ───────────────────────────────────────────────────────────────
pack_packages() {
  header "Packing packages"
  RENDERER_TGZ="$WORK_ROOT/renderer.tgz"
  FRAMEWORK_TGZ="$WORK_ROOT/framework.tgz"

  log "Packing renderer..."
  yarn workspace @storybook-astro/renderer pack --out "$RENDERER_TGZ"

  log "Packing framework..."
  yarn workspace @storybook-astro/framework pack --out "$FRAMEWORK_TGZ"

  ok "Tarballs written to $WORK_ROOT"
}

# ── Scenario: fresh install ────────────────────────────────────────────────────
run_fresh() {
  local astro_ver="$1"
  local work_dir="$WORK_ROOT/fresh-astro${astro_ver}"

  header "Fresh install / Astro $astro_ver"
  mkdir -p "$work_dir"

  log "Copying template files..."
  cp -r "$REPO_ROOT/smoke/templates/common/." "$work_dir/"
  cp -r "$REPO_ROOT/smoke/templates/astro${astro_ver}/." "$work_dir/"

  log "Generating package.json from template..."
  sed \
    -e "s|__FRAMEWORK_TGZ__|$FRAMEWORK_TGZ|g" \
    -e "s|__RENDERER_TGZ__|$RENDERER_TGZ|g" \
    "$work_dir/package.json.tmpl" > "$work_dir/package.json"
  rm "$work_dir/package.json.tmpl"

  log "Installing dependencies..."
  cd "$work_dir"
  npm install --legacy-peer-deps --no-package-lock --silent

  log "Running storybook build..."
  run_with_timeout 180 ./node_modules/.bin/storybook build --quiet \
    || { fail "storybook build failed or timed out"; exit 1; }

  log "Running component tests..."
  ./node_modules/.bin/vitest run

  ok "Fresh install / Astro $astro_ver passed"
}

# ── Scenario: upgrade from npm latest ─────────────────────────────────────────
run_upgrade() {
  local astro_ver="$1"
  local work_dir="$WORK_ROOT/upgrade-astro${astro_ver}"

  header "Upgrade from @latest / Astro $astro_ver"
  mkdir -p "$work_dir"

  log "Copying template files..."
  cp -r "$REPO_ROOT/smoke/templates/common/." "$work_dir/"
  cp -r "$REPO_ROOT/smoke/templates/astro${astro_ver}/." "$work_dir/"

  # Phase 1: install from npm @latest
  log "Generating package.json (npm @latest)..."
  sed \
    -e "s|file:__FRAMEWORK_TGZ__|@storybook-astro/framework@latest|g" \
    -e "s|file:__RENDERER_TGZ__|@storybook-astro/renderer@latest|g" \
    "$work_dir/package.json.tmpl" > "$work_dir/package.json"
  # Remove the overrides block — not needed when installing from npm
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    delete p.overrides;
    fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
  "
  rm "$work_dir/package.json.tmpl"

  log "Installing @latest from npm..."
  cd "$work_dir"
  npm install --legacy-peer-deps --no-package-lock --silent

  log "Verifying @latest works..."
  run_with_timeout 180 ./node_modules/.bin/storybook build --quiet \
    || { fail "storybook build failed on @latest — upgrade test cannot proceed"; exit 1; }
  ./node_modules/.bin/vitest run

  ok "@latest verified"

  # Phase 2: upgrade to new tarball
  log "Upgrading to new tarball..."
  npm install --legacy-peer-deps --no-package-lock --silent \
    "@storybook-astro/framework@file:$FRAMEWORK_TGZ"

  # Force renderer to the tarball via npm override in place
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    p.overrides = { '@storybook-astro/renderer': 'file:$RENDERER_TGZ' };
    fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
  "
  npm install --legacy-peer-deps --no-package-lock --silent

  log "Verifying upgrade works..."
  run_with_timeout 180 ./node_modules/.bin/storybook build --quiet \
    || { fail "storybook build failed after upgrade"; exit 1; }
  ./node_modules/.bin/vitest run

  ok "Upgrade / Astro $astro_ver passed"
}

# ── Main ───────────────────────────────────────────────────────────────────────
build_packages
validate_dist
pack_packages

versions=()
if [ "$ASTRO_VERSION" = "both" ]; then
  versions=(5 6)
else
  versions=("$ASTRO_VERSION")
fi

scenarios=()
if [ "$SCENARIO" = "both" ]; then
  scenarios=(fresh upgrade)
else
  scenarios=("$SCENARIO")
fi

failed=()
for ver in "${versions[@]}"; do
  for sc in "${scenarios[@]}"; do
    if ! "run_${sc}" "$ver"; then
      failed+=("${sc}/astro${ver}")
    fi
  done
done

echo ""
if [ ${#failed[@]} -gt 0 ]; then
  fail "Failed scenarios: ${failed[*]}"
  exit 1
fi

ok "All smoke tests passed"
