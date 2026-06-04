#!/usr/bin/env python3
"""
Session Catchup Script for Supertester
Reads .supertester/ files and generates a context summary for session recovery.

Usage: python session-catchup.py [project-dir]
"""

import os
import sys
import json
from pathlib import Path


def read_file_safe(path: str, max_lines: int = 0) -> str:
    """Read file content safely, return empty string if not found."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            if max_lines > 0:
                lines = []
                for i, line in enumerate(f):
                    if i >= max_lines:
                        break
                    lines.append(line)
                return "".join(lines)
            return f.read()
    except (FileNotFoundError, PermissionError):
        return ""


def extract_current_phase(test_plan: str) -> str:
    """Extract current phase from test_plan.md."""
    for line in test_plan.split("\n"):
        if line.startswith("Phase"):
            return line.strip()
    return "Unknown"


def extract_phase_statuses(test_plan: str) -> list:
    """Extract all phase statuses."""
    statuses = []
    current_phase = ""
    for line in test_plan.split("\n"):
        if line.startswith("### Phase"):
            current_phase = line.strip("# ").strip()
        if "**Status:**" in line:
            status = line.split("**Status:**")[1].strip()
            statuses.append({"phase": current_phase, "status": status})
    return statuses


def check_clarifications(supertester_dir: str) -> dict:
    """Check clarification session status."""
    clarif_path = os.path.join(supertester_dir, "requirements", "clarifications.json")
    try:
        with open(clarif_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "status": data.get("status", "unknown"),
            "completed": len(data.get("completedClarifications", [])),
            "pending": len(data.get("pendingClarifications", [])),
            "pause_reason": data.get("pauseReason", ""),
        }
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def main():
    project_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    supertester_dir = os.path.join(project_dir, ".supertester")

    if not os.path.isdir(supertester_dir):
        print("No .supertester/ session found.")
        print("Run init-session.sh to start a new session.")
        sys.exit(1)

    print("=" * 60)
    print("SUPERTESTER SESSION RECOVERY")
    print("=" * 60)

    # Read test_plan.md
    test_plan = read_file_safe(os.path.join(supertester_dir, "test_plan.md"))
    if test_plan:
        current_phase = extract_current_phase(test_plan)
        print(f"\nCurrent Phase: {current_phase}")

        statuses = extract_phase_statuses(test_plan)
        print("\nPhase Statuses:")
        for s in statuses:
            marker = {
                "complete": "[x]",
                "in_progress": "[>]",
                "pending": "[ ]",
            }.get(s["status"], "[?]")
            print(f"  {marker} {s['phase']} - {s['status']}")

    # Check clarifications
    clarif = check_clarifications(supertester_dir)
    if clarif:
        print(f"\nClarification Session:")
        print(f"  Status: {clarif['status']}")
        print(f"  Completed: {clarif['completed']}")
        print(f"  Pending: {clarif['pending']}")
        if clarif["pause_reason"]:
            print(f"  Pause reason: {clarif['pause_reason']}")

    # Check which output files exist
    print("\nOutput Files:")
    output_files = [
        ("requirements/parsed-requirements.md", "Parsed requirements"),
        ("requirements/clarifications.json", "Clarification state"),
        ("requirements/module-dependencies.md", "Module dependencies"),
        ("requirements/implicit-requirements.md", "Implicit requirements"),
        ("requirements/cross-module-scenarios.md", "Cross-module scenarios"),
        ("test-cases/functional-cases.md", "Functional test cases"),
        ("test-cases/deduplication-report.md", "Deduplication report"),
        ("test-cases/automation-analysis.md", "Automation analysis"),
    ]

    for file_path, description in output_files:
        full_path = os.path.join(supertester_dir, file_path)
        exists = os.path.isfile(full_path)
        marker = "[x]" if exists else "[ ]"
        print(f"  {marker} {description} ({file_path})")

    # Check scripts
    script_files = list(Path(os.path.join(supertester_dir, "scripts")).glob("*.spec.ts"))
    if script_files:
        print(f"\nGenerated Scripts: {len(script_files)}")
        for sf in script_files:
            print(f"  - {sf.name}")

    # Check reviews
    review_files = list(Path(os.path.join(supertester_dir, "reviews")).glob("review-*.md"))
    if review_files:
        print(f"\nReview Records: {len(review_files)}")
        for rf in review_files:
            print(f"  - {rf.name}")

    # Recent progress
    progress = read_file_safe(os.path.join(supertester_dir, "progress.md"))
    if progress:
        lines = progress.strip().split("\n")
        recent = lines[-20:] if len(lines) > 20 else lines
        print("\nRecent Progress (last 20 lines):")
        for line in recent:
            print(f"  {line}")

    print("\n" + "=" * 60)
    print("To resume: read test_plan.md and continue from current phase.")
    print("=" * 60)


if __name__ == "__main__":
    main()
