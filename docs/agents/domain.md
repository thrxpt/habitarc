# Domain docs

This repository uses a single-context domain documentation layout:

- `GLOSSARY.md` at the repository root defines domain vocabulary.
- `docs/adr/` contains architectural decision records.

## Before exploring

Read `GLOSSARY.md` and ADRs relevant to the area being explored.

If these files or directories do not exist, proceed silently. The domain-modeling skill creates them when terms or decisions are resolved.

## Use the glossary's vocabulary

Use defined domain terms in issue titles, proposals, tests, and code. Follow any guidance about synonyms to avoid.

If a needed term is missing, reconsider whether it belongs to the project's vocabulary or note the gap for domain-modeling.

## Surface ADR conflicts

Explicitly identify proposals that contradict an existing ADR. Name the ADR and explain why its decision should be reconsidered.
