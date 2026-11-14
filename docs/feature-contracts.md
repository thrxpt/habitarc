# Feature contracts and planned verification

Status: accepted contract baseline following user confirmation of Q25. These contracts, acceptance criteria (AC), and software test specifications (STS) describe planned work, not test results. No product code, test implementation, issue, release, or execution evidence is implied. Preserve this baseline's real version history before feature implementation.

Read alongside [requirements](srs.md), [system design](system-design.md), and [sprint allocation](product-plan.md). All private operations inherit BR-01 and NFR-01; all entry writes inherit BR-02–09. Test fixtures are synthetic and include Participant A, Participant B, and Program Manager M, fixed account clocks, and real PostgreSQL for integration tests. Never use real private histories for evidence.

Each AC below names its planned STS ID and level. Every row supplies setup/action and observable expected outcome. Unit checks exercise calculations; integration checks exercise real authentication/application/database boundaries; E2E checks exercise rendered critical journeys. Tests marked integration must not substitute mocked storage for persistence or authorization.

## F01 — Accounts and authorization

Sprint 1. FR-01–02, BR-01/07, NFR-01/07. No feature prerequisites. Deliver secure provisioning, login/logout/current identity, and reusable server-side role/ownership checks. Owner A; teammate B reviews and attempts misuse. The Better Auth compatibility/provisioning spike is an early gate.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F01-1 / STS-F01-1 | Integration + E2E | Provision A, B, M; sign in using valid and invalid passwords | Valid users receive the correct identity/role; invalid credentials disclose no account details; no credential is logged |
| AC-F01-2 / STS-F01-2 | Integration | Call signup directly, submit a forged role, then call every newly added protected operation anonymously/as wrong role/as B against A's records | Signup/role escalation fail; private records are never disclosed or mutated; manager template privileges never imply participant-history access |
| AC-F01-3 / STS-F01-3 | Integration | Login on instance 1; logout/revoke, then reuse the cookie on instance 2; advance past expiry | Revoked/expired sessions fail immediately on the next validated request; required cookie attributes are present |
| AC-F01-4 / STS-F01-4 | Integration | Send cross-origin writes, exceed login limit across replicas, and attempt spoofed forwarding headers | Unsafe writes fail; shared limiter blocks excess attempts; untrusted headers cannot evade the configured identity policy |

Extend STS-F01-2's protected-operation matrix with each feature. F01's first delivery does not prove future endpoints secure.

## F02 — Template creation and selection

Sprint 1. FR-03, BR-02/12, NFR-01. Depends on F01. Owner B; A reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F02-1 / STS-F02-1 | Integration + E2E | M creates a Focused Study template, minutes, bounds 5–45; A opens selection after reload | Exact persisted template appears with unit/range guidance |
| AC-F02-2 / STS-F02-2 | Unit + integration | Submit zero/fractional/inverted bounds, unsupported units, or maximum above unit ceiling | Backend rejects invalid definitions without partial writes |
| AC-F02-3 / STS-F02-3 | Integration | A attempts template creation directly; unauthenticated caller attempts restricted reads/writes | Forbidden operation fails; no template or private record is changed |

Mutable library maintenance is F08; template-use constraints must already be represented safely in the Sprint 1 data model.

## F03 — Habit setup

Sprint 1. FR-04, BR-01–05/07–08/11–12. Depends on F01/F02. Owner A; B reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F03-1 / STS-F03-1 | Integration + E2E | A selects the 5–45 minute template, target 60, weekdays Monday–Friday | Habit and initial Goal Revision persist atomically; start date is today's account date; target above entry maximum is accepted |
| AC-F03-2 / STS-F03-2 | Unit + integration | Submit empty weekdays, fractional/below-minimum/over-ceiling target, or an archived template | Clear field/eligibility failure; no partial Habit/revision |
| AC-F03-3 / STS-F03-3 | Integration | Concurrently create two Habits for A/template; repeat with a prior Habit archiving tomorrow and then with it already archived | At most one eligible active Habit exists; pending archive still blocks today; an ended prior period permits a new Habit |
| AC-F03-4 / STS-F03-4 | Integration | Race template edit/archive against Habit creation | Result is serialized: no used template's measurement meaning changes and no new Habit selects an already archived template |

