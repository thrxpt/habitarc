# Habitarc product and three-sprint plan

Status: accepted planning baseline. The user confirmed Q1–25, including the complete product scope, security/quality details, estimates, and three-sprint allocation. The planning interview is complete. Implementation and cloud provisioning require a separate instruction; no product implementation or deployment has been performed by this planning task.

This is a course-complete two-role product: define a template, establish a personal Habit, record real activity, and understand consistent progress without rewriting history. The plan covers the complete release and the engineering evidence required across three sprints.

## Planning artifacts

- [Published product specification: GitHub issue #3](https://github.com/thrxpt/habitarc/issues/3), labeled `ready-for-agent`, contains the self-contained accepted scope, user stories, implementation decisions, and planned verification.
- The 19 approved implementation tickets are published as native sub-issues of [specification #3](https://github.com/thrxpt/habitarc/issues/3), with `ready-for-agent` labels and 27 native blocking relationships. Use those issues for the current execution frontier.
- [SRS](srs.md): product scope, FR/BR/NFR IDs, and accepted measurable quality targets.
- [System design](system-design.md): architecture, data model, security, UI/application contracts, concurrency, and deployment/recovery.
- [Feature contracts and STS](feature-contracts.md): F01–F12, acceptance criteria, dependencies, test inputs/expected outcomes, and definition of done.
- [Glossary](../GLOSSARY.md): canonical domain vocabulary.
- [ADR 0001](adr/0001-preserve-used-template-measurement-rules.md), [ADR 0002](adr/0002-cloud-run-and-cloud-sql.md), and [ADR 0003](adr/0003-effective-dated-habit-goals.md): stable template rules, trial-budget deployment, and historical goal revisions.

All implementation and verification statuses are PLANNED. Documentation checks are not evidence that the product works.

## Product direction

Habitarc helps students build consistent study and movement routines, such as focused study and walking. Activity templates are configurable. The product emphasizes personal consistency and progress and does not provide medical advice.

The three-sprint release will be a polished, course-complete application with Participant and Program Manager roles, private tracking, reliable history, useful summaries, accessible responsive screens, and reproducible deployment. Public onboarding, wearable integrations, social features, and external notifications are outside this release.

Program Managers maintain activity templates. Their role does not grant access to participants' private tracking histories. Domain vocabulary lives in [GLOSSARY.md](../GLOSSARY.md).

Keep the existing TanStack Start, React, TypeScript, and Tailwind foundation. Use one application packaged with Docker on Cloud Run and an ordinary single-zone Cloud SQL PostgreSQL instance. The deployment decision is recorded in [ADR 0002](adr/0002-cloud-run-and-cloud-sql.md). Better Auth with database-backed sessions is the accepted design, subject to the documented compatibility spike; concrete cloud resources remain provisioning prerequisites.

## Confirmed product model

A Habit is a participant's recurring commitment based on one Activity Template. The participant personalizes its target and schedule. An Activity Entry records activity performed toward exactly one Habit. For example, a Focused Study template can support a participant's study habit and an entry recording 25 minutes of study. Standalone activity journaling is outside this release.

Each Habit has one Daily Target and a Schedule selecting every day or particular weekdays. The target is evaluated separately for each scheduled date; there is no pooled weekly target. Weekly quotas, alternating weeks, and multiple targets within a day are outside this release.

Multiple Activity Entries for a Habit on the same date accumulate into its Daily Total. Two deliberately recorded 25-minute sessions count as 50 minutes even though their values match; retrying the same save counts once. Daily Totals may exceed the Daily Target. Display actual amount and percentage, including overachievement, while capping visual progress bars at 100%.

Each participant has a fixed Account Timezone chosen during provisioning, defaulting to Asia/Bangkok. Calendar dates and today's date follow that timezone, not the device timezone. Timezone editing is outside this release. Participants may create, edit, or delete their own Activity Entries for today and the preceding six calendar dates within the Habit's tracking period. Reject future/pre-start/post-archive dates; older entries are read-only. Corrections recalculate affected progress. Unscheduled activity remains in totals/history without creating an obligation, completion credit, or Streak increment.

Each Habit may have one optional local Reminder time. While the app is open, show a Reminder due indicator when that time has passed on a scheduled date and the Daily Target remains unmet. Reminder behavior is in-app only: no email, push, background delivery, or snoozing.

Templates use one fixed Measurement Unit: minutes or counts. Activity Entry amounts are positive whole numbers within the template's per-entry bounds. Daily Targets must meet the template minimum but may exceed its per-entry maximum. Daily Targets and Daily Totals are capped at 1,440 minutes or 1,000,000 counts per Habit/date; reject writes exceeding those ceilings. A count target of one can represent a simple completion Habit. Unit conversion and fractional measurements are outside this release.

Target and Schedule changes take effect tomorrow through Goal Revisions; repeated edits today replace the pending revision. Past dates retain their applicable targets/weekdays, so lowering a target cannot turn yesterday's insufficient activity into a Completed Day. Valid entry corrections can change historical results. See [ADR 0003](adr/0003-effective-dated-habit-goals.md).

Each participant may have at most one active Habit per template. A Habit starts on its creation date. Participant archiving takes effect tomorrow and preserves today's obligation and all history. Eligible earlier entries remain correctable. No pause or reactivation is included; restarting later creates a new Habit after the previous one ends, with fresh history and Streaks.

Streaks count consecutive completed scheduled dates. Unscheduled dates neither extend nor break them; unfinished today does not break a Streak until it ends. Show current and longest Streaks, recalculated after eligible corrections and evaluated against the historical Goal Revisions.

Reports cover each Habit's last seven or thirty completed calendar dates, with today separate. Show recorded amounts, completed versus scheduled dates, Completion Rate, and Streaks. Exclude unscheduled/outside-tracking-period dates from completion denominators while including eligible off-schedule activity in amounts. Keep activity totals per Habit; never combine unrelated measurements.

Participants choose exclusively from the Program Manager's template library. Participants cannot create their own templates; there is no template-approval workflow. Managers create and maintain shared templates. Once a template has been used, its Measurement Unit and validation bounds are immutable; its name and description remain editable. A new template is required for different measurement rules. Archiving a template prevents new Habits from selecting it, while existing Habits continue working. See [ADR 0001](adr/0001-preserve-used-template-measurement-rules.md).

The complete course release uses pre-provisioned accounts, login/logout, and documented secure account setup. Provide at least two Participant accounts and one Program Manager account so cross-participant and role restrictions can be demonstrated. Account-management screens, registration, invitations, and password-recovery flows are outside this release. Pre-provisioning does not remove password hashing, session lifecycle, or backend permission requirements.

## Confirmed calendar

Dates are in 2026; course deadlines are at 23:59. The deadline timezone is not specified in the references.

| Checkpoint | Deadline | Required outcome |
| --- | --- | --- |
| Deliverable 1 / Sprint 1 | November 15 | Whole-product baseline and three-sprint allocation, Sprint 1 contracts, and working verified Sprint 1 on main |
| Lab 5 | November 15 | Docker, gated CI/CD, repeatable GCP deployment, and persistent data |
| Lab 6 | November 22 | Independent cross-team UAT, defect handling, and re-test |
| Deliverable 2 | November 29 | All Sprint 2 work complete, Sprint 3 contracts and meaningful tested progress, and deployed integrated candidate |
| Lab 7 | November 29 | Approved maintenance change, regression delivery, metrics, and readiness evidence |
| Final delivery | December 13 | Complete verified three-sprint release, deployment, engineering documents, PDF, and video |

The user confirmed that Deliverable 1 moved from November 8 in the course references to November 15. This correction does not imply a change to any other deadline. Preserve the original references.

Exams run December 1–11. Target substantial product completion by November 29. As of the November 14 planning session, the repository is a starter; Sprint 1 and Lab 5 are due the following day. Feasibility depends on actual team availability and any work completed elsewhere. Do not backdate specifications, test evidence, reviews, or releases.

## Team and delivery approach

Both students share requirements, design, implementation, testing, AI supervision, review, deployment, and maintenance. Rotate responsibilities rather than permanently splitting specification and coding. The user instructed us to assume both students can work full-time. Full-time availability does not establish that the next-day Sprint 1 and Lab 5 deadlines are feasible; cloud setup, independent review, and working software remain on the critical path. Work completed outside this repository has not been reported.

Plan cloud spending against the GCP free trial's $300 credit. The user accepted Cloud Run with an ordinary single-zone Cloud SQL PostgreSQL instance, backups, secrets management, limited application scaling, and pre-provisioning cost estimates. Retain non-upgraded trial billing status. The existence or activation date of a trial project has not been verified. Do not assume authorization to upgrade to paid billing or spend beyond the available credit. No cloud resources have been provisioned during planning.

Google's [Free Program documentation](https://docs.cloud.google.com/free/docs/free-cloud-features) specifies that the $300 credit expires 90 days after signup. Exhaustion or expiry stops resources on a non-upgraded trial account; upgrading permits charges beyond the free credit. The actual credit balance and expiry are deployment prerequisites, not known facts in this plan.

[Cloud SQL pricing](https://cloud.google.com/sql/pricing) confirms that the general trial credit can fund Cloud SQL. An ordinary database instance incurs provisioned-resource charges even without application traffic; [Cloud Run's free allowance](https://cloud.google.com/run/pricing) does not make the database free. Estimate the chosen configuration and ancillary storage, build, secret, backup, logging, and network costs before provisioning. Alerts-only budgets do not stop spending; [spend-cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) have service and enforcement limits and do not provide an architecture-wide hard cap for this application and Cloud SQL.

The separate [30-day Cloud SQL trial instance](https://docs.cloud.google.com/sql/docs/postgres/free-trial-instance) has backup/restore restrictions and suspends service at trial end unless upgraded. It is not the selected persistence baseline for the final submission. The ordinary Cloud SQL instance must support backups and a restore check. Concrete configuration, remaining credit, and expiry still need verification before provisioning; the architecture choice is accepted.

Use GitHub Issues and the project board, feature/fix branches, sprint staging, substantive teammate PR reviews, integration checks, and reviewed releases to main. Capture evidence as work happens. Authentication, authorization, persistence, and a complete domain workflow belong in Sprint 1. CI/CD and GCP delivery must also meet the November 15 Lab 5 checkpoint.

The existing [Habitarc project board](https://github.com/users/thrxpt/projects/13) is available. GitHub currently reports no Actions workflows, configured environments, or deployment records. Docker CLI is installed locally; daemon readiness has not been checked. The GCP CLI is not on the local PATH, so no current GCP project or account has been established from this environment. These observations do not rule out resources or completed work elsewhere.

Course-required engineering artifacts include a whole-product SRS, feature inventory and requirement-to-sprint traceability, system SDS, feature contracts, acceptance criteria, STS, and definition-of-done evidence. Contracts precede their implementations. Verification must include domain rules, real persistence, backend role/ownership restrictions, and selected end-to-end journeys. Lab 6 needs an independent partner team; Lab 7 needs an approved change to already implemented behavior, not an ordinary unimplemented baseline feature.

## Submission policy

Prepare self-contained PDFs embedding the assessed engineering documents and evidence, with navigation and immutable release references. Include a release summary and a final video no longer than four minutes.

This policy satisfies the stricter compatible instructions while the following discrepancies remain explicitly unresolved:

- The final handout specifies both a ten-minute and a four-minute video limit; the master brief specifies ten minutes.
- The master rubric assigns eight points to the video and two to the release summary; the final handout assigns ten to the video.
- The master brief emphasizes a concise evidence index; detailed deliverable handouts require complete assessed documents embedded in the PDF.
- Detailed Lab 5–7 handouts and cloud access instructions are absent from this repository.

Instructor clarification is still needed on conflicting grading instructions. This plan does not claim that clarification has occurred.

## Accepted three-sprint allocation

This is the accepted complete feature baseline. A and B below denote the two students, not known names; each is the other's reviewer. Ownership rotates across design, code, tests, and delivery. The approved ticket breakdown has been published as sub-issues of specification #3; link implementation and verification evidence to those issues and the existing project board.

| Sprint | Working window | Features and primary drivers | Demonstrable outcome |
| --- | --- | --- | --- |
| 1 | November 14–15 | F01 accounts/security (A); F02 templates (B); F03 Habit setup (A); F04 recording/Today (B); F05 persistence/delivery (shared) | Manager defines template → participant sets target/weekdays → records activity → sees persisted accumulated progress; invalid and unauthorized writes fail; the same reviewed release runs on GCP |
| 2 | November 16–22 | F06 history/corrections (A); F07 Goal Revisions (B); F08 lifecycle (A); F09 Streaks (B); F10 Reminders (A) | Correct an entry, observe recalculated history/Streaks, change tomorrow's target without rewriting yesterday, retire a Habit safely, and see a due Reminder; independent UAT and re-tests complete |
| 3 | November 23–29 for feature completion; handoff through December 13 | F11 reports (B); F12 quality/handoff (A and B); M01 approved maintenance exercise (rotate driver from affected feature's original author) | Explain 7/30-date progress using historical rules; verify the complete product, restore a backup, deliver an approved change with regressions, and package an assessed immutable release |

### Sprint 1 sequence and exit gate

1. Confirm the planning baseline and create feature issues/contracts before code. Verify trial access, credit expiry, deployment permissions, and auth/build compatibility immediately; both deployment and authentication are critical-path risks.
2. A establishes the auth/schema/provisioning path while B establishes Docker/CI/GCP connectivity and the template journey. Review contracts and each other's code continuously.
3. Integrate template → Habit → Activity Entry → Daily Total. Keep the date/goal data model capable of the already-agreed history behavior, even before Sprint 2 exposes revisions/corrections.
4. Run real persistence/ownership/concurrency tests, the selected E2E journey, clean build/setup, deployment/redeployment checks, and the deliberately failing CI-gate exercise. Capture genuine red→green evidence for a rule, never reconstructed history.
5. Release reviewed Sprint 1 to main and an immutable tag; prepare Deliverable 1's complete baseline, Sprint 1 contracts, local results, and assessed PDF. Submit Lab 5's Docker/CI/GCP/persistence evidence against the same release where applicable.

Sprint 1 is not done without real authentication/two roles, a complete domain transaction, backend validation/ownership, real persistence, required tests, substantive teammate review, and accepted main integration. Lab 5 independently requires the delivery pipeline and GCP by the same date.

### Sprint 2 sequence and exit gate

- November 16–18: F06/F07 first, because all history-derived features depend on correct dates and revisions. A and B review each other's transactional boundaries.
- November 19–20: F08/F09/F10 and combined regression. Arrange an independent partner team and provide synthetic accounts, versions, and cases before UAT.
- November 21–22: run independent normal, boundary, role/ownership, and history/persistence UAT; triage, fix, and independently re-test accepted defects. Preserve an identifiable reviewed Sprint 2 release and submit Lab 6 evidence by November 22.

Every Sprint 2 AC must pass on the integrated release; no silent deferral to Sprint 3. Demonstrate historical target stability, correction effects, safe retirement, and reminder behavior. Obtain the Lab 7 maintenance request/approval early enough to implement it during Sprint 3; do not manufacture a defect or disguise an unfinished baseline feature as maintenance.

### Sprint 3 sequence and exit gate

- November 23–25: implement F11 with actual 7/30-date rule tests and a working UI; this is the meaningful tested Sprint 3 progress required for Deliverable 2. Implement M01 only after an instructor/TA approves a real change to already delivered behavior.
- November 26–28: finish the baseline, maintenance regression/re-test, accessibility/performance/access checks, timed isolated restore, deployment reproduction, and requirement/result traceability. Resolve release blockers and obtain affected independent UAT re-tests.
- November 29: deliver the integrated candidate, complete Sprint 2 status/evidence and all Sprint 3 contracts/progress/remaining-work details, plus Lab 7's change evidence and five sourced metrics. Target all major product behavior complete at this checkpoint.
- November 30: finish handoff preparation and rehearse the joint demo. December 1–11 are exam dates; reserve them from planned feature work.
- December 12–13: run checks on the final commit, confirm the deployed immutable version and access, finish the self-contained PDF and ≤4-minute joint video, and submit by December 13. Re-record affected evidence if the release changed. Continue access/cost monitoring through grading.

The final gate requires all baseline FR/BR and important NFR outcomes accounted for, required tests enabled, independent acceptance/re-tests, no unresolved release-blocking defect, a recoverable deployment, and documents matching the assessed version. Required unfinished work is not technical debt.

### Dependencies and effort

The product's critical dependency chain is F01 → F02 → F03 → F04 → F06/F07 → F08/F09 → F11. F05 infrastructure starts alongside F01 but cannot pass its acceptance gate without the Sprint 1 journey. F10 relies on date, goal, and lifecycle behavior. F12 integrates all features plus independent UAT and approved M01.

Planning estimates below are judgment ranges, not measured team velocity. One person-day means eight focused working hours; estimates include contracts, code, tests, cross-review, integration, and evidence. Assume two full-time students with ten person-days per normal five-day week, reserving about two for uncertainty. Additional weekend/overtime capacity is not silently assumed.

| Work | Estimated person-days | Capacity implication |
| --- | --- | --- |
| Sprint 1 plus Lab 5 | 6–8 | November 14–15 offers at most four person-days if both entire days are available, and less once the current day has elapsed. The deadline is not supported by this estimate |
| Sprint 2 plus Lab 6 | 6–8 | Fits the normal week's planned capacity if Sprint 1 is already delivered; spillover consumes the UAT buffer |
| Sprint 3 plus Lab 7 and release preparation | 6–8 | Fits a normal week with limited contingency; external change approval and re-tests must arrive promptly |
| Final verification/submission after feature completion | 2–3 | Use November 30 and December 12–13; keep major development out of the exam period |

Sprint 2's official submission deadline remains November 29. Ending its planned feature window earlier creates space for meaningful tested Sprint 3 progress and the approved maintenance change by that same checkpoint. Preserve an identifiable Sprint 2 release before integrating Sprint 3 work. Do not leave core workflows for the December 12–13 period following exams.

Sprint 1 has a concrete capacity shortfall under these estimates. Preserve the user's November 15 deadline as the course target, but seek a dated instructor-approved recovery decision immediately if existing work or measured progress cannot close the gap. Do not claim that full-time availability resolves it. Failure to meet a release gate must be reported honestly, not hidden by shifting required Sprint 1 work to a later sprint. Any approved recovery change requires recomputing Sprint 2/3 capacity and preserving the original baseline.

## Accepted design details and operational prerequisites

Domain decisions Q1–24 and the complete baseline in Q25 are accepted. Q25 also confirms these contract details:

- Better Auth with closed public signup, private operator provisioning, server-owned roles, database-backed revocable seven-day rolling sessions, cross-origin protections, and shared login throttling; prove compatibility before relying on it.
- Quality targets in NFR-01–08: role/ownership tests for every operation, concurrency guarantees, keyboard/contrast/automated accessibility checks, 360px/1280px layouts and zoom, measured warm-response p95 ≤1 second at the stated workload, daily backups, and an isolated restore within 60 minutes.
- UI/calculation edge behavior: zero-obligation reports show “Not scheduled”; archived current Streak is not applicable; lifetime Streaks are labeled separately from reporting-window figures; template unarchiving and report export are outside scope; entry date edits validate both old/new dates and reject stale writes.
- The F01–F12 allocation, two-student role rotation, estimates, and release gates above. Acceptance of the product plan does not establish that the November 15 deadline is achievable.

These are implementation readiness dependencies, not facts the plan can invent:

| Dependency/risk | Responsible action | Latest useful checkpoint |
| --- | --- | --- |
| Sprint 1 capacity shortfall | Both students compare actual progress with gates; obtain instructor-approved recovery if necessary | Immediately, before promising November 15 delivery |
| GCP access, remaining credit, expiry, regional costs/quotas | B verifies trial/project and estimates resources; A reviews cost/secret configuration | Before provisioning, Sprint 1 |
| Auth/library/build compatibility | A proves documented integration and closed-signup provisioning; B tests bypass/revocation behavior | First Sprint 1 work block |
| Lab handouts and deadline timezone | Both students verify the latest course instructions; update this plan with actual authoritative changes | Before each submission |
| Independent UAT partner | A arranges independent testers and cases; B prepares safe accounts/release | Before November 20 |
| Approved maintenance change | B obtains instructor/TA approval; both update impact/contract/test plan | Before November 23 implementation |
| Grading access end date vs credit expiry | B verifies runway; both resolve any mismatch with instructor without unapproved paid upgrade | Before promising assessed availability; monitor through grading |
| Conflicting PDF/video/rubric instructions | Both students obtain clarification; until then retain the stricter compatible submission package | Before final packaging |

No hidden product behavior is deferred to an unspecified future sprint. Actual team names, cloud IDs, issue numbers, test counts, and approvals belong in implementation evidence when known.

The user confirmed shared understanding in Q25, completing the interview required by the invoked [grilling skill](../.agents/skills/grilling/SKILL.md). This baseline is accepted for planning; the operational prerequisites above remain unresolved until verified. Implementation, resource provisioning, publication, and submission are separate work.

## Sources

- [Group work specifications](reference/group_work_specs_v1.md): theme 8, roles, technical requirements, calendar, workflow, and labs.
- [Deliverable 1](reference/project_deliverable_1_v1.md): full-product baseline and Sprint 1 submission.
- [Deliverable 2](reference/project_deliverable_2_v1.md): completed Sprint 2, Sprint 3 progress, and integrated candidate.
- [Final delivery](reference/project_final_delivery_v1.md): final product, verification, evidence, PDF, and video.
- Repository inspection on November 14: one starter route; no domain features, authentication, database, tests, CI, or deployment configuration; no existing GitHub product issues.
- User confirmation in the planning interview: product direction, architecture direction, shared team responsibilities, submission policy, and revised November 15 Sprint 1 deadline.
- User confirmation in the second interview round: Habit/Activity Entry model, minutes/counts with positive whole-number entries, manager-owned template library, pre-provisioned accounts, full-time availability for both students, and use of the GCP $300 free trial credit.
- User confirmation of Q13–18: per-scheduled-day targets, accumulated entries with duplicate-save protection, fixed Account Timezones and seven-date correction window, immutable used-template measurement rules, in-app Reminders, and Cloud Run plus ordinary single-zone Cloud SQL within non-upgraded trial billing.
- User confirmation of Q19–24: tomorrow-effective Goal Revisions, one active Habit per template with future-effective archiving, off-schedule activity without completion credit, scheduled-day Streaks, unit-specific daily ceilings, and per-Habit 7/30-completed-date reports.
- User confirmation of Q25: acceptance of the complete planning baseline, including Better Auth, seven-day rolling sessions, measurable accessibility/performance checks, daily backups, a tested restore within 60 minutes, and the explicit delivery prerequisites and deadline risk. This confirmation does not authorize implementation or cloud provisioning.
