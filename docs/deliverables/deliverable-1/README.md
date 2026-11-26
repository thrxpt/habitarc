# Project Deliverable 1 submission package

Team: 67070501063 Theeraphat Jaingam and 67070501058 Chanya Poolketkij. Context: Habit and Activity Tracking for students' study/movement routines. Repository: https://github.com/thrxpt/habitarc.

**Status: submission edition for reviewed main release `9be6a80041c732cac97e20b87c83dfe8153f42ce`.** The final file is [output/pdf/project-deliverable-1.pdf](../../../output/pdf/project-deliverable-1.pdf), with actual A–F page navigation in [page-map.json](page-map.json). Parts A–E and selected execution/process evidence are embedded. Known verification gaps, including unrecorded teammate clean setup, are disclosed in Part F; this is not a claim that every Product DoD condition passed.

## Included content

| Part | Source | Completion evidence |
| --- | --- | --- |
| A | docs/srs.md and GLOSSARY.md | Whole-product scope, numbered FR/BR/NFR, actors, assumptions/decisions |
| B | docs/features.md and docs/traceability.md | All 12 FR / 17 BR / 8 NFR allocated; original planned verification distinguished from actual results |
| C | docs/system-sds.md | Architecture/data, UI/API conventions, role/ownership matrix, credentials/sessions, configuration and future delivery |
| D | docs/sprints/plan.md | Complete three-sprint baseline and explicit Sprint 1 scope/dependencies |
| E | docs/sprints/sprint-1/*.md and dod.md | Five feature designs, all 20 AC/STS pairs and checkpoint DoD; later design clarification dates disclosed |
| F | part-f.md and evidence/ | 92 unit/component/integration tests, 4 Chromium tests, commands/results, screenshots, two test excerpts, real red/green logs/commits, GitHub reviews/board and contributions |

[Part F](part-f.md) is the current execution ledger. Earlier feature documents retain their historical runs; they do not override the current ledger. [submission.json](submission.json) records student IDs and the tested main release. [evidence/source-manifest.json](evidence/source-manifest.json) identifies exact tested source/test/migration/config hashes, including the evidence-capture changes to browser tests.

## Release and remaining work

PR #31 was approved/merged into sprint-1 and PR #32 was approved/merged into main by chanya06. The exact assessed release is recorded in submission.json and freshly re-verified in Part F. PR #30 remains a separate open Lab 5 delivery preparation; its code/test counts are excluded from this submission release. Lab 5 is due November 22, 2026.

The [teammate acceptance record](acceptance.md) still lacks the independent clean-setup result for AC-F05-1. Issue #9 remains open and In progress for that and its Lab 5 criteria. The report explicitly discloses missing historical domain-rule red logs, unexecuted quality measurements and later product allocation. No agent result is attributed to a student, and no live cloud result is invented.

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