## F04 — Activity recording and Today

Sprint 1. FR-05, BR-01/03–09/13, NFR-02/04. Depends on F03. Owner B; A reviews. Today is the first complete participant journey.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F04-1 / STS-F04-1 | Integration + E2E | For target 60, record two deliberate 25-minute entries, reload, then add 25 more | Totals are 50 then 75; actual progress is 125%, fill stops at 100%; entries remain individually visible |
| AC-F04-2 / STS-F04-2 | Integration | Retry one save concurrently with the same request key/payload; reuse its key with a different amount | Only one entry is created; changed-payload reuse returns conflict; separate deliberate keys still create separate entries |
| AC-F04-3 / STS-F04-3 | Unit + integration | Around account midnight, test today−6, today−7, tomorrow, pre-start, off-schedule, and another device timezone | Only eligible account dates are writable; off-schedule activity is retained without completion credit; device timezone has no effect |
| AC-F04-4 / STS-F04-4 | Integration | Start at 1,430 minutes and race two +10 writes; exercise count ceiling, zero, fractions, and range violations | No total exceeds its unit ceiling; exactly one +10 succeeds; rejected operations leave no partial record/receipt |
| AC-F04-5 / STS-F04-5 | E2E | Lose a save response and retry; simulate backend failure; inspect empty state and reload | Safe retry cannot duplicate activity; failure is never labeled saved; empty state directs to Habit setup |

## F05 — Reproducible persistence and delivery

Sprint 1 and Lab 5. FR-12, NFR-06–08. Infrastructure work begins alongside F01; release acceptance depends on F01–F04. Owner B for deployment, A for migrations/verification; each reviews the other's work.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F05-1 / STS-F05-1 | System | Teammate follows clean README setup, migration, synthetic account seed, build, and tests | Working local critical journey with real PostgreSQL; repeat setup preserves existing records; secrets absent from Git/output |
| AC-F05-2 / STS-F05-2 | CI/system | Open temporary branch with a deliberate required-check failure; attempt integration | Required check fails and blocks integration/release; preserve actual run evidence before removing the deliberate failure |
| AC-F05-3 / STS-F05-3 | Deployment/E2E | Release reviewed main image to GCP, record IDs/amounts, restart/redeploy the app, retrieve them | Durable records survive; deployed commit/image matches release evidence; backup configuration is recorded |
| AC-F05-4 / STS-F05-4 | Operational review | Inspect remaining credit, expiry, regional estimate, limits, secrets/IAM, migration job, and rollback procedure | Supported trial resources with budget runway; least-privilege identities; no paid upgrade; one controlled migration runner and documented recovery path |

## F06 — History and corrections

Sprint 2. FR-06, BR-01/03–09/13, NFR-02. Depends on F04. Owner A; B reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F06-1 / STS-F06-1 | Integration + E2E | View mixed scheduled/off-schedule history, edit an eligible amount/date, delete an eligible entry | Dated history and affected totals update correctly; changed dates validate both source/destination; old records display read-only |
| AC-F06-2 / STS-F06-2 | Integration | Edit yesterday at the window edge, advance account date, retry; attempt correction of a now-ineligible source or destination | Seven-date rule is enforced at mutation time; no partial move or lost record |
| AC-F06-3 / STS-F06-3 | Integration | Two tabs edit the same version; retry a prior create after its entry was deleted | One stale edit conflicts; deleted entry is not resurrected; privacy checks precede any replay |
| AC-F06-4 / STS-F06-4 | Unit + integration | Correct a completed date to below target and restore it | Completion and dependent derived results change consistently; later Streak/report tests reuse this scenario |

