# Habitarc feature inventory

Status: accepted whole-product planning baseline. Every feature is PLANNED; a published issue or contract is not evidence of implementation or a passing test.

Read the [SRS](srs.md) for requirement definitions, [traceability](traceability.md) for complete FR/BR/NFR coverage, [System-Level SDS](system-sds.md) for system responsibilities, and [three-sprint plan](sprints/plan.md) for goals and release gates.

## Features

| ID | Feature and contract/STS | Related requirements | Dependencies | Sprint | Implementation tickets | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | [Accounts and authorization](sprints/sprint-1/f01-accounts-and-authorization.md) | FR-01–02, BR-01/07, NFR-01/07 | None | 1 | [#4](https://github.com/thrxpt/habitarc/issues/4) | PLANNED |
| F02 | [Template creation and selection](sprints/sprint-1/f02-template-creation-and-selection.md) | FR-03, BR-02/12, NFR-01 | F01 | 1 | [#5](https://github.com/thrxpt/habitarc/issues/5) | PLANNED |
| F03 | [Habit setup](sprints/sprint-1/f03-habit-setup.md) | FR-04, BR-01–05/07–08/11–12 | F01, F02 | 1 | [#6](https://github.com/thrxpt/habitarc/issues/6) | PLANNED |
| F04 | [Activity recording and Today](sprints/sprint-1/f04-activity-recording-and-today.md) | FR-05, BR-01/03–09/13, NFR-02/04 | F03 | 1 | [#7](https://github.com/thrxpt/habitarc/issues/7) | PLANNED |
| F05 | [Reproducible persistence and delivery](sprints/sprint-1/f05-reproducible-persistence-and-delivery.md) | FR-12, NFR-06–08 | Infrastructure starts alongside F01; release needs F01–F04 | 1 | [#8](https://github.com/thrxpt/habitarc/issues/8), [#9](https://github.com/thrxpt/habitarc/issues/9) | PLANNED |
| F06 | [History and corrections](sprints/sprint-2/f06-history-and-corrections.md) | FR-06, BR-01/03–09/13, NFR-02 | F04 | 2 | [#10](https://github.com/thrxpt/habitarc/issues/10) | PLANNED |
| F07 | [Goal and schedule revisions](sprints/sprint-2/f07-goal-and-schedule-revisions.md) | FR-07, BR-03–05/10/13 | F03, F06 | 2 | [#11](https://github.com/thrxpt/habitarc/issues/11) | PLANNED |
| F08 | [Template and Habit lifecycle](sprints/sprint-2/f08-template-and-habit-lifecycle.md) | FR-08, BR-08/11–12 | F02, F03, F07 | 2 | [#12](https://github.com/thrxpt/habitarc/issues/12), [#13](https://github.com/thrxpt/habitarc/issues/13) | PLANNED |
| F09 | [Streaks](sprints/sprint-2/f09-streaks.md) | FR-09, BR-05/09–11/14 | F06–F08 | 2 | [#14](https://github.com/thrxpt/habitarc/issues/14) | PLANNED |
| F10 | [In-app Reminders](sprints/sprint-2/f10-in-app-reminders.md) | FR-10, BR-05/07/11/15 | F04, F07, F08 | 2 | [#15](https://github.com/thrxpt/habitarc/issues/15) | PLANNED |
| F11 | [Progress summaries](sprints/sprint-3/f11-progress-summaries.md) | FR-11, BR-09–10/13–14/16–17, NFR-03–05 | F06–F09 | 3 | [#17](https://github.com/thrxpt/habitarc/issues/17) | PLANNED |
| F12 | [Final quality and assessed handoff](sprints/sprint-3/f12-final-quality-and-assessed-handoff.md) | FR-12, NFR-01–08 | All required features, independent UAT, and approved maintenance | 3 | [#16](https://github.com/thrxpt/habitarc/issues/16), [#18](https://github.com/thrxpt/habitarc/issues/18), [#19](https://github.com/thrxpt/habitarc/issues/19), [#21](https://github.com/thrxpt/habitarc/issues/21), [#22](https://github.com/thrxpt/habitarc/issues/22) | PLANNED |

Feature dependencies summarize the accepted contracts. The approved 19 vertical tickets are native sub-issues of [specification #3](https://github.com/thrxpt/habitarc/issues/3); their native blocking edges govern the finer-grained execution frontier. In particular, template maintenance and Habit archiving are separate slices, and deployment can begin before the entire tracking journey is ready.

Cross-cutting security, accessibility, responsive behavior, concurrency, and evidence obligations apply as each relevant operation/screen is introduced. F12 measures the final integrated product; it does not defer those responsibilities until Sprint 3. The [traceability matrix](traceability.md) names establishment and verification sprints for these requirements.

## Separate maintenance obligation

[M01 / ticket #20](https://github.com/thrxpt/habitarc/issues/20) is the Lab 7 instructor/TA-approved change to already implemented behavior. It is not an extra invented baseline feature and cannot substitute for unfinished F01–F12 work. The actual approved request remains an external execution prerequisite.

## Change and completion tracking

Keep IDs stable. Record approved scope or sprint changes with affected requirements, contracts, tests, and releases. Actual evidence belongs in the verification ledger described by the [shared Definition of Done](sprints/README.md#definition-of-done-and-evidence-protocol); disclose incomplete, failed, and skipped work.
