# Teammate acceptance record — Deliverable 1

Status: NOT EXECUTED by the teammate. This record is a checklist for AC-F05-1 / STS-F05-1 and release acceptance under issue #9, not a passing result. Agent command results remain in Part F. The reviewer must enter actual observations against the exact reviewed head; do not copy an expected result into the actual column without performing the check.

## Execution identity

| Field | Actual value |
| --- | --- |
| Student tester / GitHub account | PENDING |
| Date, time and timezone | PENDING |
| Tested full commit SHA / branch | PENDING |
| Machine, OS, Node/Bun/Vite+ versions | PENDING |
| Disposable local database identity, excluding credentials | PENDING |
| Related PR and Issue | PR #31; draft release #32; issue #9 |

## Clean local reproduction and acceptance

Use README setup with synthetic accounts and isolated local PostgreSQL. Do not remove another worktree's volume or reset an existing account. Store generated passwords only in the private 0600 credential file, never in the review, PDF, screenshots, or this record.

| Check | Steps and expected observation | Actual observation / evidence | Result |
| --- | --- | --- | --- |
| Setup | Follow README install, private environment configuration, PostgreSQL startup, migrations and local account generation. Sign in with generated Participant and Program Manager accounts; current identity/role is correct | PENDING | NOT EXECUTED |
| Complete domain journey | Manager creates a unique minutes template with bounds 5–45. Participant starts an every-day Habit with target 60; save two deliberate +25 entries, reload and see 50; add +25 and retrieve 75/60, 125%, with three entries | PENDING | NOT EXECUTED |
| Rule rejection | Submit target 4.5 / no weekdays, then an out-of-range entry. Observe rejection without a partial stored record; correct input and continue | PENDING | NOT EXECUTED |
| Backend access | Run the actual auth/entry HTTP integration tests for anonymous 401, forbidden manager 403, and another Participant's private Habit 404. Inspect assertions; a hidden UI control is not authorization evidence | PENDING | NOT EXECUTED |
| Safe repeat setup and restart | Retain sample synthetic Habit/entry IDs and amounts. Repeat migrations/account setup and restart only the app against the same database. Existing passwords still work and the same saved records/amounts remain | PENDING | NOT EXECUTED |
| Automated verification | Execute `vp check`, `vp run typecheck`, `vp exec drizzle-kit check`, `vp test --run --passWithNoTests=false`, `vp run test:e2e`, and `vp run build`. Record real counts, failures/skips, output reference, and tested SHA | PENDING | NOT EXECUTED |
| Review and release | Review #31's contracts/evidence and cursor fix with a specific finding/check/reason. After staging integration, review #32's exact head and results; record accepted main commit/tag. Refresh Part F, metadata and PDF only from actual results | PENDING | NOT EXECUTED |

Post the completed execution identity and result table in issue #9 with evidence links. Record any failure and its follow-up rather than approving around it. GitHub review belongs on the PR under the teammate's own identity. Cloud provisioning/deployment, production-image and backup proof remain separate Lab 5 work due November 22; they do not substitute for these local acceptance checks.
