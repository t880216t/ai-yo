#!/usr/bin/env bash
# Initialize .supertester/ directory from templates
# Usage: init-session.sh [project-dir]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_DIR="${1:-.}"

SUPERTESTER_DIR="${PROJECT_DIR}/.supertester"

if [ -d "$SUPERTESTER_DIR" ]; then
    echo "Session already exists at ${SUPERTESTER_DIR}"
    echo "Use session-catchup.py to resume."
    exit 0
fi

# Create directory structure
mkdir -p "${SUPERTESTER_DIR}/requirements"
mkdir -p "${SUPERTESTER_DIR}/test-cases"
mkdir -p "${SUPERTESTER_DIR}/scripts"
mkdir -p "${SUPERTESTER_DIR}/reviews"
mkdir -p "${SUPERTESTER_DIR}/reports"

# Copy templates
cp "${PLUGIN_ROOT}/templates/test_plan.md" "${SUPERTESTER_DIR}/test_plan.md"
cp "${PLUGIN_ROOT}/templates/findings.md" "${SUPERTESTER_DIR}/findings.md"
cp "${PLUGIN_ROOT}/templates/progress.md" "${SUPERTESTER_DIR}/progress.md"

# Set session date in progress.md
TODAY=$(date +%Y-%m-%d)
if sed -i'' "s/\[DATE\]/${TODAY}/" "${SUPERTESTER_DIR}/progress.md" 2>/dev/null; then
    : # sed -i worked (Linux/macOS)
elif sed -i '' "s/\[DATE\]/${TODAY}/" "${SUPERTESTER_DIR}/progress.md" 2>/dev/null; then
    : # sed -i '' worked (BSD/macOS)
else
    # Fallback: use temp file
    sed "s/\[DATE\]/${TODAY}/" "${SUPERTESTER_DIR}/progress.md" > "${SUPERTESTER_DIR}/progress.md.tmp"
    mv "${SUPERTESTER_DIR}/progress.md.tmp" "${SUPERTESTER_DIR}/progress.md"
fi

echo "Initialized .supertester/ session at ${SUPERTESTER_DIR}"
echo "Core files:"
echo "  - test_plan.md   (phase tracking + decisions)"
echo "  - findings.md    (knowledge base)"
echo "  - progress.md    (session log)"
echo ""
echo "Output directories:"
echo "  - requirements/  (Phase 1-2)"
echo "  - test-cases/    (Phase 3-4)"
echo "  - scripts/       (Phase 5)"
echo "  - reviews/       (test-reviewer records)"
echo "  - reports/       (Phase 6)"
