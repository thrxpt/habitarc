# Habitarc software requirements

Status: accepted requirements baseline following user confirmation of Q25. All requirements below are planned, not implemented or verified. Course sources and deadline corrections are recorded in [the product plan](sprints/plan.md).

## Problem, actors, and scope

Students need a quick way to record study and movement, compare activity with realistic daily commitments, and see reliable progress over time. Habitarc supports this through manager-maintained templates, private personal Habits, measured Activity Entries, and understandable history. Use the canonical terms in [the glossary](../GLOSSARY.md).

- Participants select templates, manage their own Habits, record/correct their own activity, and view their own progress.
- Program Managers maintain the shared template library. Their role grants no access to participant Habits, entries, reports, or histories.
- Operators provision accounts and deployment resources through documented tooling. Operator access is not a third application role or an account-management UI.

The course release uses synthetic data and pre-provisioned accounts. Exclude public onboarding, registration/recovery/invitations, participant-created templates, consent sharing, social features, medical advice, wearables, standalone journaling, unit conversion, fractional entries, weekly quotas, timezone editing, pause/reactivation, and external/background notifications. Reports are in-app; file export is not part of the baseline.

## Functional requirements

| ID | Required observable behavior |
| --- | --- |
| FR-01 | Login, logout, and show current identity using real pre-provisioned Participant/Program Manager accounts |
| FR-02 | Enforce role and ownership permissions on every backend read and write |
| FR-03 | Managers create templates with name, description, unit, and per-entry bounds; participants browse selectable templates |
| FR-04 | Participants create a Habit with a Daily Target and selected weekdays, subject to one active Habit per template |
| FR-05 | Participants record activity for eligible dates, safely retry saves, and see persisted Daily Totals and progress |
| FR-06 | Participants inspect dated entry history and edit/delete eligible entries with recalculated results |
| FR-07 | Participants revise future targets/schedules while earlier dates retain their applicable rules |
| FR-08 | Managers maintain/archive templates; participants archive Habits without deleting history |
| FR-09 | Participants see current/longest Streaks with scheduled-date and correction semantics |
| FR-10 | Participants configure an optional local Reminder time and see its due indicator in-app |
| FR-11 | Participants see seven-/thirty-completed-date reports for each Habit, with today separate |
| FR-12 | Reproduce, verify, deploy, restore, and hand off the assessed release with durable data and traceable evidence |

## Confirmed business rules

| ID | Rule |
| --- | --- |
| BR-01 | Participant records are private; Program Manager permissions cover templates only. Each Activity Entry belongs to exactly one owned Habit |
| BR-02 | Each template uses minutes or counts. Bounds are whole numbers with 1 ≤ minimum ≤ maximum ≤ the unit's daily ceiling |
| BR-03 | Entry amounts are whole numbers within template bounds. Daily Targets are whole numbers at least the template minimum and at most the unit ceiling; targets may exceed the per-entry maximum |
| BR-04 | Unit ceilings are 1,440 minutes or 1,000,000 counts per Habit/date, applying to Daily Targets and accumulated Daily Totals. Reject writes that would exceed a ceiling, including concurrent writes |
| BR-05 | A Schedule selects at least one weekday; selecting all seven means every day. One target applies separately to each scheduled date; no weekly pooling |
| BR-06 | Multiple deliberate entries accumulate. Retrying the same save counts once; identical values from separate deliberate submissions are distinct activity |
| BR-07 | Calendar dates follow the fixed Account Timezone, default Asia/Bangkok. Device timezone changes cannot move entries or redefine today |
| BR-08 | A Habit starts on its creation date. Entry writes are permitted only for today or the preceding six account-calendar dates and within the Habit's tracking period. Future, pre-start, and older dates are rejected |
| BR-09 | Off-schedule activity is permitted within the tracking period and correction window. It contributes to totals/history but not obligations, completion credit, or Streaks |
| BR-10 | Target/schedule changes start tomorrow. Repeated edits today replace the pending revision. Historical dates use their original applicable revision; entry corrections may recalculate results |
| BR-11 | At most one active Habit per participant/template. Archiving takes effect tomorrow, retains today's obligation/history, and permits eligible corrections to earlier dates. No pause/reactivation; a later Habit starts fresh |
| BR-12 | Once a template has been used, its unit/bounds cannot change. Descriptive text can change. Archived templates cannot supply new Habits; existing Habits continue working |
| BR-13 | A scheduled date is complete when total ≥ applicable target. Display actual amount/percentage above target; cap visual progress bars at 100%. Unscheduled dates have no completion percentage |
| BR-14 | A Streak counts consecutive completed scheduled dates. Unscheduled dates neither extend nor break it. An unfinished scheduled today breaks it only after the date ends. Eligible corrections recalculate current/longest Streaks |
| BR-15 | A Reminder has one optional local time. Its in-app due indicator requires a scheduled current date, reminder time passed, and unmet Daily Target. No background delivery or snooze |
| BR-16 | Reports cover the last seven or thirty completed calendar dates, ending yesterday; today is separate. Count only dates within the Habit's tracking period. Completion Rate = completed scheduled dates / scheduled dates; off-schedule amounts remain in totals |
| BR-17 | Report activity totals per Habit, never combine unrelated activities. Apply the revision effective on each date. A zero scheduled-date denominator displays “Not scheduled”, not 0% |

