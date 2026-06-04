---
name: requirement-association
description: Use when analyzing module dependencies and cross-module scenarios - discovers implicit requirements, generates cross-module scenarios, and surfaces interruption, recovery, evidence-chain, and shared-resource risks before test case generation
---

# Skill 2: Requirement Association Analysis

## Iron Law

> If associations are not analyzed, test cases must not be generated.
> Single-module reasoning cannot reliably cover boundary failures between modules, states, evidence surfaces, and shared resources.

<HARD-GATE>
Do not proceed to `test-case-generation` until the user confirms the association analysis results.
</HARD-GATE>

## Preconditions

- Phase 1 status is `complete`
- `.supertester/requirements/parsed-requirements.md` exists

## Goal

Build a dependency and scenario view that explains not only what connects to what, but also:

- which state transitions cross boundaries
- which evidence surfaces depend on other modules
- which shared resources create coupling risk
- which interruption and recovery flows matter
- which list/history mechanics depend on cross-feature state

## Workflow

```text
parsed-requirements.md
    |
    v
Dependency analysis -> module-dependencies.md
    |
    v
Implicit requirement mining -> implicit-requirements.md
    |
    v
Cross-module scenario generation -> cross-module-scenarios.md
    |
    v
test-reviewer audit -> reviews/review-association-*.md
    |
    v
User confirmation
    |
    v
Update test_plan.md Phase 2 -> complete
```

## Step 1: Dependency Analysis

Read `parsed-requirements.md` and analyze:

1. **Functional dependencies**
   - one feature explicitly depends on another feature or module
2. **State dependencies**
   - one feature consumes or relies on state created by another
3. **Evidence dependencies**
   - verification requires evidence emitted from a different module or system
4. **Shared-resource dependencies**
   - multiple features share data, configuration, cache, jobs, queues, files, records, or quotas

### New P1 Association Checks

Also analyze two additional dependency families for every feature set:

5. **Interruption and recovery dependencies**
   - refresh, retry, navigation away, session expiry, language/context switch, page rebuild, resume-after-failure
6. **History and list interaction dependencies**
   - list ordering, pagination, lazy loading, empty state, feed refresh, history accumulation, cross-feature record visibility
7. **PRD-external / operational boundary dependencies**
   - configurable values whose source/owner is undefined, external service dependencies without SLA, compliance-driven features without regulatory detail, manual workflows not automated in product

The purpose is not only to say "A depends on B", but to explain:

- which flows must be chained to form real user journeys
- which states or records move across boundaries
- which evidence surfaces originate from another module
- which interruptions can invalidate or rebuild in-progress state
- which history/list outputs depend on earlier feature execution

### Output: `module-dependencies.md`

```markdown
# Dependency Analysis

## Dependency Map
| Module / Feature | Type | Depends On | Dependency Types |
|------------------|------|------------|------------------|
| [Module or Feature] | core/support | [dependency list] | functional/state/evidence/shared_resource/interruption_recovery/history_interaction/prd_external |

## Critical Paths
1. [Module A] -> [Module B] -> [Module C]

## Shared Resources
| Resource | Shared By | Risk |
|----------|-----------|------|
| [resource] | [modules] | high/medium/low |

## PRD-External / Operational Boundary Items
| Feature / Area | External Item | Type | Clarification Status |
|----------------|---------------|------|----------------------|
| [feature] | [item that PRD does not fully define] | ops_config / external_service / compliance / approval_flow | pending / clarified |

## Evidence Dependencies
| Feature | Evidence Surface | Evidence Source | Risk |
|---------|------------------|-----------------|------|
| [feature] | UI/API/DB/Event/File/Message/Log/Metrics/External System | [source] | high/medium/low |

## Interruption / Recovery Dependencies
| Feature | Interruption Trigger | Recovery Expectation | Risk |
|---------|----------------------|----------------------|------|
| [feature] | refresh / retry / context switch / re-auth | reset / resume / preserve / replay / degrade | high/medium/low |

## History / List Dependencies
| Feature | Downstream List / History Surface | Dependency | Risk |
|---------|-----------------------------------|------------|------|
| [feature] | [history or list surface] | visibility / ordering / pagination / accumulation | high/medium/low |
```

