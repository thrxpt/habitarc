# Habitarc

Private study and movement workspaces for pre-provisioned Participants and Program Managers. Built with TanStack Start, Better Auth, Drizzle, and PostgreSQL.

## Local setup

Use the repository’s pinned Vite+ toolchain and Docker Compose. Compose runs PostgreSQL 17 on `127.0.0.1:55432` and creates the development database `habitarc` and test database `habitarc_auth_test`.

```sh
vp install
cp .env.example .env.local
chmod 600 .env.local
docker compose up -d --wait postgres
```

Edit `.env.local`: the example database URLs already match Compose. Privately set `BETTER_AUTH_SECRET` to a generated random secret of at least 32 characters. The application and operator commands load this ignored file using Node’s environment-file support; exported environment variables take precedence. Keep the origin exactly `http://localhost:3000` when using the development command.

```sh
vp run db:migrate
vp run accounts:local
vp run dev
```

`accounts:local` creates `one@example.test`, `two@example.test` (Participants), and `manager@example.test` (Program Manager), with random passwords and the `Asia/Bangkok` Account Timezone. It saves credentials to `~/.local/share/habitarc/local-accounts.json` with permissions `0600` and prints only the path and counts. Open that private file to sign in. Reruns reuse the file and preserve existing accounts. If the file is lost while the accounts still exist, setup stops rather than generating replacement passwords.

For a different private file location, run `vp run accounts:local /absolute/private/accounts.json`. Local generation requires development mode, loopback PostgreSQL, and a file outside the repository. Custom provisioning remains available through `vp run accounts:provision < /private/path/synthetic-accounts.json`. See [authentication and operator instructions](docs/auth.md) for the input format, migrations, production policy, and security boundaries.

## UI components

shadcn/ui uses the Nova style with Base UI primitives. `components.json` configures the CLI, shared components live in `src/components/ui`, and semantic theme tokens in `src/styles.css` retain Habitarc’s palette and fonts. The account screen uses Button, Input, Field, and Alert components.

Add components from the official registry with the project’s Bun runner:

```sh
bunx --bun shadcn@latest add @shadcn/dialog
```

Component imports use `#components/ui/<name>.tsx`; class-name composition imports `cn` directly from the `cn` package. Generated components are maintained source and follow the repository’s TypeScript and accessibility rules. Installed agent-skill examples are excluded from application formatting, lint, and type checks.

## Validation

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database. The database user must be allowed to create databases: integration tests create a uniquely named database and remove only that database afterward. Tests fail when PostgreSQL configuration is missing. Never point tests at a production database.

```sh
vp check
vp run typecheck
vp test
vp run build
```

Start PostgreSQL with Compose before running the suite:

```sh
docker compose up -d --wait postgres
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/habitarc_auth_test
vp test
```

Compose binds PostgreSQL to loopback and uses trust authentication for local development and tests. Production uses private database credentials and Cloud SQL. The named volume preserves local databases across container restarts and `docker compose down`; start again with `docker compose up -d --wait postgres`. The initialization SQL runs only when that volume is first created. Application schema migrations remain an explicit `vp run db:migrate` step.

Stop the local service with:

```sh
docker compose down
```

Export `TEST_DATABASE_URL` in the test shell; the test runner intentionally does not load `.env.local`. The suite covers real PostgreSQL, independent authentication instances/pools, operator commands, rendered forms, and the running TanStack HTTP application. The production build checks client/server separation; it does not deploy cloud resources.

## Continuous integration

[GitHub Actions](https://github.com/thrxpt/habitarc/actions/workflows/ci.yml) runs the `CI / Validate` check for pull requests targeting `main` or `sprint-*` and pushes to those branches. Vite+ comes from the pinned package version, Node.js from `.node-version`, and Bun from `devEngines.packageManager`. Dependencies install with a frozen lockfile; the prepare hook formats Vite+'s generated agent instructions so installation does not introduce formatting failures.

The workflow checks formatting/lint/types and the Drizzle migration history, starts PostgreSQL through the same Docker Compose configuration used locally, runs all tests (failing if none are discovered), and builds the client/server application. Each runner uses disposable database storage and removes its Compose volume afterward. Test accounts and auth secrets are generated by the suite; no production secrets are needed.

The `Validate` check must pass against the current base before merging into `sprint-1` or `main`. Cloud deployment, application-image packaging, and the remaining release acceptance checks are separate work tracked in [issue #8](https://github.com/thrxpt/habitarc/issues/8).