BR-02's ceiling validation and BR-17's empty-denominator presentation make the confirmed bounds/reporting rules executable; these contract details were accepted in Q25.

## Accepted measurable quality requirements

These targets are accepted planning requirements, not achieved results or claims of a full compliance audit.

| ID | Target and measurement | When |
| --- | --- | --- |
| NFR-01 Security | Every protected operation has anonymous, forbidden-role, and cross-participant checks where applicable; zero unauthorized disclosures or writes. Secure password hashing, server-validated revocable sessions, cookie/CSRF protections, and shared login throttling must be tested | Every sprint |
| NFR-02 Correctness under concurrency | Replayed creates never duplicate activity; concurrent writes cannot exceed daily ceilings or create overlapping active Habits; stale edits fail visibly rather than silently overwrite | Sprint 1 foundations; all mutations as introduced |
| NFR-03 Accessibility | Target WCAG 2.2 AA for delivered screens. Critical journeys work by keyboard with visible focus, labeled fields, announced errors, and usable contrast; zero serious/critical automated accessibility findings on those screens. Manual checks remain necessary | From Sprint 1; measured final suite in Sprint 3 |
| NFR-04 Responsive behavior | Complete core journeys at 360px and 1280px viewport widths without page-level horizontal overflow or inaccessible controls; verify 200% zoom | Every sprint |
| NFR-05 Performance | With 10 concurrent authenticated test users, 10 Habits per participant and up to 10,000 entries each, warm-instance p95 backend read/write response ≤1 second and 0 unexpected errors during a 5-minute mixed workload. Measure cold first-use separately and report it without hiding scale-to-zero latency | Baseline in Sprint 1; final measurement in Sprint 3 |
| NFR-06 Durability/recovery | Retrieve the same seeded IDs and amounts after application restart/redeployment. Daily DB backups; demonstrate restoration to an isolated test database within 60 minutes with ≤24-hour recovery-point age. Never overwrite the assessed DB during the exercise | Persistence gate Sprint 1; timed restore evidence Sprint 3 |
| NFR-07 Reproducibility/delivery | A teammate can use documented clean setup, migrations, seed, build, and tests; PR failures block integration/release; deployed image identifies the submitted commit; final verification uses that commit | Every release |
| NFR-08 Cost/access continuity | Estimate all selected resources before provisioning; check remaining credit/expiry daily while deployed, use alerts and bounded scaling, retain non-upgraded trial billing, and keep the assessed release accessible through the instructor's grading period | Before provisioning through grading |

No high-availability SLA is promised for the single-zone course deployment. Credit expiry, billing state, grading-period duration, and provider quotas are operational prerequisites; failure to satisfy them blocks the deployment plan rather than silently authorizing paid upgrades.

## Scope changes

Requirements have stable IDs. Proposed removals, changed rules, or sprint moves must identify affected features, acceptance criteria, tests, documents, and course approvals. Preserve original contracts and actual chronology. An incomplete requirement remains incomplete until verified; it cannot be renamed as technical debt to claim completion.

Implementation and execution evidence are intentionally absent from this planning baseline. The [feature inventory](features.md) lists the complete feature scope and dependencies; the [traceability matrix](traceability.md) maps every requirement to features, sprints, and planned AC/STS. [Sprint contracts](sprints/README.md) define observable acceptance criteria and planned verification, while the [System-Level SDS](system-sds.md) defines their accepted implementation boundaries.
