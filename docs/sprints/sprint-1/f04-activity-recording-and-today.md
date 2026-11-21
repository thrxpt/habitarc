# F04 — Activity recording and Today

Status: implemented and integrated into `sprint-1` through reviewed PR #28. Current execution results and remaining release gates are recorded in the [Deliverable 1 evidence ledger](../../deliverables/deliverable-1/part-f.md). The reviewed increment is now released on main through PR #32; its exact version and known verification gaps are recorded in Part F.

Sprint 1. FR-05, BR-01/03–09/13, NFR-02/04. Depends on F03. Owner B; A reviews. Today is the first complete participant journey.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F04-1 / STS-F04-1 | Integration + E2E | For target 60, record two deliberate 25-minute entries, reload, then add 25 more | Totals are 50 then 75; actual progress is 125%, fill stops at 100%; entries remain individually visible |
| AC-F04-2 / STS-F04-2 | Integration | Retry one save concurrently with the same request key/payload; reuse its key with a different amount | Only one entry is created; changed-payload reuse returns conflict; separate deliberate keys still create separate entries |
| AC-F04-3 / STS-F04-3 | Unit + integration | Around account midnight, test today−6, today−7, tomorrow, pre-start, off-schedule, and another device timezone | Only eligible account dates are writable; off-schedule activity is retained without completion credit; device timezone has no effect |
| AC-F04-4 / STS-F04-4 | Integration | Start at 1,430 minutes and race two +10 writes; exercise count ceiling, zero, fractions, and range violations | No total exceeds its unit ceiling; exactly one +10 succeeds; rejected operations leave no partial record/receipt |
| AC-F04-5 / STS-F04-5 | E2E | Lose a save response and retry; simulate backend failure; inspect empty state and reload | Safe retry cannot duplicate activity; failure is never labeled saved; empty state directs to Habit setup |

## Feature design: UI and application contract

Today is Participant-only. Show the Account Timezone/date, scheduled Habits with Daily Total/target, numeric percentage and capped progress fill, a separate unscheduled section, and individually visible entries. No active Habits directs the participant to the template library. Each Habit has an entry form with amount, eligible activity date, template range, and save status. Pending writes disable submission. An uncertain response keeps its payload/request key across closing/reopening and Habit switching; Retry save resends that request. Only a confirmed created/replayed response is labeled saved. A changed payload receives a new request key. Reload retrieves authoritative persisted totals.

`getToday` is a GET TanStack server function under `/_serverFn/<generated-id>` with no caller identity/date input. It returns `{accountDate, timezone, scheduled, unscheduled}`. Each item contains the owned Habit/template/current Goal Revision, progress, today's individual entries, and writable date bounds. Only a validated Participant session may read it.

`createEntry` is a POST server function with `{habitId, activityDate, amount, requestKey}`; IDs are nonempty and bounded, request keys are at most 128 characters, activityDate is a real ISO calendar date, and amount is a safe integer within the template's inclusive bounds. The server derives owner and today's date from the session and stored Account Timezone. Eligible dates intersect today minus six through today with the Habit's tracking period. Unscheduled dates are writable without completion credit.

Success is `{kind: "created" | "replayed", entry, dailyTotal}`. HTTP 400 returns `{kind: "invalid", message, fieldErrors}`; 409 returns `{kind: "conflict", message, fieldErrors}` for changed-payload replay/ceiling conflict. Anonymous/wrong-role requests receive 401/403. Missing and another owner's Habit both receive 404 before receipt lookup. Unexpected errors return generic 503. Domain errors survive TanStack serialization as typed response data. No new public REST API is introduced.

## Feature design: transaction and database

Migration `0004_activity-entries.sql` adds `activity_entry` (ID, Habit FK, explicit activity date, amount, version, timestamps) and `mutation_receipt` (actor FK, request key, operation, payload fingerprint, entry/outcome reference), with unique actor/request key and Habit/date indexing. Source entries determine totals; no separately mutable progress counter exists.

Authenticate, lock the Participant row then the Habit row, verify ownership, and only then check actor-scoped receipts. Identical retries replay the stored result; a changed payload conflicts. Validate account date, tracking period, template bounds, and accumulated unit ceiling inside the transaction. Insert entry and receipt atomically. A PostgreSQL trigger repeats persistence invariants for direct writes. Concurrent writes serialize so a 1,430-minute total accepts exactly one of two +10 attempts. Rejections leave neither an entry nor a receipt. Correction/delete APIs belong to F06; receipt retention is already designed to prevent future resurrection.
