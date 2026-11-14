# Habitarc

Private study and movement workspaces for pre-provisioned Participants and Program Managers. Built with TanStack Start, Better Auth, Drizzle, and PostgreSQL.

## Local setup

Use the repository’s pinned Vite+ toolchain and a running PostgreSQL 17 instance.

```sh
vp install
cp .env.example .env.local
chmod 600 .env.local
```

Edit `.env.local`: point `DATABASE_URL` at your development database and privately set `BETTER_AUTH_SECRET` to a generated random secret of at least 32 characters. The application and operator commands load this ignored file using Node’s environment-file support; exported environment variables take precedence. Keep the origin exactly `http://localhost:3000` when using the development command.

```sh
vp run db:migrate
vp run accounts:provision < /private/path/synthetic-accounts.json
vp run dev
```

Provisioning takes a private JSON array through stdin, with at least two Participants and one Program Manager. It never prints credentials or changes existing accounts. See [authentication and operator instructions](docs/auth.md) for the input format, migrations, production policy, and security boundaries.

## Validation

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database. The database user must be allowed to create databases: integration tests create a uniquely named database and remove only that database afterward. Tests fail when PostgreSQL configuration is missing. Never point tests at a production database.

```sh
vp check
vp run typecheck
vp test
vp run build
```

A local disposable test server can be started with:

```sh
docker run --name habitarc-postgres-test -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=habitarc_auth_test -p 127.0.0.1:55432:5432 -d postgres:17-alpine
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/habitarc_auth_test
vp test
```

This loopback-only container uses trust authentication for disposable local tests. Production uses private database credentials and Cloud SQL. Create a separate development database before running the application’s migrations and provisioning commands.

Export `TEST_DATABASE_URL` in the test shell; the test runner intentionally does not load `.env.local`. The suite covers real PostgreSQL, independent authentication instances/pools, operator commands, rendered forms, and the running TanStack HTTP application. The production build checks client/server separation; it does not deploy cloud resources.
