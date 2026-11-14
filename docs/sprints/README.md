# Sprint engineering contracts and verification

Status: accepted contract baseline following user confirmation of Q25. These contracts, acceptance criteria (AC), and software test specifications (STS) describe planned work, not test results. No product code, test implementation, issue, release, or execution evidence is implied. Preserve this baseline's real version history before feature implementation.

Read alongside [requirements](../srs.md), [system design](../system-sds.md), and [sprint allocation](plan.md). All private operations inherit BR-01 and NFR-01; all entry writes inherit BR-02–09. Test fixtures are synthetic and include Participant A, Participant B, and Program Manager M, fixed account clocks, and real PostgreSQL for integration tests. Never use real private histories for evidence.

Each AC in the linked feature contracts names its planned STS ID and level. Every row supplies setup/action and observable expected outcome. Unit checks exercise calculations; integration checks exercise real authentication/application/database boundaries; E2E checks exercise rendered critical journeys. Tests marked integration must not substitute mocked storage for persistence or authorization.

## Feature contracts and STS

Each feature file contains its design context, dependencies, observable acceptance criteria, and paired STS table. Shared fixtures, verification conventions, lab obligations, and Definition of Done below apply to every feature.

| Feature | Sprint | Contract and STS |
| --- | --- | --- |
| F01 | 1 | [Accounts and authorization](sprint-1/f01-accounts-and-authorization.md) |
| F02 | 1 | [Template creation and selection](sprint-1/f02-template-creation-and-selection.md) |
| F03 | 1 | [Habit setup](sprint-1/f03-habit-setup.md) |
| F04 | 1 | [Activity recording and Today](sprint-1/f04-activity-recording-and-today.md) |
| F05 | 1 | [Reproducible persistence and delivery](sprint-1/f05-reproducible-persistence-and-delivery.md) |
| F06 | 2 | [History and corrections](sprint-2/f06-history-and-corrections.md) |
| F07 | 2 | [Goal and schedule revisions](sprint-2/f07-goal-and-schedule-revisions.md) |
| F08 | 2 | [Template and Habit lifecycle](sprint-2/f08-template-and-habit-lifecycle.md) |
| F09 | 2 | [Streaks](sprint-2/f09-streaks.md) |
| F10 | 2 | [In-app Reminders](sprint-2/f10-in-app-reminders.md) |
| F11 | 3 | [Progress summaries](sprint-3/f11-progress-summaries.md) |
| F12 | 3 | [Final quality and assessed handoff](sprint-3/f12-final-quality-and-assessed-handoff.md) |

Whole-product coverage is maintained in the [feature inventory](../features.md) and [requirements traceability matrix](../traceability.md).

## Separate lab obligations

Lab 6 UAT is due November 22, during Sprint 2, even though final re-verification belongs to F12. Arrange a partner team before November 20. At least one accepted defect must be resolved and independently re-tested; if no legitimate defect is found, obtain the TA's isolated exercise rather than inventing or planting a product bug.

Lab 7 requires an instructor/TA-approved change to already implemented behavior, not a baseline feature deferred until Sprint 3. Reserve capacity under M01, obtain approval before implementation, and record impact analysis, revised contracts/AC/STS, regression evidence, reviewed deployment, and readiness. The change itself is intentionally unspecified until a real approved request exists. Track five dated, sourced metrics: required-AC verification status, automated test pass/fail/skipped counts, open defects by severity, fix-to-independent-retest elapsed time, and deployment success/failure counts. Include denominators and source links; no invented historical measurements.

## Definition of done and evidence protocol

Every feature requires its contract before code, a GitHub issue linked to requirement/AC/STS IDs, bounded branch, meaningful rule/negative tests, a substantive teammate review, integration into sprint staging, and verification on the integrated release. Both students must participate across design, code, tests, review, and delivery. Ownership here identifies the primary driver, not exclusive specialization.

Capture rule/defect/change TDD red→green versions honestly; do not reconstruct or backdate evidence. Retain UI→application→DB demonstrations, actual backend forbidden-operation evidence, build/test commands and counts, and the release version. Final evidence includes actual domain-rule and access-test excerpts and two reviewed Issue/PR chains from different sprints.

Use a verification ledger with columns: requirement ID, feature/AC/STS ID, actual test file/name or measurement, execution status (PLANNED/PASS/FAIL/SKIPPED/INCOMPLETE), commit, CI/run or evidence reference, tester, and date. Initially every STS is PLANNED and actual-result fields are empty. Expand and execute it during implementation; this document must never be used as proof of passing tests.

The feature is done only when behavior, tests, review, integration, relevant docs, deployment checks, and required independent acceptance agree. Failed release gates stay visible. Actual code locations, issue IDs, reviewers, deployment URLs, and run counts are future evidence, not placeholders to fabricate.