## F07 — Goal and schedule revisions

Sprint 2. FR-07, BR-03–05/10/13. Depends on F03/F06. Owner B; A reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F07-1 / STS-F07-1 | Integration + E2E | Yesterday's target was 60 and actual 40; lower target to 30 today | Yesterday remains incomplete; today retains its original target; new target applies tomorrow |
| AC-F07-2 / STS-F07-2 | Integration | Change tomorrow's weekdays/target twice today; race stale edits; cross midnight | One coherent pending revision remains; stale edit conflicts; newly effective revision is no longer retroactively replaceable |
| AC-F07-3 / STS-F07-3 | Unit + integration | Evaluate dates around a schedule change, including a formerly unscheduled weekday | Each date uses its applicable revision; no past obligation or completion is invented |

## F08 — Template and Habit lifecycle

Sprint 2. FR-08, BR-08/11–12. Depends on F02/F03/F07. Owner A; B reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F08-1 / STS-F08-1 | Integration + E2E | M edits an unused template, creates a Habit from it, then attempts a unit/bounds edit and a name edit | Unused measurement edit is validated; used measurement edit fails; descriptive edit succeeds without changing historical amounts |
| AC-F08-2 / STS-F08-2 | Integration | Archive template used by A; try creating a new Habit and logging against A's existing Habit | New selection fails; existing Habit continues normally |
| AC-F08-3 / STS-F08-3 | Integration + E2E | A archives a Habit today, records today, advances to tomorrow, corrects an eligible earlier entry, and starts anew | Today remains an obligation; post-archive dates reject activity; history/corrections survive; new Habit has separate history and no inherited Streak |
| AC-F08-4 / STS-F08-4 | Integration | Attempt archive as B, reactivate/delete history, or revise a pending-archive Habit for tomorrow | Unauthorized/unsupported transitions fail; pending goal rules cannot extend the archived tracking period |

## F09 — Streaks

Sprint 2. FR-09, BR-05/09–11/14. Depends on F06–F08. Owner B; A reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F09-1 / STS-F09-1 | Unit | Weekday Habit completes Friday and Monday; weekend has activity | Streak reaches two; weekend activity does not increment or interrupt it |
| AC-F09-2 / STS-F09-2 | Unit + integration | Monday remains incomplete while an earlier Streak exists; cross Monday's account midnight, then correct Monday within its window | Streak survives unfinished today, breaks after it ends, and recalculates after valid correction |
| AC-F09-3 / STS-F09-3 | Unit + E2E | Change future Schedule, archive, then create a new Habit from the same template | Historic Streak uses historical obligations; archived current Streak is not applicable; longest remains; new Habit begins independently |

## F10 — In-app Reminders

Sprint 2. FR-10, BR-05/07/11/15. Depends on F04/F07/F08. Owner A; B reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F10-1 / STS-F10-1 | Unit + E2E | Set reminder to 18:00; view app before/after 18:00 on a scheduled incomplete date | Due indicator appears only when eligible; local time is explicit; app refreshes/re-evaluates while open and on focus |
| AC-F10-2 / STS-F10-2 | Unit | Complete target, switch to unscheduled/archived date, disable reminder, or test DST transition | Indicator clears/is absent as appropriate; no duplicate notification or background delivery is claimed |

## F11 — Progress summaries

Sprint 3. FR-11, BR-09–10/13–14/16–17, NFR-03–05. Depends on F06–F09. Owner B; A reviews.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F11-1 / STS-F11-1 | Unit + integration + E2E | In a completed seven-date window, five scheduled dates contain three completions and two misses; add off-schedule activity and today's entry | Completion Rate is 3/5 = 60%; activity totals include eligible off-schedule amounts; today is separate; period labels are unambiguous |
| AC-F11-2 / STS-F11-2 | Unit | Choose 30 dates, a newly created Habit, an archived Habit, zero scheduled dates, and historical goal changes | Only active-period dates/appropriate revisions count; empty denominator shows “Not scheduled”; no combined unrelated activity total |
| AC-F11-3 / STS-F11-3 | Integration + E2E | Correct an eligible past entry, refresh report, navigate by keyboard and screen-reader-friendly text | Figures update from the same source rules as history; charts have usable textual equivalents and labels |