## Step 2: Mine Implicit Requirements

Infer requirements that are not explicitly written but are logically necessary.


Additional P1 patterns for state machine and error propagation:

- if an entity has 3+ named or implied states, enumerate the full state machine — are all forward, backward, timeout, and cancel transitions accounted for?
- if a multi-step UI flow exists (chained dialogs, wizard, progressive form), can the user reach an illegal state by navigating backward, closing mid-flow, or deep-linking?
- if identity or subscription tier changes, which downstream modules must re-evaluate their behavior — and is there a propagation mechanism or do they read stale state?
- if an upstream service call fails, does the downstream module show an explicit error, silently degrade, show stale data, or crash?
- if a shared numeric resource (quota, balance, trial count) can be modified by concurrent actors, is the decrement atomic or can it go negative / be double-spent?
- if two asynchronous jobs write to the same record or queue, is ordering guaranteed or can results interleave?
- if a background job and a user-initiated action race on the same entity, which one wins and is the loser's result visible anywhere (history, notification, log)?
- if a global setting change (language, timezone, subscription tier) happens mid-operation, do in-flight operations use the old or new value?

Categories:

1. **Precondition implications**
2. **Postcondition implications**
3. **Data consistency implications**
4. **Boundary-case implications**
5. **Error propagation implications**
6. **Evidence completeness implications**
7. **Shared-resource implications**
8. **Interruption / recovery implications**
9. **History / list consistency implications**
10. **PRD-external / operational boundary implications**

### Generic P1 Implication Patterns

Look for these domain-agnostic patterns:

- if a process can run long enough to show progress, what happens on refresh?
- if a user can switch context, does the in-progress state reset, persist, or resume?
- if records are created, do they appear in history/list surfaces with the right order and visibility?
- if a feature writes state asynchronously, when is that state visible downstream?
- if pagination or lazy loading exists, is ordering stable across pages or fetches?
Additional P1 patterns for transient-UI and session-boundary interruptions:

- if a transient UI element is visible (modal, overlay, toast, progress indicator), what happens on page refresh — does it reappear, reset, or disappear?
- if the user switches a global setting (language, theme, accessibility mode) while a transient UI element is active, does the element update immediately or on next render?
- if multiple browser tabs share the same session, and one tab changes auth or subscription state, do other tabs detect and reconcile on next interaction?
- if the user closes the browser entirely during a multi-step flow (payment, onboarding, authorization), is there a resume entry point or does the flow restart?
- if a background service (email delivery, webhook, async job) times out, is there a user-visible retry entry point and a clear status indication?
- if a feature depends on an external service response to render UI (geo-IP, third-party auth, payment gateway), what is the degraded UI when that service is slow or unavailable?
- if an error message or validation state is displayed, and the user navigates away then returns, is the error/validation state preserved, cleared, or re-evaluated?
- if a confirmation/consent decision is pending (cookie consent, terms acceptance), does it survive navigation and page transitions until explicitly resolved?

- if retries occur, does history duplicate, merge, or replace prior attempts?

### PRD-External / Operational Boundary Patterns

Look for these patterns that indicate items outside the PRD's scope but relevant to testing:

- if a feature uses a **configurable value** (quota limits, pricing, thresholds, blacklists) but the PRD does not specify who maintains it or how it is updated → mark as `ops_config`
- if a feature depends on an **external service** (payment gateway, email service, geo-IP provider, third-party auth) and the PRD does not define SLA, failover, or selection criteria → mark as `external_service`
- if a feature is driven by **legal or compliance requirements** (GDPR, data retention, accessibility) and the PRD does not detail the specific regulatory rules → mark as `compliance`
- if a feature involves a **manual approval or maintenance workflow** (blacklist curation, content moderation, refund processing) that is not automated in the product → mark as `approval_flow`
- if a feature mentions a value that **changes with business strategy** (trial duration, tier pricing, promotional offers) without specifying change management → mark as `ops_config`

