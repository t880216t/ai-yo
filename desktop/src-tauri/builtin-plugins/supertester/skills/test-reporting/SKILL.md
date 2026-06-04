---
name: test-reporting
description: Use when generating the final test report - aggregates all phase outputs into a comprehensive report with traceability, coverage-dimension analysis, retained manual assets, and clear gap statements
---

# Skill 6: Test Reporting

## Iron Law

> A test report is not a count summary; it is a coverage explanation.
> If the report cannot explain what is covered, what is intentionally retained for manual verification, and what remains partial or missing, the report is incomplete.

## Preconditions

- Phase 5 status is `complete`

## Goal

Produce a report that makes the test outcome decision-ready by showing:

- requirement coverage
- coverage dimensions
- preserved high-value assets
- automation boundaries
- retained manual or partial verification areas
- remaining gaps and next actions

## Workflow

```text
All phase outputs
    |
    v
Aggregate counts and mappings
    |
    v
Analyze coverage dimensions + preserved assets + manual retention + gaps
    |
    v
Build traceability matrix
    |
    v
Write report -> reports/YYYY-MM-DD-<module>.md
    |
    v
Update test_plan.md Phase 6 -> complete
```

## Required Report Sections

The report must include:

1. **Executive Summary**
2. **Requirement Coverage**
3. **Coverage Dimensions**
4. **High-Value Asset Preservation**
5. **Functional Test Case Summary**
6. **Automation Analysis**
7. **Cross-Module Scenarios**
8. **Automation Scripts**
9. **Retained Manual / Partial Verification**
10. **Gap Analysis**
11. **Traceability Matrix**
12. **Review History**

## New P1 Reporting Rule: Retained Manual Assets Are First-Class Output

Do not treat manual or partial coverage as a leftover list.

Whenever the workflow preserves assets as manual or partial, the report must explicitly explain:

- which asset was retained
- why it was not fully automated
- whether it is still covered manually
- whether the limitation is intentional or still a gap

This rule is generic and applies across products. It is not limited to visual assets.

## Report Content Rules

### 1. Requirement Coverage

For each `F-xxx`, `IR-xxx`, and `CMS-xxx`, report:

- linked test cases (cite by `TC-xxx`; for matrix cases, cite `TC-xxx#group/row-index` when only a subset of rows covers the requirement)
- automation level (case-level + row-level for matrix)
- coverage status

### 1a. Counting Conventions

`functional-cases.yaml` is the canonical source. Statistics MUST distinguish two scales:

- **case count**: number of entries in `cases[]` (regardless of `type`)
- **execution-point count (leaf-step count)**: sum of leaf steps across all cases — a `single` case contributes its `steps.length`; a `matrix` case contributes the total number of `children` leaf steps across its group steps; a `scenario_chain` case contributes its `steps.length` (there are no `branches` — branch paths are separate cases). Use `meta.total_steps`.

Always report both. A report that only shows case count understates true coverage breadth when matrix cases exist; a report that only shows execution-point count understates the conceptual case count and inflates apparent automation density.

### 1b. Priority (level: P0/P1/P2) Reporting

Priority comes directly from `functional-cases.yaml`, where `level` lives on each leaf step. A case's effective level = the highest `level` among its leaf steps (`meta.level_distribution`); per-leaf-step counts come from `meta.level_step_distribution`. The report MUST surface it explicitly — counts alone (e.g. "total = 80") tell users nothing about release risk.

Required:

- Top-line `Priority Mix` in Executive Summary (P0 / P1 / P2 percentages at both case scale and leaf-step scale)
- A dedicated `Priority Distribution` section with case-count (effective level) and leaf-step-count breakdowns
- A P0 case list with module + case_name + automation level (this is the "must-fix-before-release" inventory users will scan first; a case qualifies if it contains any P0 leaf step)
- A Priority × Automation cross-tab (small 3×3) — surfaces e.g. "5 P0 cases are manual" which is a release-readiness signal
- The Traceability Matrix and per-module case tables MUST carry a Priority column with literal P0/P1/P2 (not High/Medium/Low)

Do NOT recompute or reclassify level. If a leaf step is missing `level` upstream, flag it as a Phase 3 defect rather than guessing a value here.

### 2. Coverage Dimensions

At minimum, evaluate:

- behavior
- rules / enumerations
- content fidelity
- process feedback
- interruption / recovery
- history / list interaction
- state / data
- integration
- evidence chain
- contract content
- visual / media handling

If a dimension has only behavior coverage but weak evidence coverage, mark it `partial`, not `covered`.

### 3. High-Value Asset Preservation

Summarize how the workflow preserved:

- copy and content assets
- rules, matrices, lists, enums
- process-state assets
- interruption/recovery behaviors
- history/list behaviors
- prompt/schema/path/template contracts
- visual/media assets
- PRD-external business assets

### 4. Retained Manual / Partial Verification

This section must separate:

- **intentionally retained manual coverage**
- **partially automated coverage**
- **still-missing coverage**

Do not merge these into one bucket.

### 5. Gap Analysis

Classify gaps into:

- `covered`
- `preserved_manual`
- `partial`
- `missing`

Use concrete asset or dimension names. Never write vague "needs more coverage".

## Output Template Reference

See `@report-template.md`.

## Output Location

Write to:

- `.supertester/reports/YYYY-MM-DD-<module>.md`

If multiple modules are involved, you may generate:

- one summary report: `YYYY-MM-DD-summary.md`
- one detailed report per module

## Steps

1. read all phase output files
2. aggregate counts and mappings
3. analyze coverage dimensions
4. analyze preserved assets and retained manual/partial assets
5. construct the traceability matrix
6. write gap analysis using concrete asset/dimension terms
7. generate the report from the template
8. update Phase 6 to `complete`
9. update `progress.md`

## Reporting Rules

- do not reduce the report to counts or file listings
- always report both case count and execution-point count when matrix cases are present
- explain why some coverage is intentionally manual or partial
- if an asset is not automated but is preserved manually, say so explicitly
- if an asset is neither automated nor manually preserved, mark it as missing
- if a dimension covers only final behavior but not the relevant process, contract, or evidence depth, mark it as partial
- when a matrix case has rows at mixed automation levels (e.g. some `automatable`, some `manual`), report the breakdown rather than collapsing to a single label
- preserve `verbatim: true` markers in the traceability matrix — they indicate copy-fidelity assets that must remain literal in any downstream test management system
- write in reusable, domain-agnostic language; the structure must work across future products
