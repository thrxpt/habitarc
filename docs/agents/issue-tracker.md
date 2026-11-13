# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `thrxpt/habitarc`. Use the `gh` CLI from this repository.

## Conventions

- Verify the target with `gh repo view --json nameWithOwner` before the first issue creation of a session. It must be `thrxpt/habitarc`.
- Create: `gh issue create --title "..." --body-file <path>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open`, with label filters as needed.
- Comment: `gh issue comment <number> --body-file <path>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post the explanation as a separate comment, then run `gh issue close <number>`. Comment separately even if already closed.

Use a file containing actual newlines for multiline bodies.

## Parent issues and blockers

Prefer native GitHub sub-issues and issue dependencies.

With gh 2.94+, use `gh issue create --parent <parent>` or `gh issue edit <parent> --add-sub-issue <child>` for sub-issues. If unavailable, put `Part of #<parent>` at the top of the child body and link the child in the parent's task list.

With gh 2.94+, use `gh issue edit <child> --add-blocked-by <blocker>` for dependencies. If unavailable, put `Blocked by: #<number>, #<number>` at the top of the child body. A ticket is unblocked when every blocker is closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

When a skill says "publish to the issue tracker", create a GitHub issue. When a skill says "fetch the relevant ticket", read the GitHub issue.