For each identified item, record it in `implicit-requirements.md` with type `prd_external` and clarification status `pending`.

### Output: `implicit-requirements.md`

```markdown
# Implicit Requirements

| ID | Inferred From | Implicit Requirement | Type | Severity |
|----|---------------|----------------------|------|----------|
| IR-001 | F-001: "processing starts" | Refresh during processing must either preserve progress, resume safely, or clearly reset state. | interruption_recovery | high |
| IR-002 | F-005: "history list shows results" | Newly generated results must appear in the correct list position with stable ordering rules. | history_interaction | high |
| IR-003 | F-010: "blacklist domains" | Blacklist maintenance workflow (add/remove/approval) is not defined in PRD — mark as operational dependency. | prd_external | medium |
```

## Step 3: Generate Cross-Module Scenarios

Based on dependencies and implicit requirements, generate cross-module scenarios.

### Scenario Types

- `critical_path`
- `module_boundary`
- `error_propagation`
- `concurrent`
- `data_sync`
- `evidence_chain`
- `shared_resource`
- `interruption_recovery`
- `history_interaction`

### Required P1 Scenario Heuristics

Generate interruption/recovery scenarios when:

- one module starts work and another module or UI state displays progress or results
- state can survive or be lost across refresh/navigation/session changes
- recovery behavior is user-visible or business-significant

Generate history/list scenarios when:

- one feature produces records consumed by another feature's list/history/table/feed
- ordering, pagination, visibility, empty-state, or accumulation semantics exist
- records can be retried, updated, or replaced asynchronously

### Output: `cross-module-scenarios.md`

```markdown
# Cross-Module Test Scenarios

## CMS-001: [Scenario Name]

- **Type:** critical_path | module_boundary | error_propagation | concurrent | data_sync | evidence_chain | shared_resource | interruption_recovery | history_interaction
- **Modules:** [module list]
- **Entry Conditions:** [preconditions]
- **Exit Conditions:** [success criteria]

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | [module] | [action] | [result] |

- **Source:** F-001, F-003, IR-001
```

## Step 4: test-reviewer Audit

Call `test-reviewer` to inspect:

- missing critical dependency paths
- missing evidence dependencies
- missing shared-resource risks
- missing interruption/recovery scenarios
- missing history/list interaction scenarios
- overfocus on behavior dependencies while ignoring state/evidence/resource dependencies

Save the result to `.supertester/reviews/review-association-<timestamp>.md`.

## Step 5: User Confirmation

Show the user:

1. dependency summary
2. implicit requirements summary
3. cross-module scenarios summary
4. reviewer summary

After confirmation, mark Phase 2 complete.

## 2-Action Rule

- after analyzing 2 module dependencies, update `module-dependencies.md`
- after inferring 2 implicit requirements, update `implicit-requirements.md`
- after generating 2 cross-module scenarios, update `cross-module-scenarios.md`

## Red Flags

| If you think... | Reality is... |
|-----------------|---------------|
| "Single-module test design is enough" | Most production defects hide at boundaries between modules, states, or evidence surfaces. |
| "Interruption behavior is just UX polish" | Interruption and recovery behavior often changes correctness, data visibility, and trust. |
| "History lists are downstream UI only" | They are often the visible proof that upstream work completed correctly. |
| "Only the happy path needs association analysis" | Boundaries fail most often under retries, delays, async updates, and context changes. |
| "If it is not explicit in the PRD, it is not part of association analysis" | Many cross-module failures are implicit by nature. |

## Completion Criteria

Phase 2 is complete only when:

- major functional dependencies are identified
- major state and evidence dependencies are identified
- shared-resource risks are identified
- interruption/recovery associations are considered where applicable
- history/list interactions are considered where applicable
- cross-module scenarios cover more than happy paths
- PRD-external / operational boundary items are identified and marked as pending clarification