## F12 — Final quality and assessed handoff

Sprint 3. FR-12, NFR-01–08. Depends on all required features plus independent UAT and the separate maintenance exercise. Owner A leads final QA/evidence; B leads release packaging; both present together.

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F12-1 / STS-F12-1 | System + accessibility + performance | Run final-commit regression, access matrix, viewport/keyboard/zoom checks, automated accessibility, and the specified load workload | Compare actual counts/measurements to every NFR target; no required skipped test or undisclosed incomplete feature |
| AC-F12-2 / STS-F12-2 | Recovery/system | Restore a recent backup to isolated storage, time it, verify sample IDs/amounts and auth/account setup | Restore within NFR-06 target; assessed database untouched; recovery point and restoration duration recorded |
| AC-F12-3 / STS-F12-3 | Independent acceptance | Partner team executes at least normal, boundary, role/ownership, and history/persistence cases; re-test accepted fixes and maintenance impacts | Named independent testers, expected/actual outcomes, defect links, and fixed/re-tested release IDs; developer self-checks do not substitute |
| AC-F12-4 / STS-F12-4 | Release/evidence review | Review final traceability/DoD, deploy immutable accepted release, inspect PDF and ≤4-minute video access | All baseline features accounted for; final evidence matches deployed commit; both students present together; no credentials exposed; access retained through grading |

## Separate lab obligations

Lab 6 UAT is due November 22, during Sprint 2, even though final re-verification belongs to F12. Arrange a partner team before November 20. At least one accepted defect must be resolved and independently re-tested; if no legitimate defect is found, obtain the TA's isolated exercise rather than inventing or planting a product bug.

Lab 7 requires an instructor/TA-approved change to already implemented behavior, not a baseline feature deferred until Sprint 3. Reserve capacity under M01, obtain approval before implementation, and record impact analysis, revised contracts/AC/STS, regression evidence, reviewed deployment, and readiness. The change itself is intentionally unspecified until a real approved request exists. Track five dated, sourced metrics: required-AC verification status, automated test pass/fail/skipped counts, open defects by severity, fix-to-independent-retest elapsed time, and deployment success/failure counts. Include denominators and source links; no invented historical measurements.

## Definition of done and evidence protocol

Every feature requires its contract before code, a GitHub issue linked to requirement/AC/STS IDs, bounded branch, meaningful rule/negative tests, a substantive teammate review, integration into sprint staging, and verification on the integrated release. Both students must participate across design, code, tests, review, and delivery. Ownership here identifies the primary driver, not exclusive specialization.

Capture rule/defect/change TDD red→green versions honestly; do not reconstruct or backdate evidence. Retain UI→application→DB demonstrations, actual backend forbidden-operation evidence, build/test commands and counts, and the release version. Final evidence includes actual domain-rule and access-test excerpts and two reviewed Issue/PR chains from different sprints.

Use a verification ledger with columns: requirement ID, feature/AC/STS ID, actual test file/name or measurement, execution status (PLANNED/PASS/FAIL/SKIPPED/INCOMPLETE), commit, CI/run or evidence reference, tester, and date. Initially every STS above is PLANNED and actual-result fields are empty. Expand and execute it during implementation; this document must never be used as proof of passing tests.

The feature is done only when behavior, tests, review, integration, relevant docs, deployment checks, and required independent acceptance agree. Failed release gates stay visible. Actual code locations, issue IDs, reviewers, deployment URLs, and run counts are future evidence, not placeholders to fabricate.
