# Project Deliverable 1 submission package

Team: 67070501063 Theeraphat Jaingam and 67070501058 Chanya Poolketkij. Context: Habit and Activity Tracking for students' study/movement routines. Repository: https://github.com/thrxpt/habitarc.

**Status: review package, awaiting teammate acceptance and reviewed main release.** The PDF is [output/pdf/project-deliverable-1.pdf](../../../output/pdf/project-deliverable-1.pdf). Its actual page map is [page-map.json](page-map.json); the front page contains A–F navigation. Do not submit it as an accepted release while the front cover says PENDING.

## Included content

| Part | Source | Completion evidence |
| --- | --- | --- |
| A | docs/srs.md and GLOSSARY.md | Whole-product scope, numbered FR/BR/NFR, actors, assumptions/decisions |
| B | docs/features.md and docs/traceability.md | All 12 FR / 17 BR / 8 NFR allocated; original planned verification distinguished from actual results |
| C | docs/system-sds.md | Architecture/data, UI/API conventions, role/ownership matrix, credentials/sessions, configuration and future delivery |
| D | docs/sprints/plan.md | Complete three-sprint baseline and explicit Sprint 1 scope/dependencies |
| E | docs/sprints/sprint-1/*.md and dod.md | Five feature designs, all 20 AC/STS pairs and checkpoint DoD; later design clarification dates disclosed |
| F | part-f.md and evidence/ | 92 unit/component/integration tests, 4 Chromium tests, commands/results, screenshots, two test excerpts, real red/green logs/commits, GitHub reviews/board and contributions |

[Part F](part-f.md) is the current execution ledger. Earlier feature documents retain their historical runs; they do not override the current ledger. [submission.json](submission.json) records student IDs and the tested application candidate. [evidence/source-manifest.json](evidence/source-manifest.json) identifies exact tested source/test/migration/config hashes, including the evidence-capture changes to browser tests.

## Remaining handoff gates

Execution order: integrate reviewed PR #31, accept the local release through draft PR #32, then update PR #30 against the latest staging base for Lab 5. Lab 5 is due November 22, 2026; live GCP delivery does not block the November 15 local Deliverable 1 checkpoint. The [teammate acceptance record](acceptance.md) gives the remaining checks and required actual-result fields.

1. Teammate reviews this preparation and its F02 cursor correction, then integrates it into `sprint-1` through the PR. Preserve review findings/fixes in the actual history.
2. Teammate follows clean README setup/migration/private account generation, confirms safe repeated setup and saved retrieval, and records expected/actual outcomes under issue #9. Current tests were executed by an agent and do not replace that acceptance.
3. Review and merge the staging release into `main`, retain an immutable release reference/tag, run the complete commands on that version, and refresh Part F/board/snapshot/source manifest/metadata/PDF. No accepted main release currently exists in this package. Do not point `acceptedReleaseCommit` at an unreviewed candidate to remove the PENDING label.

The package discloses absent original domain-rule red logs, full accessibility/zoom/performance measurements, and later product work. The retained F02 red/green logs are new genuine executions, not reconstructed earlier evidence. Docker/GCP/backup operational acceptance remains Lab 5/later work; it is not a Deliverable 1 cloud requirement.

## Rebuild the PDF

Use a local Python virtual environment. ReportLab 4.5.1 also supports this machine's Python 3.9; no application runtime dependency is added.

```sh
python3 -m venv /tmp/habitarc-pdf-venv
/tmp/habitarc-pdf-venv/bin/pip install reportlab==4.5.1 markdown-it-py==3.0.0 pypdf==6.21.4
/tmp/habitarc-pdf-venv/bin/python scripts/deliverable_pdf.py
```

The generator embeds all assessed source documents, tests excerpts and selected screenshots. It builds twice to resolve actual A–F page ranges and fails if pagination changes or any tested source hash differs from the manifest. It does not run tests, fetch GitHub, create/approve a release, or infer a passing result. Edit the evidence ledger only from real fresh results and update the manifest only after verification. Do not store credentials/session tokens in screenshots, logs or metadata.

After changing content, render the PDF with Poppler and inspect its pages at normal size:

```sh
mkdir -p /tmp/habitarc-pdf-review
pdftoppm -r 100 -png output/pdf/project-deliverable-1.pdf /tmp/habitarc-pdf-review/page
```

Successful Chromium surfaces are written by the existing browser journeys into ignored `test-results/`; copy the selected images to `evidence/` only from the matching verified run. Raw logs retain exact test names, counts and durations. GitHub evidence is a dated snapshot, so later board/releases must be explicitly refreshed.
